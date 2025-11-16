# LLM Job Poller & Submitter - AWS Lambda Function

This AWS Lambda function handles both submission of job items to OpenAI and polling for status updates. It runs independently of your frontend application and can be scheduled to run periodically (e.g., every 30 seconds).

## Architecture

- **Trigger**: EventBridge (CloudWatch Events) scheduled rule or manual invocation
- **Runtime**: Node.js 20.x
- **Dependencies**: Prisma Client, OpenAI SDK
- **Database**: Connects to the same PostgreSQL database as your main application

## Features

### Job Submission (Priority 1)
- Automatically submits up to 1000 queued items to OpenAI per invocation
- Processes items across all active jobs (not per-job limit)
- Parallel submission with retry logic for transient errors
- Updates job status from `queued` → `running`
- Marks failed submissions with detailed error messages

### Job Polling (Priority 2)
- Polls all active jobs for status updates
- Processes up to 1000 items per job per invocation
- Parallel processing with batches of 50 items
- Updates job aggregates and status
- Handles moderation results and applies them to database entities

### General
- Two-phase execution: submission first, then polling
- Efficient connection reuse for Lambda warm starts
- Self-triggering for continuous processing (up to 2 chain depth)
- Automatic cleanup of stuck jobs and timed-out items
- Comprehensive statistics and error reporting

## Quick Start (Automated Deployment)

The fastest way to deploy without using the AWS Console:

```bash
cd lambda/llm-job-poller

# 1. Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and OPENAI_API_KEY

# 2. Deploy everything
source .env && ./deploy-complete.sh
```

That's it! See [DEPLOY.md](./DEPLOY.md) for detailed automated deployment options including AWS CDK and Terraform.

## Manual Setup

### 1. Install Dependencies

```bash
cd lambda/llm-job-poller
npm install
```

### 2. Set Up Prisma Schema

Copy your Prisma schema from the main application:

```bash
cp ../../prisma/schema.prisma ./prisma/schema.prisma
```

Generate Prisma Client:

```bash
npx prisma generate
```

### 3. Build the Function

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### 4. Configure Environment Variables

The Lambda function requires these environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: Your OpenAI API key

These will be configured in AWS Lambda (see deployment section).

## Local Testing

You can test the Lambda function locally using the AWS SAM CLI or by creating a simple test script:

```bash
# Create test.ts
cat > test.ts << 'EOF'
import { handler } from './src/index';

async function test() {
  const result = await handler({}, {} as any);
  console.log('Result:', result);
}

test();
EOF

# Run with environment variables
DATABASE_URL="..." OPENAI_API_KEY="..." tsx test.ts
```

## Deployment to AWS

### Option 1: Manual Deployment via AWS Console

1. **Package the function**:
   ```bash
   npm run package
   ```
   This creates `function.zip` with all code and dependencies.

2. **Create Lambda function in AWS Console**:
   - Go to AWS Lambda Console
   - Click "Create function"
   - Function name: `llm-job-poller`
   - Runtime: Node.js 20.x
   - Architecture: x86_64 (or arm64 for better cost/performance)
   - Upload `function.zip`

3. **Configure the function**:
   - **Handler**: `dist/index.handler`
   - **Timeout**: 5 minutes (300 seconds)
   - **Memory**: 512 MB (adjust based on job size)
   - **Environment variables**:
     - `DATABASE_URL`: Your database connection string
     - `OPENAI_API_KEY`: Your OpenAI API key

4. **VPC Configuration** (if your database is in a VPC):
   - Attach to the same VPC as your database
   - Configure security groups to allow database access
   - Ensure NAT Gateway for internet access (OpenAI API calls)

5. **Create EventBridge Rule**:
   - Go to Amazon EventBridge
   - Create rule
   - Schedule expression: `rate(30 seconds)` or `rate(1 minute)`
   - Target: Your Lambda function

### Option 2: AWS CLI Deployment

```bash
# Create function (first time only)
aws lambda create-function \
  --function-name llm-job-poller \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role \
  --handler dist/index.handler \
  --zip-file fileb://function.zip \
  --timeout 300 \
  --memory-size 512 \
  --environment Variables="{DATABASE_URL=YOUR_DB_URL,OPENAI_API_KEY=YOUR_API_KEY}"

# Update function code (subsequent deployments)
npm run deploy
```

### Option 3: Infrastructure as Code (Terraform)

```hcl
resource "aws_lambda_function" "llm_job_poller" {
  filename         = "function.zip"
  function_name    = "llm-job-poller"
  role            = aws_iam_role.lambda_exec.arn
  handler         = "dist/index.handler"
  runtime         = "nodejs20.x"
  timeout         = 300
  memory_size     = 512

  environment {
    variables = {
      DATABASE_URL    = var.database_url
      OPENAI_API_KEY  = var.openai_api_key
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }
}

resource "aws_cloudwatch_event_rule" "poll_schedule" {
  name                = "llm-job-poller-schedule"
  schedule_expression = "rate(30 seconds)"
}

resource "aws_cloudwatch_event_target" "lambda" {
  rule      = aws_cloudwatch_event_rule.poll_schedule.name
  target_id = "lambda"
  arn       = aws_lambda_function.llm_job_poller.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.llm_job_poller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.poll_schedule.arn
}
```

## Monitoring

### CloudWatch Logs

The function logs to CloudWatch Logs. Log group: `/aws/lambda/llm-job-poller`

