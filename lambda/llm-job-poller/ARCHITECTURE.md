# Architecture Overview

## Before: Frontend-Based Polling

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  AIJobsOverlay.tsx                                    │  │
│  │  • Continuous polling loop (500ms intervals)          │  │
│  │  • For each active job:                               │  │
│  │    - Poll OpenAI API for status                       │  │
│  │    - Update database                                  │  │
│  │  • Problems:                                          │  │
│  │    - Runs in browser tab (stops when tab closed)     │  │
│  │    - Multiple tabs = duplicate polling               │  │
│  │    - Tight coupling between UI and background work   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
                     ┌─────────────┐
                     │   OpenAI    │
                     │     API     │
                     └─────────────┘
                            ↕
                     ┌─────────────┐
                     │  PostgreSQL │
                     │  Database   │
                     └─────────────┘
```

## After: Lambda-Based Polling

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  AIJobsOverlay.tsx                                    │  │
│  │  • Simple 5-second refresh from database              │  │
│  │  • No OpenAI polling logic                            │  │
│  │  • Lighter weight, more efficient                     │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕ (read-only)
                     ┌─────────────┐
                     │  PostgreSQL │
                     │  Database   │
                     └─────────────┘
                            ↕ (read/write)
┌─────────────────────────────────────────────────────────────┐
│                      AWS Lambda                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  llm-job-poller                                       │  │
│  │  Triggered: Every 30 seconds (EventBridge)            │  │
│  │  1. Fetch all active jobs from database               │  │
│  │  2. For each job:                                     │  │
│  │     - Fetch non-terminal items                        │  │
│  │     - Poll OpenAI in parallel batches (20 at a time) │  │
│  │     - Update item statuses                            │  │
│  │     - Update job aggregates                           │  │
│  │  3. Return statistics                                 │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
                     ┌─────────────┐
                     │   OpenAI    │
                     │     API     │
                     └─────────────┘

              ┌────────────────────────┐
              │  EventBridge Rule      │
              │  rate(30 seconds)      │
              │  Triggers Lambda       │
              └────────────────────────┘
```

## Benefits of Lambda Architecture

### 1. **Reliability**
- ✅ Runs independently of browser tabs
- ✅ No duplicate polling from multiple users
- ✅ Continues even when no users are viewing the UI
- ✅ AWS handles retries and error recovery

### 2. **Performance**
- ✅ Parallel processing of multiple items (batch size: 20)
- ✅ Efficient connection pooling
- ✅ No frontend blocking
- ✅ Optimized for throughput over latency

### 3. **Scalability**
- ✅ Handles any number of concurrent jobs
- ✅ Lambda auto-scales as needed
- ✅ No frontend resource constraints
- ✅ Can adjust polling rate independently

### 4. **Separation of Concerns**
- ✅ Backend polling logic separate from UI
- ✅ Frontend focuses on display only
- ✅ Easier to test and debug
- ✅ Independent deployment cycles

### 5. **Cost Efficiency**
- ✅ Only runs when needed (active jobs exist)
- ✅ No idle frontend connections
- ✅ Shared OpenAI rate limits across all users
- ✅ ~$3-5/month (vs frontend polling on every client)

## Data Flow

### Job Submission (Frontend)
```
User clicks "Submit Job"
    ↓
Frontend creates job in DB (status: queued)
    ↓
Frontend submits items to OpenAI batch API
    ↓
Frontend updates items with provider_task_id
    ↓
Job status: running, submitted_items: N
```

### Job Processing (Lambda)
```
EventBridge triggers Lambda every 30s
    ↓
Lambda queries DB for active jobs (status: queued or running)
    ↓
For each job:
    ↓
    Fetch items with status: processing/queued
    ↓
    Poll OpenAI for each item in parallel
    ↓
    Update item status:
        - succeeded → apply flagging result to entity
        - failed → record error
        - processing → keep polling
    ↓
    Update job aggregates:
        - processed_items, succeeded_items, failed_items
        - Check if job is complete
    ↓
    Update job status:
        - All items done → status: completed
        - All items failed → status: failed
        - Otherwise → status: running
```

### Job Viewing (Frontend)
```
User opens AI Jobs Overlay
    ↓
Frontend loads jobs from DB (simple query)
    ↓
User clicks on a job
    ↓
Frontend loads job details + items from DB
    ↓
Every 5 seconds: refresh from DB
    (Lambda keeps DB up-to-date in background)
```

## Configuration

### Lambda Settings
- **Runtime**: Node.js 20.x
- **Memory**: 512 MB
- **Timeout**: 5 minutes (300s)
- **Trigger**: EventBridge rate(30 seconds)
- **VPC**: Same as database (if private)

### Tunable Parameters
```typescript
// In src/index.ts
const CONCURRENT_BATCH_SIZE = 20;  // Items polled in parallel
const MAX_ITEMS_PER_JOB = 50;      // Max items per job per invocation
```

### Frontend Settings
```typescript
// In src/components/AIJobsOverlay.tsx
setInterval(async () => {
  await loadJobs();
  await loadJobDetails(activeJobId);
}, 5000); // 5-second refresh interval
```

## Monitoring

### Lambda Metrics (CloudWatch)
- **Invocations**: ~2,880/day
- **Duration**: 2-10 seconds (depends on active jobs)
- **Errors**: Should be near zero
- **Throttles**: Should be zero

### Application Metrics (Logs)
```json
{
  "jobsPolled": 3,
  "itemsPolled": 45,
  "itemsUpdated": 42,
  "jobsResolved": ["123", "456"],
  "errors": 0
}
```

### Alerts to Set Up
- Lambda error rate > 5%
- Lambda duration > 4 minutes (approaching timeout)
- No Lambda invocations for 5 minutes (EventBridge issue)

## Future Enhancements

### 1. WebSockets for Real-Time Updates
Replace frontend polling with WebSocket push notifications when jobs complete.

```
Lambda completes job
    ↓
Publish to SNS/SQS
    ↓
WebSocket API pushes to connected clients
    ↓
Frontend updates UI immediately
```

### 2. Priority Queue
Process high-priority jobs before low-priority ones.

### 3. Rate Limiting
Respect OpenAI rate limits more intelligently with exponential backoff.

### 4. Cost Optimization
- Use EventBridge scheduler with dynamic intervals
- Only run when active jobs exist
- Use RDS Proxy for connection pooling

### 5. Multi-Region
Deploy Lambda in multiple regions for redundancy.

## Troubleshooting Guide

| Issue | Cause | Solution |
|-------|-------|----------|
| Jobs stuck in "processing" | Lambda not running | Check EventBridge rule is enabled |
| Database connection errors | VPC misconfiguration | Add Lambda to correct subnets + security groups |
| Lambda timeout | Too many items per job | Reduce `MAX_ITEMS_PER_JOB` |
| High costs | Polling too frequently | Increase EventBridge interval to 1 minute |
| Slow updates | Long polling interval | Decrease EventBridge interval to 15 seconds |
| Missing items | Batch size too small | Increase `MAX_ITEMS_PER_JOB` |

## Security Considerations

1. **Secrets Management**: Use AWS Secrets Manager for `DATABASE_URL` and `OPENAI_API_KEY`
2. **IAM Permissions**: Least-privilege role for Lambda
3. **VPC Security**: Private subnets + security groups
4. **Encryption**: At rest (Lambda env vars) and in transit (SSL)
5. **Network**: NAT Gateway for OpenAI API access
6. **Logging**: Enable CloudWatch Logs but redact sensitive data

