import { NextRequest, NextResponse } from 'next/server';
import { previewLLMJob } from '@/lib/llm/jobs';
import type { CreateLLMJobParams } from '@/lib/llm/types';

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateLLMJobParams>;

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (!payload.promptTemplate || typeof payload.promptTemplate !== 'string') {
      return NextResponse.json({ error: 'promptTemplate is required.' }, { status: 400 });
    }

    if (!payload.model || typeof payload.model !== 'string') {
      return NextResponse.json({ error: 'model is required.' }, { status: 400 });
    }

    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    const preview = await previewLLMJob(payload as CreateLLMJobParams);
    return NextResponse.json(preview);
  } catch (error) {
    console.error('[LLM] Failed to preview job:', error);
    const status = error instanceof Error && 'statusCode' in error ? (error as { statusCode: number }).statusCode : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to preview job' },
      { status }
    );
  }
}

