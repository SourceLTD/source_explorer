import { NextRequest, NextResponse } from 'next/server';
import { searchEntries } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    const results = await searchEntries(query, limit);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching entries:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}