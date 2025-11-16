import { NextRequest, NextResponse } from 'next/server';
import { submitJobItemBatch } from '@/lib/llm/jobs';

// Very generous timeout to handle large batches and API rate limits
// Each batch submits 100 items to OpenAI with retry logic
export const maxDuration = 300; // 5 minutes per batch

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const jobId = BigInt(idParam);
    const body = await request.json().catch(() => ({}));
    const batchSize = typeof body?.batchSize === 'number' 
      ? Math.min(Math.max(body.batchSize, 10), 100)
      : 50;

    const result = await submitJobItemBatch(jobId, batchSize);

    return NextResponse.json({
      ...result,
      message: result.remaining > 0 
        ? `Submitted ${result.submitted} items, ${result.remaining} remaining`
        : 'All items submitted',
    });
  } catch (error) {
    console.error('[LLM] Batch submission error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch submission failed' },
      { status: 500 }
    );
  }
}

