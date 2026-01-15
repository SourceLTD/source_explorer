import { NextRequest, NextResponse } from 'next/server';
import type { CreateLLMJobParams } from '@/lib/llm/types';
import { fetchUnitsForScope } from '@/lib/llm/jobs';

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateLLMJobParams>;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    // Get total count separately to provide accurate info to the UI
    const { countEntriesForScope } = await import('@/lib/llm/entries');
    const totalEntries = await countEntriesForScope(payload.scope as any);

    // For validation, we only need a few samples.
    const validateScope = { ...payload.scope };
    if (validateScope.kind === 'filters') {
      validateScope.filters = { ...validateScope.filters, limit: 5 };
    } else if (validateScope.kind === 'frame_ids') {
      validateScope.frameIds = validateScope.frameIds.slice(0, 5);
      validateScope.limit = 5;
    } else if (validateScope.kind === 'ids') {
      validateScope.ids = validateScope.ids.slice(0, 5);
    }

    const entries = await fetchUnitsForScope(validateScope as any);
    const sampleSize = entries.length;
    const sample = entries.map(e => ({ code: e.code, gloss: e.gloss }));

    return NextResponse.json({ totalItems: totalEntries, sampleSize, sample });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate scope' },
      { status: 500 }
    );
  }
}


