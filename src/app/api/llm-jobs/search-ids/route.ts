import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PartOfSpeech } from '@/lib/llm/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const pos = searchParams.get('pos') as PartOfSpeech | null;
  const limitParam = searchParams.get('limit');
  const exact = searchParams.get('exact') === 'true';
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 50) : 20;

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const searchTerm = query.trim().toLowerCase();

  try {
    let results: Array<{ code: string; gloss: string }> = [];

    if (pos === 'verbs') {
      const entries = await prisma.verbs.findMany({
        where: {
          AND: [
            exact ? {
              code: { equals: searchTerm, mode: 'insensitive' }
            } : {
              OR: [
                { code: { contains: searchTerm, mode: 'insensitive' } },
                { gloss: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
            {
              deleted: false
            }
          ]
        },
        select: {
          code: true,
          gloss: true,
        },
        take: limit,
        orderBy: {
          code: 'asc',
        },
      });
      results = entries;
    } else if (pos === 'nouns') {
      const entries = await prisma.nouns.findMany({
        where: exact ? {
          code: { equals: searchTerm, mode: 'insensitive' }
        } : {
          OR: [
            { code: { contains: searchTerm, mode: 'insensitive' } },
            { gloss: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        select: {
          code: true,
          gloss: true,
        },
        take: limit,
        orderBy: {
          code: 'asc',
        },
      });
      results = entries;
    } else if (pos === 'adjectives') {
      const entries = await prisma.adjectives.findMany({
        where: exact ? {
          code: { equals: searchTerm, mode: 'insensitive' }
        } : {
          OR: [
            { code: { contains: searchTerm, mode: 'insensitive' } },
            { gloss: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        select: {
          code: true,
          gloss: true,
        },
        take: limit,
        orderBy: {
          code: 'asc',
        },
      });
      results = entries;
    } else if (pos === 'adverbs') {
      const entries = await prisma.adverbs.findMany({
        where: exact ? {
          code: { equals: searchTerm, mode: 'insensitive' }
        } : {
          OR: [
            { code: { contains: searchTerm, mode: 'insensitive' } },
            { gloss: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        select: {
          code: true,
          gloss: true,
        },
        take: limit,
        orderBy: {
          code: 'asc',
        },
      });
      results = entries;
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[LLM] Failed to search IDs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search IDs' },
      { status: 500 }
    );
  }
}

