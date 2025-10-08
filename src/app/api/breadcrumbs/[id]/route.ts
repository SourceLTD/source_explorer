import { NextRequest, NextResponse } from 'next/server';
import { getAncestorPath } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const ancestorPath = await getAncestorPath(id);
    
    const breadcrumbs = ancestorPath.map(node => {
      // Extract lemma from synset ID format (e.g. 'attack' from 'attack.v.03')
      const match = node.id.match(/^([^.]+)/);
      let lemma = match ? match[1] : node.id;
      
      // Fallback to database lemmas if synset ID parsing fails
      if (lemma === node.id) {
        const allLemmas = node.lemmas || [];
        const srcLemmas = node.src_lemmas || [];
        const regularLemmas = allLemmas.filter(l => !srcLemmas.includes(l));
        lemma = [...regularLemmas, ...srcLemmas][0] || node.id;
      }
      
      return {
        id: node.id,
        legacy_id: node.legacy_id,
        lemma,
        gloss: node.gloss,
      };
    });

    // Add cache headers for browser and CDN caching
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