Key log messages:
- `[Lambda] Starting LLM job poller`
- `[Lambda] Found X active jobs to poll`
- `[Lambda] Polling job {jobId}`
- `[Lambda] Polling complete: {stats}`

### Metrics

Monitor these CloudWatch metrics:
- **Invocations**: How often the function runs
- **Duration**: Execution time (should be < timeout)
- **Errors**: Failed invocations
- **Throttles**: Rate limiting issues

### Custom Metrics

The function returns statistics in the response:
```json
{
  "success": true,
  "stats": {
    "jobsPolled": 3,
    "itemsPolled": 45,
    "itemsUpdated": 42,
    "jobsResolved": ["123", "456"],
    "errors": 1
  }
}
```

You can parse these from CloudWatch Logs or set up custom CloudWatch metrics.

## Performance Tuning

### Adjust Polling Rate

The default EventBridge schedule is `rate(30 seconds)`. Adjust based on:
- How quickly you need updates
- Number of active jobs
- OpenAI rate limits
- Lambda costs

### Adjust Batch Size

In `src/index.ts`, you can adjust:
- `CONCURRENT_BATCH_SIZE`: Number of items polled in parallel (default: 20)
- `MAX_ITEMS_PER_JOB`: Max items per job per invocation (default: 50)

Higher values = faster processing but more memory and longer execution time.

### Memory and Timeout

- **Memory**: 512 MB is sufficient for most workloads. Increase if you see out-of-memory errors.
- **Timeout**: 5 minutes (300s) should be enough. Reduce if jobs complete faster to save costs.

## Cost Estimation

### Lambda Costs

- **Invocations**: ~2,880 per day at 30-second intervals
- **Duration**: ~2-10 seconds per invocation (depends on active jobs)
- **Memory**: 512 MB

Estimated cost (us-east-1):
- Invocations: 2,880/day × 30 days = 86,400/month → $0.017
- Duration: 86,400 × 5s × 512MB = ~216,000 GB-seconds → $3.60/month
- **Total**: ~$3.62/month (well within free tier for first 12 months)

### Database Costs

- Additional database connections from Lambda
- RDS Proxy recommended for connection pooling if you have many concurrent Lambas

### OpenAI Costs

- Same as before, just shifted from frontend to Lambda
- No additional cost

## Troubleshooting

### "OpenAI client not configured"

- Ensure `OPENAI_API_KEY` environment variable is set in Lambda configuration

### Database connection errors

- Check VPC configuration if database is private
- Verify security groups allow Lambda → RDS traffic
- Ensure NAT Gateway for internet access (OpenAI API)
- Consider using RDS Proxy for connection pooling

### Timeout errors

- Increase Lambda timeout (max 15 minutes)
- Reduce `MAX_ITEMS_PER_JOB` to process fewer items per invocation
- Check OpenAI API response times

### High error rates

- Check CloudWatch Logs for specific errors
- Verify Prisma schema matches database
- Check OpenAI API status

## Frontend Integration

With Lambda handling both submission and polling, the frontend integration is simplified:

### Changes Made:
1. **Submission**: Lambda automatically submits all queued items - no manual frontend submission needed
2. **Polling**: Lambda polls for status updates - frontend just refreshes data from DB
3. **UI**: Frontend UI remains the same - users see the same progress bars and status updates

### How It Works:
1. User creates a job in the frontend → Job and items saved to DB with `status: 'queued'`
2. Lambda runs (scheduled every 30s) → Detects queued items → Submits to OpenAI
3. Lambda continues → Polls already-submitted items → Updates DB with results
4. Frontend refreshes (every 2-5s) → Shows updated progress from DB

### Frontend Code:
The `AIJobsOverlay` component now:
- Removes the `startJobSubmission()` logic (lambda handles submission)
- Keeps simple periodic refresh to show progress
- UI stays exactly the same - transparent to users

```typescript
// Simplified: Just refresh data periodically
useEffect(() => {
  if (!isOpen) return;
  
  const activeJobs = jobs.filter(job => 
    job.status === 'queued' || job.status === 'running'
  );
  if (activeJobs.length === 0) return;

  // Reload data from DB every 2-5 seconds
  // Lambda handles submission and polling in the background
  const interval = setInterval(async () => {
    await loadJobs();
    if (activeJobId && !isCreating) {
      await loadJobDetails(activeJobId);
    }
  }, 3000); // 3-second interval

  return () => clearInterval(interval);
}, [isOpen, jobs, loadJobs, loadJobDetails, activeJobId, isCreating]);
```

## Maintenance

### Updating the Function

1. Make code changes
2. Build: `npm run build`
3. Deploy: `npm run deploy` (or re-upload via console)

### Updating Dependencies

```bash
npm update
npm run build
npm run deploy
```

### Updating Prisma Schema

After database migrations:

```bash
cp ../../prisma/schema.prisma ./prisma/schema.prisma
npx prisma generate
npm run build
npm run deploy
```

## Security

- **Secrets**: Store `DATABASE_URL` and `OPENAI_API_KEY` in AWS Secrets Manager and reference them in Lambda
- **IAM Role**: Use least-privilege IAM roles for Lambda execution
- **VPC**: Place Lambda in private subnets with database access
- **Encryption**: Enable encryption at rest for Lambda environment variables

## Alternatives

If Lambda doesn't suit your needs, consider:
- **ECS Fargate**: Long-running container task
- **EC2 cron job**: Traditional cron on an EC2 instance
- **AWS Step Functions**: For complex workflows
- **Self-hosted worker**: Run as a separate process alongside your Next.js app

