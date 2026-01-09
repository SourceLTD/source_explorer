'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import PendingChangesButton from '@/components/PendingChangesButton';
import SignOutButton from '@/components/SignOutButton';
import CategoryDropdown from '@/components/CategoryDropdown';
import { EditOverlay } from '@/components/editing/EditOverlay';
import { Mode } from '@/components/editing/types';
import { SearchResult, TableEntry, Frame, GraphNode } from '@/lib/types';

interface TablePageLayoutProps {
  mode: Mode;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  // Edit overlay props
  isEditOverlayOpen: boolean;
  currentEntity: GraphNode | Frame | null;
  selectedEntityId: string;
  refreshTrigger: number;
  onEditClick: (entry: TableEntry | Frame) => Promise<void>;
  onUpdate: () => Promise<void>;
  onCloseOverlay: () => void;
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
  verbs: {
    graphPath: '/graph',
    searchPlaceholder: 'Search table...',
    showRecipes: true,
    showPendingChanges: true,
  },
  nouns: {
    graphPath: '/graph/nouns',
    searchPlaceholder: 'Search table...',
    showRecipes: false,
    showPendingChanges: true,
  },
  adjectives: {
    graphPath: '/graph/adjectives',
    searchPlaceholder: 'Search table...',
    showRecipes: false,
    showPendingChanges: true,
  },
  adverbs: {
    graphPath: '/graph/adverbs',
    searchPlaceholder: 'Search table...',
    showRecipes: false,
    showPendingChanges: true,
  },
  frames: {
    graphPath: '/graph/frames',
    searchPlaceholder: 'Search frames...',
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
}: TablePageLayoutProps) {
  const router = useRouter();
  const config = modeConfig[mode];

  const handleSearchResult = (result: SearchResult) => {
    router.push(`${config.graphPath}?entry=${result.id}`);
  };

  const handleViewChange = (view: ViewMode) => {
    if (view === 'graph') {
      router.push(`${config.graphPath}?view=graph`);
    } else if (view === 'recipes' && config.showRecipes) {
      router.push(`${config.graphPath}?view=recipes`);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/')}
              className="text-xl font-bold text-gray-900 hover:text-gray-700 cursor-pointer"
            >
              Source Console
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <CategoryDropdown currentCategory={mode} currentView="table" />
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={onSearchQueryChange}
                placeholder={config.searchPlaceholder}
                mode={mode === 'verbs' ? undefined : mode}
              />
            </div>
            <ViewToggle 
              currentView="table"
              onViewChange={handleViewChange}
              hideRecipes={!config.showRecipes}
            />
            {config.showPendingChanges && <PendingChangesButton />}
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-white">
        <div className="m-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
            <DataTable 
              searchQuery={searchQuery}
              mode={mode}
              onEditClick={onEditClick}
              refreshTrigger={refreshTrigger}
            />
          </Suspense>
        </div>
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
