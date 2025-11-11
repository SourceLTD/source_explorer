import { NextRequest, NextResponse } from 'next/server';
import type { CreateLLMJobParams } from '@/lib/llm/types';
import { fetchEntriesForScope } from '@/lib/llm/jobs';

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateLLMJobParams>;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    const entries = await fetchEntriesForScope(payload.scope);
    const sampleSize = Math.min(entries.length, 5);
    const sample = entries.slice(0, sampleSize).map(e => ({ code: e.code, gloss: e.gloss }));

    return NextResponse.json({ totalItems: entries.length, sampleSize, sample });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to validate scope' },
      { status: 500 }
    );
  }
}


