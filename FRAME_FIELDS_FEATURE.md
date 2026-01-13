# Frame Fields Feature for AIJobsOverlay

## Summary
Enhanced the AIJobsOverlay component to support accessing all frame fields (including frame_roles) when creating AI jobs for verbs. Users can now reference frame data using the `frame.{field_name}` notation in prompt templates.

## Changes Made

### 1. Frontend - Schema Variables (`src/lib/llm/schema-variables.ts`)
Added new variables to `VERB_VARIABLES` array:
- `frame.id` - Frame ID
- `frame.code` - Frame Code  
- `frame.framebank_id` - Frame FrameBank ID
- `frame.label` - Frame Name
- `frame.definition` - Frame Definition
- `frame.short_definition` - Frame Short Definition
- `frame.is_supporting_frame` - Frame Is Supporting Frame
- `frame.communication` - Frame Communication
- `frame.roles` - Frame Roles (formatted list with role type, description, examples, and label)

### 2. Backend - Database Queries (`src/lib/llm/jobs.ts`)

#### Updated `fetchEntriesByIds` function
- Enhanced the Prisma query to fetch full frame data including frame_roles when fetching verbs
- Added frame field data to the `additional` property using the `frame.*` naming convention
- Includes role details: role_type, role_code, description, notes, main, examples, label

#### Updated `fetchEntriesByFilters` function  
- Enhanced the Prisma query to include full frame data with frame_roles
- Added frame field data to the `additional` property for consistency

#### Updated `fetchEntriesByFrameIds` function
- Added frame_roles to the frame query
- Updated verb entries to include full frame data in the `additional` property

#### Updated `renderPrompt` function
- Modified regex pattern from `/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g` to `/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g`
- Now supports dot notation in variable names (e.g., `{{frame.definition}}`)

### 3. Frontend - AIJobsOverlay Component (`src/components/AIJobsOverlay/index.tsx`)
- Updated syntax highlighting regex in `renderHighlighted` function
- Changed from `/(\{\{[a-zA-Z0-9_]+\}\})/g` to `/(\{\{[a-zA-Z0-9_.]+\}\})/g`
- Enables proper highlighting of frame field variables in the prompt editor

### 4. Updated Default Prompt (`src/components/AIJobsOverlay/constants.ts`)
- Added `Frame: {{label}}` to the default prompt template
- Provides users with an example of frame field usage

## Usage Examples

### Basic Frame Fields
```
Frame Name: {{frame.label}}
Frame Definition: {{frame.definition}}
Frame Short Definition: {{frame.short_definition}}
```

### Frame Roles
```
Frame Roles:
{{frame.roles}}
```
Output: 
```
**Agent**: The entity performing the action (e.g. John, The cat); Doer
**Patient**: The entity affected by the action (e.g. the ball, it); Affected entity
**Theme**: The object being moved or transferred (e.g. the book, that)
```

Each role is formatted as:
**{ROLE_TYPE}**: {description} (e.g. {examples}); {label}

### Complex Example Prompt
```
You are reviewing a verb entry with its semantic frame information.

Verb: {{code}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}

Frame Information:
- Frame: {{frame.label}} ({{frame.framebank_id}})
- Definition: {{frame.definition}}
- Short Definition: {{frame.short_definition}}

Frame Roles:
{{frame.roles}}

Examples:
{{examples}}

Evaluate whether this verb's gloss and examples properly reflect its frame semantics.
```

## Technical Details

### Frame Roles Format
The `frame.roles` variable provides a newline-separated list where each role is formatted as:

```
**{ROLE_TYPE}**: {description} (e.g. {examples}); {label}
```

For example:
```
**CONTENT.ENTITY**: Entity or topic the knowledge concerns (e.g. the report, the problem, her idea, him); the known topic
**KNOWER**: The entity that has knowledge about the content (e.g. John, the expert, everyone); the person who knows
**MANNER**: How the knowledge is held or acquired (e.g. deeply, vaguely)
```

Each role includes:
- `ROLE_TYPE`: The role type label (e.g., "Agent", "CONTENT.ENTITY")
- `description`: Specific description for this role in this frame
- `examples`: Comma-separated list of example phrases (optional)
- `label`: Alternative name for the role (optional)

#### Role Ordering
Roles are ordered using the same precedence system used in graph mode:
1. **Main roles first**: Roles marked as `main: true` appear before non-main roles
2. **By precedence**: Within each group (main/non-main), roles are sorted by their precedence value (highest first)
3. **Alphabetically**: Roles with the same precedence are sorted alphabetically by label

The precedence hierarchy (from highest to lowest):
- PROTO_AGENT (28)
- CONTENT.ENTITY (27)
- CONTENT.CLAUSE (26)
- CONTENT.QUOTE (25)
- RECIPIENT (24)
- ...and more (see `ROLE_PRECEDENCE` in `src/lib/types.ts`)

### Backward Compatibility
- Existing variables like `label`, `frame_code`, and `frame_definition` continue to work
- New `frame.*` variables provide access to the complete frame data structure
- No breaking changes to existing prompts or jobs

## Testing Recommendations

1. **Create a test job for verbs** with frame field variables in the prompt
2. **Verify autocomplete** shows `frame.*` options when typing `{{` in the prompt editor
3. **Check preview** displays correct frame data substitution
4. **Test all scope modes**: selection, manual IDs, frame IDs, filters, and all
5. **Verify frame_roles data** appears correctly in both comma-separated and JSON formats

## Related Files
- `src/lib/llm/schema-variables.ts` - Variable definitions
- `src/lib/llm/jobs.ts` - Backend job processing and data fetching
- `src/lib/llm/types.ts` - Type definitions for LexicalEntrySummary
- `src/components/AIJobsOverlay/index.tsx` - Main overlay component
- `src/components/AIJobsOverlay/constants.ts` - Default prompt template
- `prisma/schema.prisma` - Database schema with frames and frame_roles tables

