import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { renderPrompt, fetchEntriesForScope } from '@/lib/llm/jobs';
import type { JobScope } from '@/lib/llm/types';
import type { Prisma } from '@prisma/client';

interface Context {
  params: Promise<{ id: string }>;
}

const MAX_BATCH_SIZE = 3000;

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id: jobIdStr } = await context.params;
    const jobId = BigInt(jobIdStr);
    
    const payload = await request.json() as { scope: JobScope };
    
    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    // 1. Validate job exists and is in 'queued' state
    const job = await prisma.llm_jobs.findUnique({
      where: { id: jobId },
      select: { 
        id: true, 
        status: true, 
        total_items: true,
        config: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'queued') {
      return NextResponse.json(
        { error: `Cannot append items to job in '${job.status}' status. Job must be 'queued'.` },
        { status: 400 }
      );
    }

    // 2. Fetch entries for the provided scope
    const entries = await fetchEntriesForScope(payload.scope);

    if (entries.length === 0) {
      return NextResponse.json({ error: 'No entries found for provided scope' }, { status: 400 });
    }

    if (entries.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size ${entries.length} exceeds maximum of ${MAX_BATCH_SIZE}` },
        { status: 400 }
      );
    }

    // 3. Get job config to access userPromptTemplate (the key used when creating jobs)
    const config = job.config as { userPromptTemplate?: string } | null;
    const promptTemplate = config?.userPromptTemplate;
    
    if (!promptTemplate) {
      return NextResponse.json({ error: 'Job config missing userPromptTemplate' }, { status: 500 });
    }

    // 4. Render prompts and prepare job items
    const preparedJobItemsData = entries.map(entry => {
      const { prompt, variables } = renderPrompt(promptTemplate, entry);

      const frameInfo = entry.frame ? {
        name: entry.frame.label,
        id: entry.frame.id,
        definition: entry.frame.definition,
        short_definition: entry.frame.short_definition,
        roles: entry.frame.roles,
      } : null;

      const requestPayload = {
        promptTemplate,
        renderedPrompt: prompt,
        variables,
        entry: {
          code: entry.code,
          pos: entry.pos,
          gloss: entry.gloss,
          lemmas: entry.lemmas ?? [],
          examples: entry.examples ?? [],
          label: entry.label ?? null,
          flagged: entry.flagged ?? false,
          flagged_reason: entry.flagged_reason ?? null,
          lexfile: entry.lexfile ?? null,
          definition: entry.definition ?? null,
          short_definition: entry.short_definition ?? null,
        },
        frameInfo,
      } satisfies Record<string, unknown>;

      return {
        job_id: jobId,
        status: 'queued' as const,
        lexical_unit_id: entry.pos !== 'frames' ? entry.dbId : null,
        frame_id: entry.pos === 'frames' ? entry.dbId : null,
        request_payload: requestPayload as Prisma.InputJsonObject,
      };
    });

    // 5. Insert new items in a transaction
    await prisma.$transaction(async (tx) => {
      // Insert items
      await tx.llm_job_items.createMany({
        data: preparedJobItemsData,
        skipDuplicates: false,
      });

      // No need to update total_items count as it's already set to the total
      // expected count by the frontend when the job is first created.
      // The frontend uses count-scope to get the accurate total.
    });

    // 6. Get updated count
    const updatedJob = await prisma.llm_jobs.findUnique({
      where: { id: jobId },
      select: { total_items: true },
    });

    return NextResponse.json({
      added: entries.length,
      totalItems: updatedJob?.total_items ?? job.total_items + entries.length,
    });
  } catch (error) {
    console.error('[LLM] Failed to append items:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to append items' },
      { status: 500 }
    );
  }
}

