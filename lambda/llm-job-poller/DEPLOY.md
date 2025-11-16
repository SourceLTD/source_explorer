# Automated Deployment Guide

Deploy the LLM Job Poller Lambda function without touching the AWS Console.

## Prerequisites

- AWS CLI configured with credentials (`aws configure`)
- Node.js 20+
- Your database and OpenAI credentials

## Option 1: Automated Bash Script (Recommended)

The simplest way - one command deployment.

### Setup

```bash
cd lambda/llm-job-poller

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env  # or use your favorite editor
```

Edit `.env`:

```bash
DATABASE_URL="postgresql://user:password@host:5432/database"
OPENAI_API_KEY="sk-..."
AWS_REGION="us-east-1"
```

### Deploy

```bash
# Make scripts executable
chmod +x deploy-complete.sh destroy.sh

# Deploy everything
source .env && ./deploy-complete.sh
```

This script will:
- ✅ Create IAM role with proper permissions
- ✅ Build and package your function
- ✅ Create/update Lambda function
- ✅ Configure environment variables
- ✅ Set up EventBridge scheduled trigger (30 seconds)
- ✅ Test the deployment

### Customize Deployment

```bash
# Use different region
export AWS_REGION="eu-west-1"

# Change function name
export LAMBDA_FUNCTION_NAME="my-custom-poller"

# Adjust polling rate
export POLL_RATE="rate(1 minute)"

# Deploy with custom settings
source .env && ./deploy-complete.sh
```

### VPC Configuration

If your database is in a private VPC:

```bash
# Add to .env or export
export VPC_SUBNET_IDS="subnet-xxx,subnet-yyy"
export VPC_SECURITY_GROUP_IDS="sg-xxx"

source .env && ./deploy-complete.sh
```

### Update Function

After making code changes:

```bash
source .env && ./deploy-complete.sh
```

The script detects existing resources and updates them.

### Destroy Everything

```bash
./destroy.sh
```

## Option 2: AWS CDK (Infrastructure as Code)

For teams wanting version-controlled infrastructure with TypeScript.

### Setup

```bash
# Install CDK globally
npm install -g aws-cdk

# Install CDK dependencies
npm install aws-cdk-lib constructs
```

### Deploy

```bash
# Set environment variables
export DATABASE_URL="postgresql://..."
export OPENAI_API_KEY="sk-..."

# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy
cdk deploy
```

### Update

```bash
cdk deploy
```

### Destroy

```bash
cdk destroy
```

### CDK Advantages

- Version control your infrastructure
- TypeScript type safety
- Better for teams
- Easy to extend (add alarms, dashboards, etc.)

## Option 3: Terraform

If you prefer Terraform, create `main.tf`:

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "openai_api_key" {
  type      = string
  sensitive = true
}

# IAM Role
resource "aws_iam_role" "lambda_role" {
  name = "llm-job-poller-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda Function
resource "aws_lambda_function" "poller" {
  filename         = "function.zip"
  function_name    = "llm-job-poller"
  role            = aws_iam_role.lambda_role.arn
  handler         = "dist/index.handler"
  runtime         = "nodejs20.x"
  timeout         = 300
  memory_size     = 512
  architectures   = ["arm64"]

  environment {
    variables = {
      DATABASE_URL    = var.database_url
      OPENAI_API_KEY = var.openai_api_key
    }
  }
}

# EventBridge Rule
resource "aws_cloudwatch_event_rule" "schedule" {
  name                = "llm-job-poller-schedule"
  schedule_expression = "rate(30 seconds)"
}

resource "aws_cloudwatch_event_target" "lambda" {
  rule      = aws_cloudwatch_event_rule.schedule.name
  target_id = "lambda"
  arn       = aws_lambda_function.poller.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.poller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule.arn
}

# Outputs
output "function_name" {
  value = aws_lambda_function.poller.function_name
}

output "function_arn" {
  value = aws_lambda_function.poller.arn
}
```

Deploy with:

```bash
# Build package first
npm install && npm run package

# Deploy infrastructure
terraform init
terraform apply \
  -var="database_url=postgresql://..." \
  -var="openai_api_key=sk-..."
```

## Monitoring & Management

### View Logs

```bash
# Tail logs in real-time
aws logs tail /aws/lambda/llm-job-poller --follow

# Last 10 minutes
aws logs tail /aws/lambda/llm-job-poller --since 10m
```

### Manual Test

```bash
aws lambda invoke --function-name llm-job-poller output.json
cat output.json
```

### Update Environment Variables

```bash
aws lambda update-function-configuration \
  --function-name llm-job-poller \
  --environment "Variables={DATABASE_URL=postgresql://...,OPENAI_API_KEY=sk-...}"
```

### Change Polling Rate

```bash
aws events put-rule \
  --name llm-job-poller-schedule \
  --schedule-expression "rate(1 minute)"
```

### Get Function Info

```bash
aws lambda get-function --function-name llm-job-poller
```

## Troubleshooting

### "Role not ready" error

The IAM role needs time to propagate. The script waits 10 seconds, but if you still get errors:

```bash
# Wait a bit longer and retry
sleep 20
source .env && ./deploy-complete.sh
```

### "AccessDeniedException"

Your AWS user/role needs these permissions:
- `lambda:*`
- `iam:CreateRole`, `iam:AttachRolePolicy`, etc.
- `events:PutRule`, `events:PutTargets`
- `logs:*`

### Database connection fails

If using VPC:
1. Ensure subnets have internet access (NAT Gateway)
2. Security groups allow outbound HTTPS (443) for OpenAI
3. Security groups allow database port (5432)

### Function timeout

```bash
# Increase timeout to 10 minutes
aws lambda update-function-configuration \
  --function-name llm-job-poller \
  --timeout 600
```

## Cost Optimization

### Reduce invocation frequency

```bash
# Change from 30 seconds to 2 minutes
export POLL_RATE="rate(2 minutes)"
source .env && ./deploy-complete.sh
```

### Use x86_64 instead of ARM

ARM (Graviton) is 20% cheaper but x86_64 might be faster:

```bash
export LAMBDA_ARCH="x86_64"
source .env && ./deploy-complete.sh
```

## Next Steps

- Set up CloudWatch Alarms for errors
- Add SNS notifications
- Configure RDS Proxy for connection pooling
- Add custom metrics and dashboards
- Implement dead letter queue (DLQ)

See [README.md](./README.md) for full documentation.

