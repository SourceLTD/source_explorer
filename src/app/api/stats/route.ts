import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [entriesCount, relationsCount, framesCount] = await Promise.all([
      prisma.lexical_units.count({ 
        where: { 
          deleted: false
        } 
      }),
      prisma.lexical_unit_relations.count(),
      prisma.frames.count({
        where: {
          deleted: false
        }
      })
    ])
    
    // Group by POS
    const entriesByPos = await prisma.lexical_units.groupBy({
      by: ['pos'],
      where: { deleted: false },
      _count: true,
    });

    const posStats: Record<string, number> = {};
    entriesByPos.forEach(group => {
      posStats[group.pos] = group._count;
    });

    const stats = {
      entries: entriesCount,
      relations: relationsCount,
      frames: framesCount,
      by_pos: posStats,
    }
    
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
