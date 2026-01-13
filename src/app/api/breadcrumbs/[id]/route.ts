import { NextRequest, NextResponse } from 'next/server';
import { getAncestorPath, getAncestorPathUncached } from '@/lib/db';

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    // Check for cache invalidation parameter
    const { searchParams } = new URL(request.url);
    const invalidateCache = searchParams.has('t'); // If timestamp param exists, bypass cache
    
    const ancestorPath = invalidateCache
      ? await getAncestorPathUncached(id)
      : await getAncestorPath(id);
    
    const breadcrumbs = ancestorPath.map((node: { id: string; legacy_id: string; lemmas?: string[]; src_lemmas?: string[]; gloss: string }) => {
      // Extract lemma from code format (e.g. 'attack' from 'attack.v.03')
      // The id is now the code, so we can extract directly
      const match = node.id.match(/^([^.]+)/);
      let lemma = match ? match[1] : node.id;
      
      // Fallback to database lemmas if code parsing fails
      if (!match || lemma === node.id) {
        const allLemmas = node.lemmas || [];
        const srcLemmas = node.src_lemmas || [];
        const regularLemmas = allLemmas.filter((l: string) => !srcLemmas.includes(l));
        lemma = [...regularLemmas, ...srcLemmas][0] || node.id;
      }
      
      return {
        id: node.id, // This is now the code
        legacy_id: node.legacy_id,
        lemma,
        gloss: node.gloss,
      };
    });

    // Add cache headers
    if (invalidateCache) {
      return NextResponse.json(breadcrumbs, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }
    
    return NextResponse.json(breadcrumbs, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching breadcrumbs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
