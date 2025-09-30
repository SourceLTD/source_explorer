# DataTable Quick Start Guide

## Current Usage (Verbs) - No Changes Required ✅

Your existing verbs table works exactly as before:

```tsx
// src/app/table/page.tsx
import DataTable from '@/components/DataTable';

<DataTable 
  onRowClick={handleTableRowClick}
  searchQuery={searchQuery}
/>
```

## Future Usage (Adverbs or Other Data)

### Step 1: Create Configuration File

Create `src/components/DataTable.adverbs.config.tsx`:

```tsx
import React from 'react';
import { TableEntry } from '@/lib/types';
import { ColumnConfig } from './ColumnVisibilityPanel';
import { ColumnWidthState } from './DataTable.config';

// Define columns
export const ADVERBS_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  // ... add your adverb-specific columns
];

// Define widths
export const ADVERBS_COLUMN_WIDTHS: ColumnWidthState = {
  id: 120,
  lemmas: 150,
  gloss: 350,
  // ... add widths for your columns
};

// Define cell renderer
export const renderAdverbsCell = (entry, columnKey, relationsData) => {
  switch (columnKey) {
    case 'lemmas':
      return <div>{entry.lemmas.join(', ')}</div>;
    case 'gloss':
      return <div>{entry.gloss}</div>;
    // ... add rendering for your columns
    default:
      return <span>{entry[columnKey]}</span>;
  }
};

// Optional: Custom relations fetcher
export const fetchAdverbRelations = async (entryId) => {
  const response = await fetch(`/api/adverbs/${entryId}/relations`);
  const data = await response.json();
  // ... process and return { parents: [], children: [] }
};
```

### Step 2: Use the Configuration

Create `src/app/adverbs/page.tsx`:

```tsx
import DataTable from '@/components/DataTable';
import { 
  ADVERBS_COLUMNS, 
  ADVERBS_COLUMN_WIDTHS, 
  renderAdverbsCell,
  fetchAdverbRelations 
} from '@/components/DataTable.adverbs.config';

export default function AdverbsPage() {
  return (
    <DataTable 
      columns={ADVERBS_COLUMNS}
      defaultColumnWidths={ADVERBS_COLUMN_WIDTHS}
      apiEndpoint="/api/adverbs/paginated"
      storageKeyPrefix="adverbs-table"
      renderCell={renderAdverbsCell}
      fetchRelations={fetchAdverbRelations}
      moderationEndpoint="/api/adverbs/moderation"
      onRowClick={handleRowClick}
      searchQuery={searchQuery}
    />
  );
}
```

## Configuration Props Reference

| Prop | Required | Default | Description |
|------|----------|---------|-------------|
| `columns` | No | Verbs columns | Column definitions |
| `defaultColumnWidths` | No | Verbs widths | Column widths |
| `apiEndpoint` | No | `/api/entries/paginated` | Data API endpoint |
| `storageKeyPrefix` | No | `table` | localStorage key prefix |
| `renderCell` | No | Verbs renderer | Cell rendering function |
| `fetchRelations` | No | Verbs relations | Relations fetcher |
| `moderationEndpoint` | No | `/api/entries/moderation` | Moderation API |

## Key Features

- 🔄 **Separate localStorage**: Each table type stores preferences independently
- 🎨 **Custom styling**: Define your own cell rendering
- 📊 **Custom data**: Use any data structure that matches `TableEntry` interface
- ⚡ **No breaking changes**: Existing verbs table works without modifications

## See Also

- `DATATABLE_REFACTOR.md` - Detailed documentation
- `DataTable.adverbs.config.example.tsx` - Complete example configuration
- `DataTable.config.tsx` - Verbs configuration (reference implementation)