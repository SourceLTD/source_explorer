#!/bin/bash

# Script to completely remove the Lambda function and all associated resources
set -e

# Configuration
FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-llm-job-poller}"
REGION="${AWS_REGION:-us-east-1}"
ROLE_NAME="${FUNCTION_NAME}-role"
RULE_NAME="${FUNCTION_NAME}-schedule"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}🗑️  Destroying Lambda function and resources${NC}"
echo ""

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Remove EventBridge rule and targets
echo "Removing EventBridge rule..."
aws events remove-targets \
  --rule "$RULE_NAME" \
  --ids 1 \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null || echo "No targets to remove"

aws events delete-rule \
  --name "$RULE_NAME" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null || echo "Rule doesn't exist"

# Delete Lambda function
echo "Deleting Lambda function..."
aws lambda delete-function \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null || echo "Function doesn't exist"

# Detach policies from role
echo "Detaching IAM policies..."
aws iam detach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
  --no-cli-pager 2>/dev/null || true

aws iam detach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" \
  --no-cli-pager 2>/dev/null || true

# Delete IAM role
echo "Deleting IAM role..."
aws iam delete-role \
  --role-name "$ROLE_NAME" \
  --no-cli-pager 2>/dev/null || echo "Role doesn't exist"

echo ""
echo -e "${YELLOW}✅ All resources removed${NC}"
echo ""

