'use client'

import { useState, useEffect, useCallback } from 'react'
import type { 
  LexicalEntry, 
  LexicalEntryWithRelations, 
  SearchOptions, 
  SearchResult,
  DatabaseStats,
  EntryRelationWithEntries,
  RelationType
} from './types'

// Custom hook for searching lexical entries
export function useSearchEntries() {
  const [results, setResults] = useState<SearchResult>({
    entries: [],
    total: 0,
    hasMore: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = useCallback(async (options: SearchOptions) => {
    if (!options.query.trim()) {
      setResults({ entries: [], total: 0, hasMore: false })
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults({ entries: [], total: 0, hasMore: false })
    } finally {
      setLoading(false)
    }
  }, [])

  return { results, loading, error, search }
}

// Custom hook for managing a single lexical entry
export function useLexicalEntry(id: string | null) {
  const [entry, setEntry] = useState<LexicalEntryWithRelations | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntry = useCallback(async (entryId: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/entries/${entryId}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch entry')
      }

      const data = await response.json()
      setEntry(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch entry')
      setEntry(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateEntry = useCallback(async (entryId: string, updates: Partial<LexicalEntry>) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error('Failed to update entry')
      }

      const updatedEntry = await response.json()
      setEntry(updatedEntry)
      return updatedEntry
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update entry')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteEntry = useCallback(async (entryId: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete entry')
      }

      setEntry(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (id) {
      fetchEntry(id)
    } else {
      setEntry(null)
    }
  }, [id, fetchEntry])

  return { entry, loading, error, updateEntry, deleteEntry, refetch: () => id && fetchEntry(id) }
}

// Custom hook for managing entry relations
export function useEntryRelations(entryId: string | null) {
  const [relations, setRelations] = useState<EntryRelationWithEntries[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRelations = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/entries/${id}/relations`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch relations')
      }

      const data = await response.json()
      setRelations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch relations')
      setRelations([])
    } finally {
      setLoading(false)
    }
  }, [])

  const addRelation = useCallback(async (sourceId: string, targetId: string, type: RelationType) => {
    try {
      const response = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId, type })
      })

      if (!response.ok) {
        throw new Error('Failed to add relation')
      }

      // Refresh relations
      if (entryId) {
        await fetchRelations(entryId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add relation')
      throw err
    }
  }, [entryId, fetchRelations])

  const removeRelation = useCallback(async (sourceId: string, targetId: string, type: RelationType) => {
    try {
      const response = await fetch('/api/relations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId, type })
      })

      if (!response.ok) {
        throw new Error('Failed to remove relation')
      }

      // Refresh relations
      if (entryId) {
        await fetchRelations(entryId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove relation')
      throw err
    }
  }, [entryId, fetchRelations])

  useEffect(() => {
    if (entryId) {
      fetchRelations(entryId)
    } else {
      setRelations([])
    }
  }, [entryId, fetchRelations])

  return { relations, loading, error, addRelation, removeRelation, refetch: () => entryId && fetchRelations(entryId) }
}

// Custom hook for database statistics
export function useDatabaseStats() {
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/stats')
      
      if (!response.ok) {
        throw new Error('Failed to fetch statistics')
      }

      const data = await response.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch statistics')
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, error, refetch: fetchStats }
}