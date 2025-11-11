import { NextRequest, NextResponse } from 'next/server';
import { createLLMJob, listLLMJobs } from '@/lib/llm/jobs';
import type { CreateLLMJobParams } from '@/lib/llm/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeCompleted = searchParams.get('includeCompleted') === 'true';
  const refresh = searchParams.get('refresh');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 50) : undefined;

  try {
    const jobs = await listLLMJobs({
      includeCompleted,
      refreshBeforeReturn: refresh !== 'false',
      limit,
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[LLM] Failed to list jobs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch jobs' },
      { status: error instanceof Error && 'statusCode' in error ? (error as { statusCode: number }).statusCode : 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateLLMJobParams> & { previewOnly?: boolean };

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

    const job = await createLLMJob({
      label: payload.label,
      submittedBy: payload.submittedBy,
      model: payload.model,
      promptTemplate: payload.promptTemplate,
      scope: payload.scope,
      serviceTier: payload.serviceTier,
      reasoning: payload.reasoning,
      metadata: payload.metadata ?? {},
    } as CreateLLMJobParams);

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error('[LLM] Failed to create job:', error);
    const status = error instanceof Error && 'statusCode' in error ? (error as { statusCode: number }).statusCode : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create job' },
      { status }
    );
  }
}

