import { NextRequest, NextResponse } from 'next/server';
import {
  callSourceClustering,
  type SourceClusteringRequest,
  SourceClusteringError,
} from '@/lib/clustering/sourceClustering';

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<SourceClusteringRequest>;

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    if (!payload.mode || typeof payload.mode !== 'string') {
      return NextResponse.json({ error: 'mode is required.' }, { status: 400 });
    }
    if (!payload.ids_kind || typeof payload.ids_kind !== 'string') {
      return NextResponse.json({ error: 'ids_kind is required.' }, { status: 400 });
    }
    if (!Array.isArray(payload.ids) || !payload.ids.every((x) => Number.isInteger(x))) {
      return NextResponse.json({ error: 'ids must be an array of integers.' }, { status: 400 });
    }
    if (typeof payload.k !== 'number' || !Number.isInteger(payload.k)) {
      return NextResponse.json({ error: 'k must be an integer.' }, { status: 400 });
    }

    const result = await callSourceClustering(payload as SourceClusteringRequest);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SourceClusteringError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.statusCode }
      );
    }

    console.error('[clustering] Failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to call clustering service' },
      { status: 500 }
    );
  }
}

