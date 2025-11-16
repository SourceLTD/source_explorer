import { NextRequest, NextResponse } from 'next/server';
import { deleteLLMJob, getLLMJob } from '@/lib/llm/jobs';
import { handleDatabaseError } from '@/lib/db-utils';

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: Context) {
  const { id: jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get('refresh');
  const pendingLimit = searchParams.get('pendingLimit');
  const succeededLimit = searchParams.get('succeededLimit');
  const failedLimit = searchParams.get('failedLimit');

  try {
    // Default to NO refresh - let polling handle status updates instead
    // This prevents individual queries for each job item
    const statusLimits = {
      pending: pendingLimit ? parseInt(pendingLimit, 10) : undefined,
      succeeded: succeededLimit ? parseInt(succeededLimit, 10) : undefined,
      failed: failedLimit ? parseInt(failedLimit, 10) : undefined,
    };
    
    const job = await getLLMJob(jobId, { 
      refresh: refresh === 'true',
      statusLimits,
    });
    return NextResponse.json(job);
  } catch (error) {
    console.error(`[LLM] Failed to fetch job ${jobId}:`, error);
    const { message, status, shouldRetry } = handleDatabaseError(error, `GET /api/llm-jobs/${jobId}`);
    return NextResponse.json(
      { error: message, isTransient: shouldRetry },
      { status }
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id: jobId } = await context.params;
  try {
    await deleteLLMJob(jobId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[LLM] Failed to delete job ${jobId}:`, error);
    const status = error instanceof Error && 'statusCode' in error ? (error as { statusCode: number }).statusCode : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete job' },
      { status }
    );
  }
}

