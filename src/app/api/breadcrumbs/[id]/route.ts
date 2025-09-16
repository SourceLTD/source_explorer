import { NextRequest, NextResponse } from 'next/server';
import { getAncestorPath } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const ancestorPath = await getAncestorPath(id);
    
    const breadcrumbs = ancestorPath.map(node => ({
      id: node.id,
      lemma: node.lemmas[0] || node.id,
      gloss: node.gloss,
    }));

    return NextResponse.json(breadcrumbs);
  } catch (error) {
    console.error('Error fetching breadcrumbs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}