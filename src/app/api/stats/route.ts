import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/stats - Get database statistics
export async function GET() {
  try {
    const [entriesCount, relationsCount] = await Promise.all([
      prisma.verbs.count({ 
        where: { 
          deleted: false
        } 
      }),
      prisma.verb_relations.count()
    ])
    
    const stats = {
      entries: entriesCount,
      relations: relationsCount
    }
    
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
