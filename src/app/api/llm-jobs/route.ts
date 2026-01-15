import { NextRequest, NextResponse } from 'next/server';
import { createLLMJob, listLLMJobs } from '@/lib/llm/jobs';
import type { CreateLLMJobParams } from '@/lib/llm/types';
import { handleDatabaseError } from '@/lib/db-utils';

// Generous timeout for job creation with large batches
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeCompleted = searchParams.get('includeCompleted') === 'true';
  const limitParam = searchParams.get('limit');
  const entityType = searchParams.get('entityType') as any;
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 50) : undefined;

  try {
    const jobs = await listLLMJobs({
      includeCompleted,
      limit,
      entityType: entityType ?? undefined,
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[LLM] Failed to list jobs:', error);
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/llm-jobs');
    return NextResponse.json(
      { error: message, isTransient: shouldRetry },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateLLMJobParams> & { 
      previewOnly?: boolean;
      initialBatchSize?: number;
    };

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
      systemPrompt: payload.systemPrompt,
      scope: payload.scope,
      serviceTier: payload.serviceTier,
      reasoning: payload.reasoning,
      jobType: payload.jobType,
      targetFields: payload.targetFields,
      reallocationEntityTypes: payload.reallocationEntityTypes,
      metadata: payload.metadata ?? {},
      mcpEnabled: payload.mcpEnabled,
      changesetId: payload.changesetId,
      chatHistory: payload.chatHistory,
    } as CreateLLMJobParams, payload.initialBatchSize);

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error('[LLM] Failed to create job:', error);
    if (error instanceof Error && 'statusCode' in error) {
      const status = (error as { statusCode: number }).statusCode;
      return NextResponse.json(
        { error: error.message, isTransient: false },
        { status }
      );
    }

    const { message, status, shouldRetry } = handleDatabaseError(error, 'POST /api/llm-jobs');
    return NextResponse.json(
      { error: message, isTransient: shouldRetry },
      { status }
    );
  }
}
