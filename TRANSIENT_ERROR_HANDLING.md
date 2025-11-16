# Transient Error Handling Implementation

## Problems

### 1. Raw Technical Errors Displayed
Database connection errors (like Prisma P1001 errors when the database is temporarily unreachable) were being displayed directly to users in the UI with technical error messages. These errors are transient and resolve automatically, but they created a poor user experience.

### 2. Generic "Unexpected Error" Messages
When an unhandled error occurred, the system would display a generic "An unexpected error occurred" message without any context. In development mode, developers need to see actual error details for debugging.

## Solution
Implemented graceful handling of transient database errors across the application:

### 1. API Layer Improvements

**Files Modified:**
- `src/app/api/llm-jobs/route.ts`
- `src/app/api/llm-jobs/[id]/route.ts`

**Changes:**
- Integrated with existing `handleDatabaseError()` utility from `src/lib/db-utils.ts`
- Errors are now categorized as transient (connection/timeout issues) or persistent
- Transient errors return user-friendly messages like "Database connection unavailable. Please try again in a moment."
- Added `isTransient` flag to API responses to help frontend distinguish error types
- Changed status codes appropriately (503 for service unavailable, 504 for timeouts)

### 2. Frontend Improvements

**File Modified:**
- `src/components/AIJobsOverlay.tsx`

**Changes:**
- Transient database errors are no longer displayed in the UI
- They're logged to console for debugging but don't update error state
- The component relies on its existing 5-second polling mechanism to automatically retry
- Only persistent errors (non-connection-related) are shown to users

### 3. Environment-Specific Error Messages

**`src/lib/db-utils.ts` improvements:**
- **Development mode**: Shows actual error details (e.g., "Database error: Connection refused")
- **Production mode**: Shows generic, user-friendly message ("An unexpected error occurred. Please try again.")
- Enhanced logging with full error details and stack traces for debugging
- Prevents leaking sensitive database information to end users

### 4. API Client Improvements

**`src/lib/api-client.ts`:**
- Now respects `isTransient` flag from API responses
- Automatically retries transient errors with exponential backoff
- Properly handles both `retryable` and `isTransient` flags

### 5. Existing Infrastructure Leveraged

**`src/lib/db-utils.ts`:**
- Already contained robust error detection logic via `isRetryableError()`
- Detects Prisma error codes: P1001, P1008, P1017
- Detects connection-related error messages
- Provides user-friendly error messages via `handleDatabaseError()`

## Benefits

1. **Better UX**: Users no longer see scary technical error messages for temporary issues
2. **Self-healing**: Transient errors resolve automatically through existing polling
3. **Consistent**: Uses same error handling pattern as other API endpoints
4. **Maintainable**: Centralized error detection logic in `db-utils.ts`
5. **Debugging**: Errors still logged to console for developer visibility

## Testing

When a transient database connection error occurs:
- ✅ Error is logged to console with context
- ✅ No error message displayed in UI
- ✅ Component continues polling every 5 seconds
- ✅ Automatically recovers when database becomes available
- ✅ Users see seamless experience

When a persistent error occurs:
- ✅ Error is displayed in UI
- ✅ User can take action or contact support
- ✅ Clear indication something needs attention

## Error Messages

### Before:
```
Invalid `getLLMJobsDelegate().findMany()` invocation in
/Users/benjaminirwin/source-explorer/.next/server/chunks/[root-of-the-server]__07d06893._.js:2698:43
...
Can't reach database server at `aws-1-eu-west-1.pooler.supabase.com:6543`
```

OR

```
An unexpected error occurred.
```

### After (transient errors):
- **UI**: No message shown
- **Console**: `[loadJobs] Transient database error, will retry on next poll: Database connection unavailable. Please try again in a moment.`

### After (persistent errors):

**Development Mode:**
```
Database error: [actual error message with details]
```

**Production Mode:**
```
An unexpected error occurred. Please try again.
```

**Known Errors (both modes):**
```
Record not found.
```
or
```
Database operation timed out. Please try again.
```

## Debugging Errors

When you see "An unexpected error occurred" in development mode:

1. **Check server console** for full error details:
   - Error message and type
   - Stack trace
   - Context (which API endpoint failed)

2. **Look for error logs** with these prefixes:
   - `Unexpected database error`
   - `Error details:`
   - `Stack trace:`

3. **Check if it's a known Prisma error**:
   - P1001: Can't reach database server
   - P1008: Operations timed out
   - P1017: Server closed connection
   - P2025: Record not found

4. **Verify database connectivity**:
   ```bash
   npx prisma db pull
   ```

## Production Deployment Notes

- Generic error messages protect against information disclosure
- All errors are fully logged server-side for investigation
- Monitoring should alert on 500-series errors
- Transient errors (503, 504) are expected and self-heal

## Related Files

- `src/lib/db-utils.ts` - Core error detection and handling utilities
- `src/lib/api-client.ts` - Client-side API wrapper with retry logic
- `src/lib/route-handlers.ts` - Uses handleDatabaseError for other entities
- `src/components/AIJobsOverlay.tsx` - UI component with transient error handling
- Other API routes already using this pattern: verbs, nouns, adjectives, adverbs

