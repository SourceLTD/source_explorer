import { prisma } from './prisma'
import type { LexicalEntry, EntryRelation, RelationType, Prisma } from '@prisma/client'

// Type definitions for common queries
export type LexicalEntryWithRelations = LexicalEntry & {
  sourceRelations: (EntryRelation & {
    target: LexicalEntry
  })[]
  targetRelations: (EntryRelation & {
    source: LexicalEntry
  })[]
}

export type LexicalEntryCreateInput = Omit<LexicalEntry, 'id' | 'createdAt' | 'updatedAt' | 'glossTsv' | 'examplesTsv'>
export type LexicalEntryUpdateInput = Partial<LexicalEntryCreateInput>

// Database utility functions
export class DatabaseService {
  
  // ===== LEXICAL ENTRIES =====
  
  /**
   * Create a new lexical entry
   */
  async createLexicalEntry(data: LexicalEntryCreateInput & { id: string }) {
    return prisma.lexicalEntry.create({
      data,
      include: {
        sourceRelations: {
          include: { target: true }
        },
        targetRelations: {
          include: { source: true }
        }
      }
    })
  }

  /**
   * Get lexical entry by ID with optional relations
   */
  async getLexicalEntry(id: string, includeRelations: boolean = false) {
    return prisma.lexicalEntry.findUnique({
      where: { id },
      include: includeRelations ? {
        sourceRelations: {
          include: { target: true }
        },
        targetRelations: {
          include: { source: true }
        }
      } : undefined
    })
  }

  /**
   * Update lexical entry
   */
  async updateLexicalEntry(id: string, data: LexicalEntryUpdateInput) {
    return prisma.lexicalEntry.update({
      where: { id },
      data,
      include: {
        sourceRelations: {
          include: { target: true }
        },
        targetRelations: {
          include: { source: true }
        }
      }
    })
  }

  /**
   * Delete lexical entry
   */
  async deleteLexicalEntry(id: string) {
    return prisma.lexicalEntry.delete({
      where: { id }
    })
  }

  /**
   * Search lexical entries by text (uses full-text search)
   */
  async searchLexicalEntries(query: string, options: {
    limit?: number
    offset?: number
    pos?: string
    includeMwe?: boolean
  } = {}) {
    const { limit = 50, offset = 0, pos, includeMwe = true } = options
    
    // Use raw query for full-text search with tsvector
    const searchQuery = `
      SELECT *
      FROM lexical_entries
      WHERE (
        gloss_tsv @@ plainto_tsquery('english', $1)
        OR examples_tsv @@ plainto_tsquery('english', $1)
        OR $1 = ANY(lemmas)
        OR $1 = ANY(particles)
      )
      ${pos ? 'AND pos = $4' : ''}
      ${!includeMwe ? 'AND is_mwe = false' : ''}
      ORDER BY 
        ts_rank(gloss_tsv, plainto_tsquery('english', $1)) DESC,
        ts_rank(examples_tsv, plainto_tsquery('english', $1)) DESC
      LIMIT $2 OFFSET $3
    `
    
    const params = pos 
      ? [query, limit, offset, pos]
      : [query, limit, offset]
    
    return prisma.$queryRawUnsafe(searchQuery, ...params) as Promise<LexicalEntry[]>
  }

  /**
   * Get lexical entries by POS
   */
  async getLexicalEntriesByPos(pos: string, limit: number = 100, offset: number = 0) {
    return prisma.lexicalEntry.findMany({
      where: { pos },
      take: limit,
      skip: offset,
      orderBy: { gloss: 'asc' }
    })
  }

  /**
   * Get lexical entries by lemma
   */
  async getLexicalEntriesByLemma(lemma: string) {
    return prisma.lexicalEntry.findMany({
      where: {
        lemmas: {
          has: lemma
        }
      },
      orderBy: { gloss: 'asc' }
    })
  }

  /**
   * Get multiword expressions
   */
  async getMultiwordExpressions(limit: number = 100, offset: number = 0) {
    return prisma.lexicalEntry.findMany({
      where: { isMwe: true },
      take: limit,
      skip: offset,
      orderBy: { gloss: 'asc' }
    })
  }

  // ===== ENTRY RELATIONS =====

  /**
   * Create a relation between entries
   */
  async createEntryRelation(sourceId: string, targetId: string, type: RelationType) {
    return prisma.entryRelation.create({
      data: {
        sourceId,
        targetId,
        type
      },
      include: {
        source: true,
        target: true
      }
    })
  }

  /**
   * Get relations for an entry
   */
  async getEntryRelations(entryId: string, relationType?: RelationType) {
    const where: Prisma.EntryRelationWhereInput = {
      OR: [
        { sourceId: entryId },
        { targetId: entryId }
      ]
    }

    if (relationType) {
      where.type = relationType
    }

    return prisma.entryRelation.findMany({
      where,
      include: {
        source: true,
        target: true
      }
    })
  }

  /**
   * Delete a relation between entries
   */
  async deleteEntryRelation(sourceId: string, targetId: string, type: RelationType) {
    return prisma.entryRelation.delete({
      where: {
        sourceId_type_targetId: {
          sourceId,
          targetId,
          type
        }
      }
    })
  }

  /**
   * Get entries by relation type (e.g., all hypernyms)
   */
  async getEntriesByRelationType(type: RelationType, limit: number = 100, offset: number = 0) {
    return prisma.entryRelation.findMany({
      where: { type },
      include: {
        source: true,
        target: true
      },
      take: limit,
      skip: offset
    })
  }

  // ===== STATISTICS & UTILITIES =====

  /**
   * Get database statistics
   */
  async getStatistics() {
    const [
      totalEntries,
      totalRelations,
      entriesByPos,
      mweCount,
      relationsByType
    ] = await Promise.all([
      prisma.lexicalEntry.count(),
      prisma.entryRelation.count(),
      prisma.lexicalEntry.groupBy({
        by: ['pos'],
        _count: true
      }),
      prisma.lexicalEntry.count({ where: { isMwe: true } }),
      prisma.entryRelation.groupBy({
        by: ['type'],
        _count: true
      })
    ])

    return {
      totalEntries,
      totalRelations,
      multiwordExpressions: mweCount,
      entriesByPos: entriesByPos.map(item => ({
        pos: item.pos,
        count: item._count
      })),
      relationsByType: relationsByType.map(item => ({
        type: item.type,
        count: item._count
      }))
    }
  }

  /**
   * Bulk insert lexical entries
   */
  async bulkInsertLexicalEntries(entries: (LexicalEntryCreateInput & { id: string })[]) {
    return prisma.lexicalEntry.createMany({
      data: entries,
      skipDuplicates: true
    })
  }

  /**
   * Bulk insert relations
   */
  async bulkInsertRelations(relations: { sourceId: string, targetId: string, type: RelationType }[]) {
    return prisma.entryRelation.createMany({
      data: relations,
      skipDuplicates: true
    })
  }
}

// Export singleton instance
export const db = new DatabaseService()
