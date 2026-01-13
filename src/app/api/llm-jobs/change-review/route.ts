/**
 * API Route: /api/llm-jobs/change-review
 * 
 * POST - Create a review job for Lambda to process
 * GET - Check status of a review job and get results
 * 
 * This route creates LLM jobs of type 'review' that Lambda processes
 * asynchronously. The frontend should poll for results using GET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getChangeset } from '@/lib/version-control';
import type { Prisma } from '@prisma/client';

interface CommentHistoryItem {
  author: string;
  content: string;
  created_at: string;
}

interface ChangeReviewRequest {
  changeset_id: string;
  user_question: string;
  comment_history?: CommentHistoryItem[];
  model?: string;
  submitted_by?: string;
}

const DEFAULT_MODEL = 'gpt-4.1-mini';

/**
 * GET - Check the status of a review job and retrieve results
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('job_id');
  const changesetId = searchParams.get('changeset_id');

  if (!jobId && !changesetId) {
    return NextResponse.json(
      { error: 'Either job_id or changeset_id is required' },
      { status: 400 }
    );
  }

  try {
    // Find the review job
    let job;
    if (jobId) {
      job = await prisma.llm_jobs.findFirst({
        where: {
          id: BigInt(jobId),
          job_type: 'review',
        },
        include: {
          llm_job_items: {
            take: 1,
            select: {
              id: true,
              status: true,
              response_payload: true,
              completed_at: true,
            },
          },
        },
      });
    } else {
      // Find most recent review job for this changeset
      // changesetId is guaranteed non-null here due to the !jobId && !changesetId check above
      job = await prisma.llm_jobs.findFirst({
        where: {
          job_type: 'review',
          config: {
            path: ['changesetId'],
            equals: changesetId!,
          },
        },
        orderBy: { created_at: 'desc' },
        include: {
          llm_job_items: {
            take: 1,
            select: {
              id: true,
              status: true,
              response_payload: true,
              completed_at: true,
            },
          },
        },
      });
    }

    if (!job) {
      return NextResponse.json(
        { error: 'Review job not found' },
        { status: 404 }
      );
    }

    const item = job.llm_job_items[0];
    const isComplete = item?.status === 'succeeded' || item?.status === 'failed';

    // Parse response if available
    let result = null;
    if (item?.status === 'succeeded' && item.response_payload) {
      try {
        const payload = item.response_payload as Record<string, unknown>;
        // The response is stored in the response_payload, which includes the AI's output
        // We need to extract the parsed result from it
        const outputText = (payload as any)?.output_text;
        if (outputText) {
          result = JSON.parse(outputText);
        }
      } catch {
        // Response might not be parseable
      }
    }

    return NextResponse.json({
      job_id: job.id.toString(),
      status: job.status,
      item_status: item?.status ?? 'queued',
      is_complete: isComplete,
      result,
      created_at: job.created_at.toISOString(),
      completed_at: item?.completed_at?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Error checking review job:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check job status' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new review job for Lambda to process
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChangeReviewRequest;
    const { changeset_id, user_question, comment_history, model, submitted_by } = body;

    if (!changeset_id) {
      return NextResponse.json(
        { error: 'changeset_id is required' },
        { status: 400 }
      );
    }

    if (!user_question || typeof user_question !== 'string' || !user_question.trim()) {
      return NextResponse.json(
        { error: 'user_question is required' },
        { status: 400 }
      );
    }

    // Fetch the changeset with field changes
    const changeset = await getChangeset(BigInt(changeset_id));
    if (!changeset) {
      return NextResponse.json(
        { error: 'Changeset not found' },
        { status: 404 }
      );
    }

    // Build the chat history with the new user question
    const fullChatHistory = [
      ...(comment_history || []).map(c => ({
        author: c.author,
        content: c.content,
        createdAt: c.created_at,
      })),
      {
        author: submitted_by || 'User',
        content: user_question,
        createdAt: new Date().toISOString(),
      },
    ];

    // Build request payload for the Lambda
    const requestPayload = {
      changeset: {
        id: changeset.id.toString(),
        entity_type: changeset.entity_type,
        entity_id: changeset.entity_id?.toString() ?? null,
        operation: changeset.operation,
        before_snapshot: changeset.before_snapshot,
        after_snapshot: changeset.after_snapshot,
      },
      fieldChanges: changeset.field_changes.map(fc => ({
        field_name: fc.field_name,
        old_value: fc.old_value,
        new_value: fc.new_value,
        status: fc.status,
      })),
      chatHistory: fullChatHistory,
      userQuestion: user_question,
    };

    // Job config
    const jobConfig: Prisma.InputJsonObject = {
      model: model || DEFAULT_MODEL,
      changesetId: changeset_id,
      chatHistory: fullChatHistory as unknown as Prisma.InputJsonValue,
    };

    // Create the review job
    const job = await prisma.llm_jobs.create({
      data: {
        label: `Review: ${changeset.entity_type} ${changeset.entity_id}`,
        submitted_by: submitted_by || null,
        job_type: 'review',
        scope_kind: 'ids',
        scope: { kind: 'ids', targetType: 'verb', ids: [] } as unknown as Prisma.JsonObject,
        config: jobConfig,
        provider: 'openai',
        llm_vendor: 'openai',
        status: 'queued',
        total_items: 1,
      },
    });

    // Create the single job item for the review
    await prisma.llm_job_items.create({
      data: {
        job_id: job.id,
        status: 'queued',
        request_payload: requestPayload as unknown as Prisma.InputJsonObject,
      },
    });

    // Note: The frontend posts the user's comment before calling this endpoint,
    // so we don't duplicate it here.

    return NextResponse.json({
      success: true,
      job_id: job.id.toString(),
      message: 'Review job created. Poll GET /api/llm-jobs/change-review?job_id=... for results.',
      status: 'queued',
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating review job:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create review job' },
      { status: 500 }
    );
  }
}
