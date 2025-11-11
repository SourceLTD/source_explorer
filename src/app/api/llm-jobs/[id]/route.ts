import { NextRequest, NextResponse } from 'next/server';
import { deleteLLMJob, getLLMJob } from '@/lib/llm/jobs';

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: Context) {
  const { id: jobId } = await context.params;
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get('refresh');

  try {
    const job = await getLLMJob(jobId, { refresh: refresh !== 'false' });
    return NextResponse.json(job);
  } catch (error) {
    console.error(`[LLM] Failed to fetch job ${jobId}:`, error);
    const status = error instanceof Error && 'statusCode' in error ? (error as { statusCode: number }).statusCode : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch job' },
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

