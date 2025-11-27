# Table Mode Moderation Bug Fix

## Date
November 27, 2025

## Problem Report
User reported that when they mark entries as forbidden or flagged in table mode, the number they have selected seems to be different from the number that ultimately gets flagged or forbidden.

## Root Cause Analysis

After comprehensive investigation, **five critical bugs** were identified:

### Bug #1: No User Feedback on Actual Count Updated
**Location:** `src/components/DataTable.tsx` - `handleModerationUpdate()` function

**Issue:** 
- The API returns the actual count of entries updated via `updatedCount` or `count` field in the response
- The frontend code was not parsing this response or showing any feedback to the user
- User only saw a console.log message that they couldn't see
- This meant users had NO way to know if their operation succeeded, partially succeeded, or failed

**Impact:** Users were confused when their selected count didn't match the updated count, but had no feedback to explain what happened.

### Bug #2: Optimistic Update Only Affected Current Page
**Location:** `src/components/DataTable.tsx` - `handleModerationUpdate()` function, lines 958-969

**Issue:**
- After a moderation update, the code performed an "optimistic update" to the local state
- This update only modified entries in `prevData.data`, which contains ONLY the current page's entries
- If a user selected entries across multiple pages, only the entries on the current page would be visually updated in the UI

**Impact:** After moderation, if the user was on page 2 and had selected entries from page 1, the page 1 entries wouldn't update in the UI until they navigated back and refreshed.

### Bug #3: No Data Refresh After Moderation
**Location:** `src/components/DataTable.tsx` - `handleModerationUpdate()` function

**Issue:**
- The function didn't call `fetchData()` to refresh the table data from the server
- This meant the UI could be out of sync with the database state

**Impact:** Stale data was displayed to users after moderation operations.

### Bug #4: Same Issues in Frame Update Function
**Location:** `src/components/DataTable.tsx` - `handleConfirmFrameChange()` function

**Issue:**
- The same problems existed in the frame change bulk operation
- No feedback on actual count updated
- No proper error handling

### Bug #5: Multi-Page Selection Display Issues ⚠️ **CRITICAL**
**Location:** `src/components/DataTable.tsx` - `selectedEntries` variable (line 388-393)

**Issue:**
```typescript
const selectedEntries = useMemo(() => {
  return data.data.filter(entry => selection.selectedIds.has(entry.id));
}, [data, selection.selectedIds]);
```

- `selectedEntries` is calculated by filtering `data.data`
- **`data.data` only contains entries from the CURRENT PAGE** (paginated data)
- But `selection.selectedIds` can contain IDs from multiple pages
- This mismatch causes several critical bugs:

**Bug 5a: Incorrect Button Logic** (line 1266 - `getSelectionModerationState()`)
- Function checks `selectedEntries` to determine which buttons to show (Flag/Unflag/Forbid/Allow)
- Only examines entries on current page, not all selected entries
- Example: Select 5 flagged entries on page 1, go to page 2, select 3 unflagged entries
  - Should show both Flag and Unflag buttons (mixed state)
  - But only shows buttons based on page 2's entries

**Bug 5b: Misleading Frame Summary** (line 2438 - Frame modal)
- Shows "Current Frame Breakdown" for selected verbs
- Only includes frames from current page
- User thinks they see breakdown of all 8 selected verbs, but only seeing 3

**Bug 5c: Incomplete Reason Display** (line 2321 - Moderation modal)
- Shows existing flag/forbidden reasons for selected entries
- Only shows reasons for entries on current page
- User selected 10 entries with reasons, but only sees 4 reasons

**Impact:** Users were completely unaware when their selections spanned multiple pages, leading to confusing and inconsistent UI behavior.

### Bug #6: Inconsistent Database Filtering
**Location:** `src/lib/db.ts` - `updateModerationStatus()` function

**Issue:**
- For `verbs`, the update query included `deleted: false` filter
- For `nouns`, `adjectives`, and `adverbs`, there was no such filter
- This inconsistency could lead to unexpected behavior

**Note:** The inconsistency was documented with comments explaining that only verbs have a deleted field.

## Fixes Applied

### Fix #1: Import Alert System
**File:** `src/components/DataTable.tsx`

Added import for the global alert system:
```typescript
import { showGlobalAlert } from '@/lib/alerts';
```

### Fix #2: Enhanced `handleModerationUpdate()` Function

**Changes:**
1. **Parse Response Data**: Now extracts `updatedCount` or `count` from API response
2. **Refresh Data**: Calls `await fetchData()` to ensure UI is in sync with database
3. **Smart Feedback**: Shows different toast messages based on outcome:
   - **Success (100% match)**: Green success toast
   - **Partial Success**: Warning toast showing "X of Y entries were updated"
   - **Complete Failure**: Error toast explaining no entries were updated
4. **Better Error Handling**: Catches errors and shows user-friendly error messages
5. **Removed Optimistic Update**: No longer needed since we refresh data from server

**Example User Feedback:**
- Success: "Successfully forbidden 8 entries."
- Partial: "Only 5 of 8 selected entries were forbidden. Some entries may not exist or are no longer accessible."
- Failure: "No entries were forbidden. The selected entries may not exist or are no longer accessible."

### Fix #3: Enhanced `handleConfirmFrameChange()` Function

Applied the same improvements to the bulk frame update operation:
1. Parse response to get actual count
2. Refresh data after update
3. Show appropriate success/warning/error feedback
4. Better error handling with user-friendly messages

