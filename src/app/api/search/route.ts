import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { SearchOptions } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body: SearchOptions = await request.json()
    
    if (!body.query?.trim()) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    const entries = await db.searchLexicalEntries(body.query, {
      limit: body.limit || 50,
      offset: body.offset || 0,
      pos: body.pos,
      includeMwe: body.includeMwe ?? true
    })

    // Get total count for pagination (simplified - you might want to optimize this)
    const totalEntries = await db.searchLexicalEntries(body.query, {
      limit: 1000, // Large number to get approximate total
      offset: 0,
      pos: body.pos,
      includeMwe: body.includeMwe ?? true
    })

    return NextResponse.json({
      entries,
      total: totalEntries.length,
      hasMore: entries.length === (body.limit || 50)
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}