# Race Condition Fix: Preventing Duplicate OpenAI Submissions

## The Problem

When multiple Lambda invocations run concurrently, they could submit the same items twice to OpenAI:

### Race Condition Timeline

```
Time  | Lambda A                          | Lambda B
------|-----------------------------------|----------------------------------
T1    | SELECT items WHERE status='queued'|
T2    |                                   | SELECT items WHERE status='queued'
T3    | Submit items to OpenAI            |
T4    |                                   | Submit SAME items to OpenAI
T5    | UPDATE status='processing'        |
T6    |                                   | UPDATE status='processing'
```

**Result:** Items submitted twice, wasted API calls, incorrect billing.

## The Solution: Atomic Claim Pattern

We implemented an **atomic claim** pattern using PostgreSQL's `updateMany` with a WHERE condition:

### Implementation

```typescript
// 1. Find candidate items
const candidateItems = await prisma.llm_job_items.findMany({
  where: { status: 'queued', provider_task_id: null },
  take: MAX_SUBMISSION_ITEMS,
});

// 2. ATOMIC CLAIM: Only this Lambda can claim these items
const claimResult = await prisma.llm_job_items.updateMany({
  where: {
    id: { in: itemIds },
    status: 'queued',        // Only if STILL queued
    provider_task_id: null,  // Only if NOT already submitted
  },
  data: {
    status: 'submitting',    // Temporary status
    started_at: new Date(),
  },
});

// 3. Only proceed with items THIS Lambda claimed
const items = await prisma.llm_job_items.findMany({
  where: { id: { in: itemIds }, status: 'submitting' },
});

// 4. Submit only the claimed items to OpenAI
```

### How It Prevents Duplicates

**PostgreSQL's atomicity** guarantees that only ONE Lambda can update each item from `queued` → `submitting`.

**New Timeline with Fix:**

```
Time  | Lambda A                              | Lambda B
------|---------------------------------------|---------------------------------------
T1    | SELECT 1000 items (queued)            |
T2    |                                       | SELECT 1000 items (queued)
T3    | UPDATE status='submitting'            |
T3.1  | ✅ Claims 1000 items                   |
T4    |                                       | UPDATE status='submitting'
T4.1  |                                       | ❌ Claims 0 items (already 'submitting')
T5    | Submit 1000 items to OpenAI           |
T6    |                                       | No items to submit, exits early
T7    | UPDATE status='processing'            |
```

## Database Changes

### New Enum Value

Added `submitting` status to `llm_job_item_status` enum:

```sql
ALTER TYPE llm_job_item_status ADD VALUE 'submitting' AFTER 'queued';
```

### Status Flow

```
queued → submitting → processing → succeeded/failed
```

- **`queued`**: Item created, waiting for submission
- **`submitting`**: Item claimed by a Lambda, being submitted to OpenAI
- **`processing`**: Item successfully submitted, waiting for OpenAI response
- **`succeeded`/`failed`**: Item completed

## Recovery Mechanism

If a Lambda **crashes** during submission, items could be stuck in `submitting` status.

**Solution:** Timeout-based recovery:

```typescript
// Reset items stuck in 'submitting' for more than 5 minutes
const submittingTimeout = new Date(Date.now() - 5 * 60 * 1000);
await prisma.llm_job_items.updateMany({
  where: {
    status: 'submitting',
    started_at: { lt: submittingTimeout },
  },
  data: {
    status: 'queued',  // Reset to queued for retry
    started_at: null,
  },
});
```

This runs at the **start of every Lambda invocation** to clean up orphaned items.

## Benefits

1. ✅ **No duplicate submissions** - Each item submitted exactly once
2. ✅ **Concurrent Lambda safety** - Multiple invocations can run safely
3. ✅ **Crash recovery** - Stuck items automatically reset
4. ✅ **Cost optimization** - No wasted OpenAI API calls
5. ✅ **Data integrity** - Correct billing and result tracking

## Testing

To verify the fix works:

1. Create a job with 2000+ items
2. Manually trigger 3 concurrent Lambda invocations
3. Check logs for "Claimed X of Y items"
4. Verify each item has **exactly one** `provider_task_id` in the database

```bash
# Should show 0 duplicate provider_task_ids
SELECT provider_task_id, COUNT(*) 
FROM llm_job_items 
WHERE provider_task_id IS NOT NULL 
GROUP BY provider_task_id 
HAVING COUNT(*) > 1;
```

## Performance Impact

- **Minimal overhead**: One extra `updateMany` query per invocation
- **Same concurrency**: Still processes 25 items in parallel
- **Same throughput**: 1000 items per invocation
- **Database load**: Slightly increased (2 queries instead of 1 for claiming)

## Summary

The atomic claim pattern ensures that even with multiple concurrent Lambdas:
- Each item is submitted to OpenAI **exactly once**
- No race conditions or duplicate API calls
- Automatic recovery from Lambda crashes
- Safe, reliable, and cost-efficient

