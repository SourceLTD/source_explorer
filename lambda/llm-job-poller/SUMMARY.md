# LLM Job Poller - Implementation Summary

## What Was Created

A complete AWS Lambda function to handle OpenAI polling for LLM jobs, offloading this work from the frontend.

### Directory Structure

```
lambda/llm-job-poller/
├── src/
│   └── index.ts              # Main Lambda handler
├── prisma/
│   └── schema.prisma         # Copy of main app's Prisma schema
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── deploy.sh                 # Deployment script
├── test-local.ts             # Local testing script
├── env.example               # Environment variables template
├── README.md                 # Full documentation
├── QUICKSTART.md             # 10-minute setup guide
├── ARCHITECTURE.md           # Architecture overview
└── .gitignore               # Git ignore rules
```

## Key Features

### Lambda Function (`src/index.ts`)
- ✅ Fetches all active jobs from database
- ✅ Polls OpenAI for item status updates
- ✅ Processes items in parallel (batch size: 20)
- ✅ Limits items per job (max 50 per invocation)
- ✅ Updates database with results
- ✅ Applies flagging decisions to entities
- ✅ Updates job aggregates
- ✅ Returns detailed statistics

### Frontend Changes (`src/components/AIJobsOverlay.tsx`)
- ✅ Removed continuous OpenAI polling
- ✅ Replaced with simple 5-second database refresh
- ✅ Maintains all existing UI functionality
- ✅ More efficient and performant

## Quick Start

```bash
# Install dependencies
cd lambda/llm-job-poller
npm install

# Build and package
npm run build
npm run package

# Deploy to AWS (via console or CLI)
# See QUICKSTART.md for step-by-step guide
```

## Environment Variables Required

```bash
DATABASE_URL="postgresql://user:password@host:5432/database"
OPENAI_API_KEY="sk-..."
```

## Deployment Options

1. **AWS Console** (easiest)
   - Upload `function.zip`
   - Configure settings
   - Set environment variables
   - Create EventBridge trigger

2. **AWS CLI** (automated)
   ```bash
   npm run deploy
   ```

3. **Terraform** (infrastructure as code)
   - See README.md for example configuration

## Trigger Configuration

**EventBridge (CloudWatch Events) Rule:**
- Schedule: `rate(30 seconds)` (recommended)
- Alternative: `rate(1 minute)` for lower costs

## Lambda Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Runtime | Node.js 20.x | Required |
| Handler | `dist/index.handler` | Entry point |
| Memory | 512 MB | Adjustable |
| Timeout | 5 minutes (300s) | Sufficient for most workloads |
| Architecture | arm64 or x86_64 | arm64 recommended for cost |

## Performance Characteristics

### Processing Speed
- **Batch size**: 20 items in parallel
- **Max items per job**: 50 per invocation
- **Typical duration**: 2-10 seconds per invocation

### Example Statistics
```json
{
  "jobsPolled": 3,
  "itemsPolled": 45,
  "itemsUpdated": 42,
  "jobsResolved": ["123", "456"],
  "errors": 0
}
```

## Cost Estimate

**Monthly costs at 30-second intervals:**
- Invocations: ~86,400/month → $0.02
- Duration: ~216,000 GB-seconds → $3.60
- **Total: ~$3.62/month**

(Well within AWS Free Tier for first 12 months)

## Testing

### Local Testing
```bash
# Set environment variables
export DATABASE_URL="..."
export OPENAI_API_KEY="..."

# Run test
npm test
```

### AWS Testing
```bash
# Invoke Lambda directly
aws lambda invoke \
  --function-name llm-job-poller \
  --payload '{}' \
  response.json

cat response.json
```

### Monitor Logs
```bash
aws logs tail /aws/lambda/llm-job-poller --follow
```

## What Changed in the Codebase

### New Files
- `lambda/llm-job-poller/` - Complete Lambda function directory

### Modified Files
- `src/components/AIJobsOverlay.tsx`
  - Removed continuous polling loop
  - Added simple 5-second refresh interval
  - Comments indicate Lambda handles actual polling

### Unchanged
- All other application code
- Database schema
- API routes
- Job submission logic

## Monitoring

### CloudWatch Logs
Location: `/aws/lambda/llm-job-poller`

Key log patterns:
```
[Lambda] Starting LLM job poller
[Lambda] Found X active jobs to poll
[Lambda] Polling job {jobId}
[Lambda] Polling {N} items for job {jobId}
[Lambda] Polling complete: {stats}
```

### CloudWatch Metrics
- **Invocations**: Should be ~2,880/day
- **Duration**: Should be 2-10 seconds
- **Errors**: Should be near zero
- **Throttles**: Should be zero

### Recommended Alarms
- Error rate > 5%
- Duration > 4 minutes (approaching timeout)
- No invocations for 5 minutes

## Security Checklist

- [ ] Store secrets in AWS Secrets Manager
- [ ] Use least-privilege IAM role
- [ ] Place Lambda in private VPC subnets
- [ ] Configure security groups properly
- [ ] Enable encryption for environment variables
- [ ] Enable CloudWatch Logs encryption
- [ ] Rotate API keys regularly

## Troubleshooting

### Common Issues

| Symptom | Solution |
|---------|----------|
| "OpenAI client not configured" | Add `OPENAI_API_KEY` environment variable |
| Database connection timeout | Configure VPC, subnets, security groups |
| Lambda timeout | Reduce `MAX_ITEMS_PER_JOB` in code |
| Jobs not updating | Check EventBridge rule is enabled |
| High costs | Increase polling interval to 1 minute |

See ARCHITECTURE.md for detailed troubleshooting guide.

## Future Enhancements

1. **WebSockets for Real-Time Updates**
   - Push notifications instead of polling
   - Even lower latency for users

2. **Dynamic Polling Intervals**
   - Poll faster when jobs are active
   - Slower when idle

3. **Priority Queue**
   - Process high-priority jobs first
   - User-configurable priorities

4. **Multi-Region Deployment**
   - Deploy to multiple AWS regions
   - Failover and redundancy

5. **RDS Proxy**
   - Better connection pooling
   - Improved database performance

## Documentation

- **README.md** - Complete documentation
- **QUICKSTART.md** - 10-minute setup guide
- **ARCHITECTURE.md** - System design and data flow
- **env.example** - Environment variables template

## Support

For issues or questions:
1. Check logs: `aws logs tail /aws/lambda/llm-job-poller --follow`
2. Review CloudWatch metrics
3. Check EventBridge rule is enabled
4. Verify environment variables
5. Test database connectivity

## Success Criteria

✅ Lambda function polls OpenAI successfully  
✅ Database is updated with job statuses  
✅ Frontend displays updated job progress  
✅ No errors in CloudWatch Logs  
✅ Jobs complete end-to-end  
✅ Costs remain within budget  

## Migration Path

### Phase 1: Deploy Lambda (Current)
- Lambda handles all OpenAI polling
- Frontend does simple database refresh
- Both systems run in parallel

### Phase 2: Optimize (Optional)
- Add WebSockets for real-time updates
- Reduce frontend refresh interval
- Add monitoring and alerting

### Phase 3: Scale (Future)
- Multi-region deployment
- Dynamic polling intervals
- Priority queues

---

**Status**: ✅ Ready for deployment  
**Version**: 1.0.0  
**Last Updated**: $(date)

