#!/bin/bash

# Deployment script for LLM Job Poller Lambda function
set -e

echo "🔨 Building function..."
npm run build

echo "📦 Creating deployment package..."
npm run package

echo "🚀 Deploying to AWS Lambda..."
if [ -z "$LAMBDA_FUNCTION_NAME" ]; then
  LAMBDA_FUNCTION_NAME="llm-job-poller"
fi

aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --zip-file fileb://function.zip \
  --no-cli-pager

echo "✅ Deployment complete!"
echo ""
echo "View logs with:"
echo "  aws logs tail /aws/lambda/$LAMBDA_FUNCTION_NAME --follow"

