'use client'

import { useState } from 'react'
import { useSearchEntries } from '@/lib/hooks'
import { POS_LABELS, RELATION_LABELS } from '@/lib/types'
import type { LexicalEntry } from '@prisma/client'

export default function SearchExample() {
  const [query, setQuery] = useState('')
  const [selectedPos, setSelectedPos] = useState<string>('')
  const { results, loading, error, search } = useSearchEntries()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      search({
        query: query.trim(),
        pos: selectedPos || undefined,
        limit: 20
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Lexical Database Search</h1>
      
      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            value={selectedPos}
            onChange={(e) => setSelectedPos(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All POS</option>
            {Object.entries(POS_LABELS).map(([pos, label]) => (
              <option key={pos} value={pos}>{label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">Error: {error}</p>
        </div>
      )}

      {/* Results */}
      {results.entries.length > 0 && (
        <div>
          <div className="mb-4 text-sm text-gray-600">
            Found {results.total} entries {results.hasMore && '(showing first 20)'}
          </div>
          
          <div className="space-y-4">
            {results.entries.map((entry: LexicalEntry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {query && !loading && results.entries.length === 0 && !error && (
        <div className="text-center py-8 text-gray-500">
          No entries found for "{query}"
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry }: { entry: LexicalEntry }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-lg text-blue-600">
          {entry.lemmas[0] || entry.id}
        </h3>
        <div className="flex gap-2">
          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
            {POS_LABELS[entry.pos] || entry.pos}
          </span>
          {entry.isMwe && (
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
              MWE
            </span>
          )}
        </div>
      </div>
      
      <p className="text-gray-700 mb-3">{entry.gloss}</p>
      
      {entry.lemmas.length > 1 && (
        <div className="mb-2">
          <span className="text-sm font-medium text-gray-600">Lemmas: </span>
          <span className="text-sm text-gray-700">
            {entry.lemmas.join(', ')}
          </span>
        </div>
      )}
      
      {entry.examples.length > 0 && (
        <div className="mb-2">
          <span className="text-sm font-medium text-gray-600">Examples: </span>
          <div className="text-sm text-gray-700 italic">
            {entry.examples.slice(0, 2).map((example, i) => (
              <div key={i}>"{example}"</div>
            ))}
            {entry.examples.length > 2 && (
              <div className="text-xs text-gray-500">
                +{entry.examples.length - 2} more
              </div>
            )}
          </div>
        </div>
      )}
      
      {entry.frames.length > 0 && (
        <div className="mb-2">
          <span className="text-sm font-medium text-gray-600">Frames: </span>
          <span className="text-sm text-gray-700">
            {entry.frames.slice(0, 2).join(', ')}
            {entry.frames.length > 2 && ` +${entry.frames.length - 2} more`}
          </span>
        </div>
      )}
      
      <div className="text-xs text-gray-500 mt-2">
        ID: {entry.id} | Lexfile: {entry.lexfile}
      </div>
    </div>
  )
}