# DataTable Component Refactoring

## Overview

The `DataTable` component has been refactored to be **data-agnostic** and **reusable** across different data types (verbs, adverbs, nouns, etc.) while maintaining backward compatibility with the existing verbs implementation.

## What Changed

### 1. **Extracted Verb-Specific Configuration**

Created `DataTable.config.tsx` containing:
- `VERBS_COLUMNS`: Column definitions for verbs
- `VERBS_COLUMN_WIDTHS`: Default column widths for verbs
- `renderVerbsCell`: Cell rendering function for verbs
- `fetchVerbRelations`: Relations fetching logic for verbs

### 2. **Made DataTable Accept Configuration Props**

The `DataTable` component now accepts the following optional props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `ColumnConfig[]` | `VERBS_COLUMNS` | Column definitions |
| `defaultColumnWidths` | `ColumnWidthState` | `VERBS_COLUMN_WIDTHS` | Default column widths |
| `apiEndpoint` | `string` | `'/api/entries/paginated'` | API endpoint for fetching data |
| `storageKeyPrefix` | `string` | `'table'` | localStorage key prefix for saving preferences |
| `renderCell` | `function` | `renderVerbsCell` | Custom cell renderer function |
| `fetchRelations` | `function` | `fetchVerbRelations` | Custom relations fetcher function |
| `moderationEndpoint` | `string` | `'/api/entries/moderation'` | API endpoint for moderation updates |

### 3. **Maintained Backward Compatibility**

The existing verbs table implementation **continues to work exactly as before** without any changes:

```tsx
// This still works exactly as before
<DataTable 
  onRowClick={handleTableRowClick}
  searchQuery={searchQuery}
/>
```

## Usage Examples

### Using with Verbs (Default - No Changes Required)

```tsx
import DataTable from '@/components/DataTable';

// Works exactly as before - uses verb configuration by default
<DataTable 
  onRowClick={handleRowClick}
  searchQuery={searchQuery}
/>
```

### Using with Adverbs (New Capability)

```tsx
import DataTable from '@/components/DataTable';
import { 
  ADVERBS_COLUMNS, 
  ADVERBS_COLUMN_WIDTHS, 
  renderAdverbsCell,
  fetchAdverbRelations 
} from '@/components/DataTable.adverbs.config';

<DataTable 
  onRowClick={handleRowClick}
  searchQuery={searchQuery}
  columns={ADVERBS_COLUMNS}
  defaultColumnWidths={ADVERBS_COLUMN_WIDTHS}
  apiEndpoint="/api/adverbs/paginated"
  storageKeyPrefix="adverbs-table"
  renderCell={renderAdverbsCell}
  fetchRelations={fetchAdverbRelations}
  moderationEndpoint="/api/adverbs/moderation"
/>
```

### Using with Custom Data

You can create your own configuration:

```tsx
// mydata.config.tsx
export const MY_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'name', label: 'Name', visible: true, sortable: true },
  // ... more columns
];

export const MY_COLUMN_WIDTHS = {
  id: 100,
  name: 200,
};

export const renderMyCell = (entry, columnKey, relationsData) => {
  // Custom rendering logic
  switch (columnKey) {
    case 'name':
      return <span className="font-bold">{entry.name}</span>;
    default:
      return <span>{entry[columnKey]}</span>;
  }
};

// Then use it:
<DataTable 
  columns={MY_COLUMNS}
  defaultColumnWidths={MY_COLUMN_WIDTHS}
  apiEndpoint="/api/mydata/paginated"
  storageKeyPrefix="mydata-table"
  renderCell={renderMyCell}
/>
```

## Creating a Configuration for New Data Types

1. **Create a configuration file** (e.g., `DataTable.adverbs.config.tsx`)
2. **Define columns** using the `ColumnConfig` interface
3. **Define column widths** using the `ColumnWidthState` interface
4. **Create a cell renderer** function with signature:
   ```tsx
   (entry: TableEntry, columnKey: string, relationsData?: { parents: string[]; children: string[] }) => React.ReactNode
   ```
5. **Create a relations fetcher** (if needed) with signature:
   ```tsx
   (entryId: string) => Promise<{ parents: string[]; children: string[] }>
   ```

See `DataTable.adverbs.config.example.tsx` for a complete example.

## Benefits

1. ✅ **Reusability**: Use the same table component for different data types
2. ✅ **Backward Compatibility**: Existing verbs implementation works without changes
3. ✅ **Separation of Concerns**: Data-specific logic is separated from table logic
4. ✅ **Flexibility**: Easy to customize for new data types
5. ✅ **Maintainability**: Single source of truth for table functionality
6. ✅ **Type Safety**: Full TypeScript support
7. ✅ **Independent Storage**: Each table type has its own localStorage keys

## Files Changed

- ✏️ `src/components/DataTable.tsx` - Made configurable via props
- ✨ `src/components/DataTable.config.tsx` - Extracted verb-specific configuration
- 📖 `src/components/DataTable.adverbs.config.example.tsx` - Example for adverbs

## Migration Guide

No migration needed! The existing implementation continues to work exactly as before.

## Testing Checklist

- [x] Verbs table loads and displays correctly
- [x] Column visibility settings persist in localStorage with correct keys
- [x] Column width adjustments work and persist
- [x] Sorting works correctly
- [x] Filtering works correctly
- [x] Pagination works correctly
- [x] Row selection works correctly
- [x] Relations data fetches correctly
- [x] All existing functionality preserved

## Future Enhancements

When ready to add adverbs or other data types:

1. Create API endpoints (e.g., `/api/adverbs/paginated`)
2. Create configuration file (e.g., `DataTable.adverbs.config.tsx`)
3. Use `DataTable` with custom configuration
4. Each table type will have independent localStorage preferences