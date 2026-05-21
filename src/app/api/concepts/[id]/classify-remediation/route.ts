/**
 * API Route: /api/frames/[id]/classify-remediation
 *
 * POST — Uses a small LLM to classify the user's free-text description
 * into one of the known remediation strategies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { HEALTH_REMEDIATION_STRATEGIES, HEALTH_REMEDIATION_STRATEGY_LABELS } from '@/lib/health-checks/types';

const CLASSIFIER_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

const SYSTEM_PROMPT = `You are a classification assistant. Given a user's description of what they want to do to a frame in a lexical resource, you must classify their intent into exactly one remediation strategy from the list below.

Available strategies:
${HEALTH_REMEDIATION_STRATEGIES.map((s) => `- ${s}: ${HEALTH_REMEDIATION_STRATEGY_LABELS[s]}`).join('\n')}

Rules:
- Respond with ONLY the strategy key (e.g. "reparent_frame") on a single line.
- Do not explain or add anything else.
- If no strategy clearly matches, respond with "manual_review".
- If the user wants to change the frame's name/title, use "update_frame_label".
- If the user wants to change the main definition, use "update_frame_definition".
- If the user wants to move the frame under a different parent, use "reparent_frame".
- If the user wants to split a frame into multiple frames, use "split_frame".
- If the user wants to separate POS alternations (e.g. verb vs noun), use "split_pos_alternation".`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description } = body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json(
        { error: 'description is required' },
        { status: 400 },
      );
    }

    const { text } = await generateText({
      model: bedrock(CLASSIFIER_MODEL),
      system: SYSTEM_PROMPT,
      prompt: description.trim(),
    });

    const classified = text.trim().toLowerCase();

    // Validate it's a known strategy
    const strategy = HEALTH_REMEDIATION_STRATEGIES.find((s) => s === classified);

    if (!strategy) {
      return NextResponse.json({
        strategy: 'manual_review',
        label: HEALTH_REMEDIATION_STRATEGY_LABELS['manual_review'],
        confidence: 'low',
      });
    }

    return NextResponse.json({
      strategy,
      label: HEALTH_REMEDIATION_STRATEGY_LABELS[strategy],
      confidence: 'high',
    });
  } catch (error) {
    console.error('[API] Error classifying remediation:', error);
    return NextResponse.json(
      { error: 'Failed to classify remediation strategy' },
      { status: 500 },
    );
  }
}
