/**
 * API Route: /api/health-checks/trigger
 *
 * POST — Triggers the deployed health-check Step Functions pipeline directly
 * via StartExecution. This runs the WHOLE nightly pipeline (programmatic
 * checks + LLM submit + poll loop), matching what the EventBridge schedule
 * does. It is distinct from the per-definition "Queue Run" flow, which writes
 * a queued DB row.
 */

import { NextResponse } from 'next/server';
import { StartExecutionCommand } from '@aws-sdk/client-sfn';
import { getSfnClient } from '@/lib/health-checks/sfn';
import { getCurrentUserName } from '@/utils/supabase/server';

const PROGRAMMATIC_CHECK_CODES = [
  'FRAME_RULES',
  'FRAME_SENSE_RULES',
  'INHERITANCE_ROLE_MAPPING_RULES',
] as const;

function sanitizeExecutionName(raw: string): string {
  // Step Functions execution names allow a limited character set and max 80
  // chars. Replace anything outside [a-zA-Z0-9_-] with a dash.
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

export async function POST() {
  try {
    const stateMachineArn = process.env.HEALTHCHECK_STATE_MACHINE_ARN;
    if (!stateMachineArn) {
      return NextResponse.json(
        { error: 'HEALTHCHECK_STATE_MACHINE_ARN is not configured' },
        { status: 500 },
      );
    }

    const client = getSfnClient();
    if (!client) {
      return NextResponse.json(
        { error: 'AWS credentials are not configured' },
        { status: 500 },
      );
    }

    const userId = await getCurrentUserName();
    const name = sanitizeExecutionName(`manual-${userId}-${Date.now()}`);

    const result = await client.send(
      new StartExecutionCommand({
        stateMachineArn,
        name,
        input: JSON.stringify({ programmaticCheckCodes: PROGRAMMATIC_CHECK_CODES }),
      }),
    );

    return NextResponse.json(
      {
        executionArn: result.executionArn,
        startDate: result.startDate?.toISOString() ?? null,
        message: 'Health-check pipeline started',
      },
      { status: 202 },
    );
  } catch (error) {
    console.error('[API] Error triggering health-check pipeline:', error);
    return NextResponse.json(
      { error: 'Failed to trigger health-check pipeline' },
      { status: 500 },
    );
  }
}
