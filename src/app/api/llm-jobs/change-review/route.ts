/**
 * API Route: /api/llm-jobs/change-review
 * 
 * POST - Synchronously ask AI to review a pending change and suggest modifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOpenAIClient } from '@/lib/llm/client';
import { CHANGE_REVIEW_RESPONSE_SCHEMA, type ChangeReviewResponse } from '@/lib/llm/schema';
import { getChangeset, addComment } from '@/lib/version-control';

interface CommentHistoryItem {
  author: string;
  content: string;
  created_at: string;
}

interface ChangeReviewRequest {
  changeset_id: string;
  user_question: string;
  comment_history: CommentHistoryItem[];
}

const DEFAULT_MODEL = 'gpt-4.1-mini';

function buildChangeReviewPrompt(
  changeset: Awaited<ReturnType<typeof getChangeset>>,
  userQuestion: string,
  commentHistory: CommentHistoryItem[]
): string {
  if (!changeset) {
    throw new Error('Changeset not found');
  }

  const entityType = changeset.entity_type;
  const beforeSnapshot = changeset.before_snapshot as Record<string, unknown> | null;
  const fieldChanges = changeset.field_changes;

  // Build the context about the change
  let prompt = `You are an AI assistant helping to review a pending change to a ${entityType} entry in a lexical database.

## Entity Information
`;

  if (beforeSnapshot) {
    prompt += `\n### Current State (Before Change)\n`;
    prompt += '```json\n' + JSON.stringify(beforeSnapshot, null, 2) + '\n```\n';
  }

  prompt += `\n### Pending Field Changes\n`;
  for (const fc of fieldChanges) {
    prompt += `\n**${fc.field_name}**:\n`;
    prompt += `- Original value: ${JSON.stringify(fc.old_value)}\n`;
    prompt += `- Proposed new value: ${JSON.stringify(fc.new_value)}\n`;
    prompt += `- Status: ${fc.status}\n`;
  }

  // Add comment history for context
  if (commentHistory.length > 0) {
    prompt += `\n## Discussion Thread\n`;
    for (const comment of commentHistory) {
      const timestamp = new Date(comment.created_at).toLocaleString();
      prompt += `\n**${comment.author}** (${timestamp}):\n${comment.content}\n`;
    }
  }

  // Add the user's current question
  prompt += `\n## User's Question\n${userQuestion}\n`;

  // Instructions for the AI
  prompt += `
## Your Task

Based on the above context, provide a recommendation for this pending change. You should:

1. Consider whether the proposed change is appropriate for this ${entityType} entry
2. Take into account the discussion thread and the user's specific question
3. Suggest one of the following actions:
   - **approve**: The change looks good and should be approved as-is
   - **reject**: The change should be rejected entirely
   - **modify**: The change needs modifications (provide the suggested new values)
   - **keep_as_is**: Leave the pending change unchanged for further human review

If you recommend "modify", provide the exact field values you suggest in the "modifications" object.
Be concise but thorough in your justification.
`;

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ChangeReviewRequest;
    const { changeset_id, user_question, comment_history } = body;

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

    // Get the OpenAI client
    const client = getOpenAIClient();
    if (!client) {
      return NextResponse.json(
        { error: 'OpenAI client is not configured' },
        { status: 503 }
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

    // Build the prompt
    const prompt = buildChangeReviewPrompt(changeset, user_question, comment_history || []);

    // Call OpenAI synchronously (no background mode)
    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      input: prompt,
      background: false, // Synchronous call
      store: true,
      text: {
        format: {
          type: 'json_schema',
          name: CHANGE_REVIEW_RESPONSE_SCHEMA.name,
          strict: CHANGE_REVIEW_RESPONSE_SCHEMA.strict,
          schema: CHANGE_REVIEW_RESPONSE_SCHEMA.schema,
        },
      },
    });

    // Extract the response
    if (response.status !== 'completed') {
      return NextResponse.json(
        { error: `AI request failed with status: ${response.status}` },
        { status: 500 }
      );
    }

    // Parse the output
    const outputItem = response.output?.find(o => o.type === 'message');
    if (!outputItem || outputItem.type !== 'message') {
      return NextResponse.json(
        { error: 'No message output from AI' },
        { status: 500 }
      );
    }

    const textContent = outputItem.content?.find(c => c.type === 'output_text');
    if (!textContent || textContent.type !== 'output_text') {
      return NextResponse.json(
        { error: 'No text content in AI response' },
        { status: 500 }
      );
    }

    let aiResult: ChangeReviewResponse;
    try {
      aiResult = JSON.parse(textContent.text) as ChangeReviewResponse;
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    // Post the AI's justification as a comment in the thread
    const aiComment = await addComment({
      changeset_id: BigInt(changeset_id),
      author: 'LLM Agent',
      content: aiResult.justification,
    });

    // Return the result along with current field changes for the dialog
    return NextResponse.json({
      action: aiResult.action,
      modifications: aiResult.modifications || null,
      justification: aiResult.justification,
      confidence: aiResult.confidence,
      currentFieldChanges: changeset.field_changes.map(fc => ({
        field_name: fc.field_name,
        old_value: fc.old_value,
        new_value: fc.new_value,
      })),
      aiComment: {
        id: aiComment.id.toString(),
        changeset_id: aiComment.changeset_id?.toString() ?? null,
        field_change_id: aiComment.field_change_id?.toString() ?? null,
        author: aiComment.author,
        content: aiComment.content,
        created_at: aiComment.created_at.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error in change-review:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process AI review' },
      { status: 500 }
    );
  }
}

