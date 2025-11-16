import { NextRequest, NextResponse } from 'next/server';
import { getLLMJob } from '@/lib/llm/jobs';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * Polling endpoint that actually checks OpenAI for job status updates
 * Refreshes active jobs from OpenAI and returns updated status/counts
 * Also returns which jobs are now resolved (completed/failed/cancelled)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobIdsParam = searchParams.get('jobIds');
  
  if (!jobIdsParam) {
    return NextResponse.json({ error: 'jobIds parameter required' }, { status: 400 });
  }

  try {
    const jobIds = jobIdsParam.split(',').map(id => id.trim());
    
    // Get optional limit parameter for items to refresh per job
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 40;
    
    // Fetch each job with refresh=true to poll OpenAI
    // This will update the database with the latest status from OpenAI
    const updates = await Promise.all(
      jobIds.map(async (jobId) => {
        try {
          // refresh=true will call refreshJobItems which polls OpenAI
          // refreshLimit controls how many items to check per poll
          const job = await getLLMJob(jobId, { refresh: true, refreshLimit: limit });
          return {
            id: job.id,
            status: job.status,
            total_items: job.total_items,
            submitted_items: job.submitted_items,
            processed_items: job.processed_items,
            succeeded_items: job.succeeded_items,
            failed_items: job.failed_items,
            flagged_items: job.flagged_items,
            updated_at: job.updated_at,
          };
        } catch (error) {
          console.error(`[LLM] Failed to poll job ${jobId}:`, error);
          return null;
        }
      })
    );

    // Filter out failed polls
    const validUpdates = updates.filter(u => u !== null);

    // Find jobs that are now resolved (in terminal state)
    const resolvedJobIds = validUpdates
      .filter(update => TERMINAL_STATUSES.has(update.status))
      .map(update => update.id);

    return NextResponse.json({ 
      updates: validUpdates,
      resolvedJobIds,
    });
  } catch (error) {
    console.error('[LLM] Failed to poll job status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to poll jobs' },
      { status: 500 }
    );
  }
}

