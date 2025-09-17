'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TableEntry, PaginatedResult, POS_LABELS, PaginationParams } from '@/lib/types';

interface DataTableProps {
  onRowClick?: (entry: TableEntry) => void;
  searchQuery?: string;
  className?: string;
}

interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

export default function DataTable({ onRowClick, searchQuery, className }: DataTableProps) {
  const [data, setData] = useState<PaginatedResult<TableEntry> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortState, setSortState] = useState<SortState>({ field: 'id', order: 'asc' });
  const [filters, setFilters] = useState({
    pos: '',
    lexfile: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: PaginationParams = {
        page: currentPage,
        limit: pageSize,
        sortBy: sortState.field,
        sortOrder: sortState.order,
        search: searchQuery || undefined,
        pos: filters.pos || undefined,
        lexfile: filters.lexfile || undefined,
      };

      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value.toString());
        }
      });

      const response = await fetch(`/api/entries/paginated?${queryParams}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result: PaginatedResult<TableEntry> = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortState, searchQuery, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSort = (field: string) => {
    setSortState(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const getSortIcon = (field: string) => {
    if (sortState.field !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }

    return sortState.order === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // const formatDate = (date: Date) => {
  //   return new Date(date).toLocaleDateString();
  // };

  if (loading && !data) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border ${className || ''}`}>
        <div className="p-8 text-center">
          <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">Loading entries...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border ${className || ''}`}>
        <div className="p-8 text-center text-red-600">
          <svg className="h-12 w-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p>Error loading data: {error}</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border ${className || ''}`}>
        <div className="p-8 text-center text-gray-400">
          <svg className="h-24 w-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No entries found</p>
          {(searchQuery || filters.pos || filters.lexfile) && (
            <p className="text-sm mt-2">Try adjusting your search or filters</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className || ''}`}>
      {/* Filters */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Part of Speech:</label>
            <select
              value={filters.pos}
              onChange={(e) => handleFilterChange('pos', e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All</option>
              {Object.entries(POS_LABELS).map(([pos, label]) => (
                <option key={pos} value={pos}>{label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Lexical File:</label>
            <input
              type="text"
              value={filters.lexfile}
              onChange={(e) => handleFilterChange('lexfile', e.target.value)}
              placeholder="Filter by lexfile..."
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-sm font-medium text-gray-700">Show:</label>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('lemmas')}
              >
                <div className="flex items-center gap-2">
                  Lemmas
                  {getSortIcon('lemmas')}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('gloss')}
              >
                <div className="flex items-center gap-2">
                  Definition
                  {getSortIcon('gloss')}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('pos')}
              >
                <div className="flex items-center gap-2">
                  POS
                  {getSortIcon('pos')}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('parentsCount')}
              >
                <div className="flex items-center gap-2">
                  Parents
                  {getSortIcon('parentsCount')}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('childrenCount')}
              >
                <div className="flex items-center gap-2">
                  Children
                  {getSortIcon('childrenCount')}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('lexfile')}
              >
                <div className="flex items-center gap-2">
                  Lexfile
                  {getSortIcon('lexfile')}
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Examples
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.data.map((entry) => (
              <tr
                key={entry.id}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(entry)}
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {entry.lemmas.slice(0, 3).map((lemma, idx) => (
                      <span 
                        key={idx}
                        className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                      >
                        {lemma}
                      </span>
                    ))}
                    {entry.lemmas.length > 3 && (
                      <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                        +{entry.lemmas.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-900" title={entry.gloss}>
                    {truncateText(entry.gloss, 100)}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                    {POS_LABELS[entry.pos as keyof typeof POS_LABELS] || entry.pos}
                  </span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  <span className="text-sm text-gray-900">{entry.parentsCount}</span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-center">
                  <span className="text-sm text-gray-900">{entry.childrenCount}</span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className="text-xs text-gray-500">{entry.lexfile}</span>
                </td>
                <td className="px-4 py-4">
                  {entry.examples.length > 0 ? (
                    <div className="text-xs text-gray-600" title={entry.examples.join('; ')}>
                      {truncateText(entry.examples[0], 80)}
                      {entry.examples.length > 1 && ` (+${entry.examples.length - 1})`}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No examples</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total} entries
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(data.page - 1)}
            disabled={!data.hasPrev || loading}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(data.totalPages - 4, data.page - 2)) + i;
              if (pageNum > data.totalPages) return null;
              
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  disabled={loading}
                  className={`px-3 py-1 text-sm border rounded ${
                    pageNum === data.page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-100'
                  } disabled:opacity-50`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => handlePageChange(data.page + 1)}
            disabled={!data.hasNext || loading}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
      
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
        </div>
      )}
    </div>
  );
}