import { NextResponse } from 'next/server';
import { cancelLLMJob } from '@/lib/llm/jobs';

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: Context) {
  const { id: jobId } = await context.params;

  try {
    const result = await cancelLLMJob(jobId);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[LLM] Failed to cancel job ${jobId}:`, error);
    const status = error instanceof Error && 'statusCode' in error ? (error as { statusCode: number }).statusCode : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel job' },
      { status }
    );
  }
}

