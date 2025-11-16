# Quick Start Guide

Get the LLM Job Poller Lambda function running in 10 minutes.

## Prerequisites

- AWS Account with CLI configured (`aws configure`)
- Node.js 20+
- PostgreSQL database accessible from AWS

## Deployment Options

**🚀 RECOMMENDED: Automated Deployment** (no AWS Console needed)
- See [DEPLOY.md](./DEPLOY.md) for fully automated deployment using bash scripts or AWS CDK
- One command deployment: `source .env && ./deploy-complete.sh`

**📖 Manual Deployment** (follow steps below if you prefer the Console)

## Manual Console Steps

### 1. Install & Build

```bash
cd lambda/llm-job-poller
npm install
npm run build
npm run package
```

This creates `function.zip` ready for deployment.

### 2. Create Lambda Function (AWS Console)

1. Open [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. Click **Create function**
3. Configure:
   - **Name**: `llm-job-poller`
   - **Runtime**: Node.js 20.x
   - **Architecture**: arm64 (recommended) or x86_64
4. Click **Create function**

### 3. Upload Code

1. In the **Code** tab, click **Upload from** → **.zip file**
2. Select `function.zip`
3. Click **Save**

### 4. Configure Runtime

1. Go to **Configuration** → **General configuration**
2. Click **Edit**
3. Set:
   - **Handler**: `dist/index.handler`
   - **Timeout**: 5 minutes (300 seconds)
   - **Memory**: 512 MB
4. Click **Save**

### 5. Set Environment Variables

1. Go to **Configuration** → **Environment variables**
2. Click **Edit** → **Add environment variable**
3. Add:
   - `DATABASE_URL`: `postgresql://user:password@host:5432/database`
   - `OPENAI_API_KEY`: `sk-...`
4. Click **Save**

### 6. Configure VPC (if database is private)

1. Go to **Configuration** → **VPC**
2. Click **Edit**
3. Select:
   - VPC where your database lives
   - Private subnets (at least 2 for HA)
   - Security group with database access + internet access
4. Click **Save**

### 7. Test the Function

1. Go to **Test** tab
2. Click **Test** (you can use the default test event)
3. Check execution result and logs

Expected output:
```json
{
  "statusCode": 200,
  "body": "{\"success\":true,\"stats\":{\"jobsPolled\":2,\"itemsPolled\":45,\"itemsUpdated\":42,\"jobsResolved\":[\"123\"],\"errors\":0}}"
}
```

### 8. Set Up Scheduled Trigger

1. Click **Add trigger**
2. Select **EventBridge (CloudWatch Events)**
3. Choose **Create a new rule**
4. Configure:
   - **Rule name**: `llm-job-poller-schedule`
   - **Rule type**: Schedule expression
   - **Schedule expression**: `rate(30 seconds)` (or `rate(1 minute)`)
5. Click **Add**

### 9. Monitor

View logs in real-time:

```bash
aws logs tail /aws/lambda/llm-job-poller --follow
```

Or via AWS Console: CloudWatch → Log groups → `/aws/lambda/llm-job-poller`

## Done!

Your Lambda function is now polling OpenAI every 30 seconds and updating your database.

## Frontend Update

The frontend (`src/components/AIJobsOverlay.tsx`) has been updated to do simple 5-second database refreshes instead of continuous OpenAI polling. No additional changes needed.

## Cost

At 30-second intervals:
- ~2,880 invocations/day
- ~86,400 invocations/month
- Estimated cost: **$3-5/month** (well within free tier for first 12 months)

## Troubleshooting

### "OpenAI client not configured"
→ Add `OPENAI_API_KEY` environment variable

### Database connection timeout
→ Add Lambda to same VPC as database  
→ Configure security groups  
→ Add NAT Gateway for internet access

### Function timeout
→ Reduce `MAX_ITEMS_PER_JOB` in `src/index.ts`  
→ Increase Lambda timeout to 10 minutes

## Next Steps

- Monitor CloudWatch metrics
- Adjust polling rate based on load
- Set up CloudWatch alarms for errors
- Consider RDS Proxy for connection pooling

See [README.md](./README.md) for full documentation.

