'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import PendingChangesButton from '@/components/PendingChangesButton';
import SignOutButton from '@/components/SignOutButton';
import ChatButton from '@/components/ChatButton';
import { EditOverlay } from '@/components/editing/EditOverlay';
import { Mode } from '@/components/editing/types';
import { SearchResult, TableEntry, Concept, GraphNode } from '@/lib/types';

interface TablePageLayoutProps {
  mode: Mode;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  // Edit overlay props
  isEditOverlayOpen: boolean;
  currentEntity: GraphNode | Concept | null;
  selectedEntityId: string;
  refreshTrigger: number;
  onEditClick: (entry: TableEntry | Concept) => Promise<void>;
  onUpdate: () => Promise<void>;
  onCloseOverlay: () => void;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
  showViewToggle?: boolean;
  showSensesLink?: boolean;
  searchPlaceholder?: string;
}

/**
 * Configuration for each mode
 */
const modeConfig: Record<Mode, {
  graphPath: string;
  searchPlaceholder: string;
  showRecipes: boolean;
  showPendingChanges: boolean;
}> = {
  lexical_units: {
    graphPath: '/graph',
    searchPlaceholder: 'Search...',
    showRecipes: false,
    showPendingChanges: true,
  },
  verbs: {
    graphPath: '/graph',
    searchPlaceholder: 'Search verbs...',
    showRecipes: false,
    showPendingChanges: true,
  },
  nouns: {
    graphPath: '/graph',
    searchPlaceholder: 'Search nouns...',
    showRecipes: false,
    showPendingChanges: true,
  },
  adjectives: {
    graphPath: '/graph',
    searchPlaceholder: 'Search adjectives...',
    showRecipes: false,
    showPendingChanges: true,
  },
  adverbs: {
    graphPath: '/graph',
    searchPlaceholder: 'Search adverbs...',
    showRecipes: false,
    showPendingChanges: true,
  },
  concepts: {
    graphPath: '/graph/concepts',
    searchPlaceholder: 'Search concepts...',
    showRecipes: true,
    showPendingChanges: true,
  },
};

/**
 * Shared layout component for all table pages.
 * Provides consistent header, search, navigation, and edit overlay functionality.
 */
export function TablePageLayout({
  mode,
  searchQuery,
  onSearchQueryChange,
  isEditOverlayOpen,
  currentEntity,
  selectedEntityId,
  refreshTrigger,
  onEditClick,
  onUpdate,
  onCloseOverlay,
  tabs,
  children,
  showViewToggle = false,
  showSensesLink = false,
  searchPlaceholder,
}: TablePageLayoutProps) {
  const router = useRouter();
  const config = modeConfig[mode];
  const resolvedSearchPlaceholder = searchPlaceholder ?? config.searchPlaceholder;

  const handleSearchResult = (result: SearchResult) => {
    router.push(`${config.graphPath}?entry=${result.id}`);
  };

  const handleViewChange = (view: ViewMode) => {
    if (view === 'graph') {
      router.push(`${config.graphPath}?view=graph`);
    }
  };

  return (
    <div className="h-screen-zoomed flex flex-col bg-white">
      {/* Header */}
      <header className="bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/')}
              className="text-xl font-bold text-gray-900 hover:text-gray-700 cursor-pointer shrink-0"
            >
              Source Console
            </button>
            {tabs && (
              <div className="flex items-center gap-1 ml-2">
                {tabs}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end ml-4">
            <div className="flex-1 max-w-xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={onSearchQueryChange}
                placeholder={resolvedSearchPlaceholder}
                mode={mode === 'verbs' ? undefined : mode}
              />
            </div>
            {showSensesLink && (
              <button
                type="button"
                onClick={() => router.push('/table')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
              >
                Senses
              </button>
            )}
            {showViewToggle && (
              <ViewToggle 
                currentView="table"
                onViewChange={handleViewChange}
              />
            )}
            {config.showPendingChanges && <PendingChangesButton />}
            <ChatButton />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col bg-white">
        {children || (
          <div className="mt-2 mx-6 mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden flex-1 min-h-0 flex flex-col">
            <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
              <DataTable 
                searchQuery={searchQuery}
                mode={mode === 'concepts' ? 'concepts' : 'lexical_units'}
                onEditClick={onEditClick}
                refreshTrigger={refreshTrigger}
              />
            </Suspense>
          </div>
        )}
      </main>

      {/* Edit Overlay */}
      {isEditOverlayOpen && (
        <EditOverlay
          node={currentEntity}
          nodeId={selectedEntityId}
          mode={mode}
          isOpen={isEditOverlayOpen}
          onClose={onCloseOverlay}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}