### Fix #4: Multi-Page Selection Warnings

**Changes to handle Bug #5:**

1. **Renamed Variable for Clarity**
   - `selectedEntries` → `selectedEntriesOnCurrentPage`
   - Added prominent comment warning about the limitation

2. **Fixed Button Logic** (line 1266)
   - When no entries on current page but selections exist elsewhere, show all buttons
   - Added comment explaining the limitation

3. **Moderation Modal Warning**
   - Detect multi-page selections: `hasMultiPageSelection = selection.selectedIds.size > selectedEntriesOnPage.length`
   - Show blue info banner when detected
   - Banner explains: "X entries selected across pages, Y visible on this page, all X will be affected"

4. **Frame Modal Warning**
   - Same detection logic for multi-page selections
   - Show warning that frame breakdown only shows current page
   - Clarify that operation affects all selected entries

**Example Warning Message:**
```
ℹ️ Multi-page selection detected
You have selected 8 entries across multiple pages. 
Only 3 are visible on the current page. 
The operation will affect all 8 selected entries.
```

### Fix #5: Database Layer Documentation

Added clarifying comments in `src/lib/db.ts` to document why the `deleted` field filter is only applied to verbs (other tables don't have this field).

## Technical Details

### Response Format
The API endpoints return:
```json
{
  "success": true,
  "updatedCount": 5,  // or "count": 5
  "message": "Updated 5 entries"
}
```

### When Counts Might Differ

The actual count updated can differ from selection count when:
1. **Non-existent IDs**: User selected entries that were deleted by another user
2. **Deleted Entries**: For verbs, if entries were marked as deleted
3. **Permission Issues**: Though not currently implemented, could affect updates
4. **Race Conditions**: Another user modifies entries between selection and update

### Toast Notification System

The fix uses the existing `showGlobalAlert()` system from `src/lib/alerts.tsx`:
- Displays beautiful gradient toast notifications
- Auto-dismisses after configurable duration
- Supports different types: success, warning, error, info, dark
- Shows progress bar for duration
- User can manually dismiss

## Testing Recommendations

To verify the fix works correctly:

### Test 1: Single Page Selection
- Select 5 entries on page 1, mark as forbidden
- **Expected:** Success toast: "Successfully forbidden 5 entries."
- **Expected:** No multi-page warning

### Test 2: Multi-Page Selection - Moderation
1. Go to page 1, select 3 entries
2. Navigate to page 2, select 2 more entries
3. Click "Mark Forbidden"
4. **Expected:** Blue warning banner in modal: "Multi-page selection detected. You have selected 5 entries across multiple pages. Only 2 are visible on the current page..."
5. Confirm the action
6. **Expected:** Success toast: "Successfully forbidden 5 entries."
7. Navigate back to page 1
8. **Expected:** All 3 entries on page 1 are also marked as forbidden

### Test 3: Multi-Page Selection - Frame Change
1. In verbs table, go to page 1, select 3 verbs
2. Navigate to page 2, select 2 more verbs
3. Click "Change Frame"
4. **Expected:** Blue warning banner: "You selected 5 verbs across multiple pages. The breakdown below shows only the 2 verbs on this page..."
5. Change frame and confirm
6. **Expected:** Success toast: "Successfully updated to [FRAME] for 5 verbs."
7. Navigate to page 1
8. **Expected:** All 3 verbs have the new frame

### Test 4: Partial Success Scenario
1. Select 10 entries
2. In another browser tab, delete 2 of them directly in the database
3. Try to mark all 10 as forbidden
4. **Expected:** Warning toast: "Only 8 of 10 selected entries were forbidden. Some entries may not exist or are no longer accessible."

### Test 5: Complete Failure Scenario
1. Select entries
2. Delete all of them in another tab
3. Try to mark them as forbidden
4. **Expected:** Error toast: "No entries were forbidden. The selected entries may not exist or are no longer accessible."

### Test 6: Button Logic with Multi-Page
1. Go to page 1, select 3 flagged entries
2. Go to page 2, select 2 unflagged entries
3. **Expected:** Should see both "Mark Flagged" and "Unflag" buttons in toolbar

### Test 7: Existing Reasons Display
1. Flag some entries with reasons on page 1
2. Go to page 2 and select them from page 1 (multi-page selection)
3. Click "Unflag"
4. **Expected:** Warning banner about multi-page selection
5. **Expected:** Modal might not show all reasons (only those on current page), but warning explains this

## Files Modified

1. `src/components/DataTable.tsx` - Main fix for:
   - User feedback with toast notifications
   - Data refresh after moderation
   - Multi-page selection warnings in both modals
   - Renamed `selectedEntries` to `selectedEntriesOnCurrentPage` for clarity
   
2. `src/lib/db.ts` - Added clarifying comments about deleted field

3. `TABLE_MODERATION_BUG_FIX.md` - This comprehensive documentation

## Additional Notes

- The fix maintains backward compatibility
- All existing API endpoints work unchanged
- The toast system was already in place and working (used by AI Jobs overlay)
- No database schema changes required
- No performance impact (already doing API calls)

## Potential Future Enhancements

1. **Detailed Failure List**: Show which specific entry IDs failed to update
2. **Retry Mechanism**: Allow users to retry failed updates
3. **Audit Log**: Track moderation changes with timestamps and user info
4. **Bulk Operation Progress**: For very large selections, show progress indicator
5. **Undo Feature**: Allow reverting recent bulk moderation changes

