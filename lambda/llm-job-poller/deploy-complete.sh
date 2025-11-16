#!/bin/bash

# Complete automated deployment script for LLM Job Poller Lambda
# This script creates everything from scratch using AWS CLI
set -e

# Configuration
FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-llm-job-poller}"
REGION="${AWS_REGION:-us-east-1}"
RUNTIME="nodejs20.x"
ARCHITECTURE="${LAMBDA_ARCH:-arm64}"
HANDLER="dist/index.handler"
TIMEOUT=300
MEMORY_SIZE=512
SCHEDULE_RATE="${POLL_RATE:-rate(30 seconds)}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting automated Lambda deployment${NC}"
echo ""

# Check required environment variables
if [ -z "$DATABASE_URL" ] || [ -z "$OPENAI_API_KEY" ]; then
  echo -e "${YELLOW}⚠️  Environment variables not set${NC}"
  echo "Please set DATABASE_URL and OPENAI_API_KEY"
  echo ""
  echo "Option 1: Create a .env file and source it:"
  echo "  cp env.example .env"
  echo "  # Edit .env with your values"
  echo "  source .env && ./deploy-complete.sh"
  echo ""
  echo "Option 2: Export them directly:"
  echo "  export DATABASE_URL='postgresql://...'"
  echo "  export OPENAI_API_KEY='sk-...'"
  echo "  ./deploy-complete.sh"
  exit 1
fi

# Get AWS account ID
echo -e "${BLUE}📋 Getting AWS account information...${NC}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: $ACCOUNT_ID"
echo "Region: $REGION"
echo ""

# Step 1: Create IAM role for Lambda
echo -e "${BLUE}🔐 Creating IAM role...${NC}"
ROLE_NAME="${FUNCTION_NAME}-role"

# Check if role already exists
if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
  echo "Role $ROLE_NAME already exists, skipping creation"
else
  # Create trust policy
  cat > /tmp/trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

  # Create role
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document file:///tmp/trust-policy.json \
    --description "Execution role for $FUNCTION_NAME Lambda function" \
    --no-cli-pager

  echo "Created role: $ROLE_NAME"
  
  # Attach basic Lambda execution policy
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
    --no-cli-pager
  
  echo "Attached AWSLambdaBasicExecutionRole policy"
  
  # If VPC access is needed, attach VPC execution policy
  if [ ! -z "$VPC_SUBNET_IDS" ]; then
    aws iam attach-role-policy \
      --role-name "$ROLE_NAME" \
      --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" \
      --no-cli-pager
    echo "Attached AWSLambdaVPCAccessExecutionRole policy"
  fi
  
  # Wait for role to be available
  echo "Waiting for IAM role to propagate..."
  sleep 10
fi

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "Role ARN: $ROLE_ARN"
echo ""

# Step 2: Build and package
echo -e "${BLUE}🔨 Building Lambda function...${NC}"
npm install
npm run build
npm run package
echo ""

# Step 3: Create or update Lambda function
echo -e "${BLUE}📦 Deploying Lambda function...${NC}"

# Check if function exists
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null; then
  echo "Function exists, updating code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://function.zip \
    --region "$REGION" \
    --no-cli-pager
  
  echo "Updating configuration..."
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --handler "$HANDLER" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY_SIZE" \
    --region "$REGION" \
    --no-cli-pager
  
  echo "Updating environment variables..."
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --environment "Variables={DATABASE_URL=${DATABASE_URL},OPENAI_API_KEY=${OPENAI_API_KEY}}" \
    --region "$REGION" \
    --no-cli-pager
else
  echo "Creating new function..."
  
  # Build VPC config if provided
  VPC_CONFIG=""
  if [ ! -z "$VPC_SUBNET_IDS" ] && [ ! -z "$VPC_SECURITY_GROUP_IDS" ]; then
    VPC_CONFIG="--vpc-config SubnetIds=${VPC_SUBNET_IDS},SecurityGroupIds=${VPC_SECURITY_GROUP_IDS}"
    echo "Using VPC configuration"
  fi
  
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --role "$ROLE_ARN" \
    --handler "$HANDLER" \
    --zip-file fileb://function.zip \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY_SIZE" \
    --architectures "$ARCHITECTURE" \
    --environment "Variables={DATABASE_URL=${DATABASE_URL},OPENAI_API_KEY=${OPENAI_API_KEY}}" \
    --region "$REGION" \
    $VPC_CONFIG \
    --no-cli-pager
  
  echo "Created function: $FUNCTION_NAME"
fi

echo ""

# Wait for function to be ready
echo -e "${BLUE}⏳ Waiting for function to be ready...${NC}"
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
echo ""

# Step 4: Set up EventBridge scheduled trigger
echo -e "${BLUE}⏰ Setting up EventBridge schedule...${NC}"
RULE_NAME="${FUNCTION_NAME}-schedule"

# Check if rule exists
if aws events describe-rule --name "$RULE_NAME" --region "$REGION" 2>/dev/null; then
  echo "Rule exists, updating..."
  aws events put-rule \
    --name "$RULE_NAME" \
    --schedule-expression "$SCHEDULE_RATE" \
    --state ENABLED \
    --description "Trigger for $FUNCTION_NAME" \
    --region "$REGION" \
    --no-cli-pager
else
  echo "Creating new rule..."
  aws events put-rule \
    --name "$RULE_NAME" \
    --schedule-expression "$SCHEDULE_RATE" \
    --state ENABLED \
    --description "Trigger for $FUNCTION_NAME" \
    --region "$REGION" \
    --no-cli-pager
fi

# Add Lambda permission for EventBridge to invoke it
STATEMENT_ID="${FUNCTION_NAME}-eventbridge-permission"
aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id "$STATEMENT_ID" \
  --action 'lambda:InvokeFunction' \
  --principal events.amazonaws.com \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null || echo "Permission already exists"

# Add function as target
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=1,Arn=${LAMBDA_ARN}" \
  --region "$REGION" \
  --no-cli-pager

echo "Created EventBridge rule: $RULE_NAME"
echo "Schedule: $SCHEDULE_RATE"
echo ""

# Step 5: Test the function
echo -e "${BLUE}🧪 Testing Lambda function...${NC}"
aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --log-type Tail \
  --query 'LogResult' \
  --output text \
  /tmp/lambda-output.json | base64 -d

echo ""
echo "Function output:"
cat /tmp/lambda-output.json
echo ""

# Clean up temp files
rm -f /tmp/trust-policy.json /tmp/lambda-output.json

# Summary
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${BLUE}📊 Summary:${NC}"
echo "  Function: $FUNCTION_NAME"
echo "  Region: $REGION"
echo "  Schedule: $SCHEDULE_RATE"
echo "  Role: $ROLE_NAME"
echo "  Architecture: $ARCHITECTURE"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "  View logs:"
echo "    aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION"
echo ""
echo "  Test function:"
echo "    aws lambda invoke --function-name $FUNCTION_NAME --region $REGION output.json"
echo ""
echo "  Update schedule:"
echo "    aws events put-rule --name $RULE_NAME --schedule-expression 'rate(1 minute)' --region $REGION"
echo ""
echo "  View metrics:"
echo "    https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/\$252Faws\$252Flambda\$252F${FUNCTION_NAME}"
echo ""

