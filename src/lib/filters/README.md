# Filters Module

This module adds a reusable boolean-filter system for AI job scoping.

- `types.ts`: AST types for boolean filters and shared operator/type definitions.
- `config.ts`: Field metadata per POS (verbs/nouns/adjectives), mapping UI keys to DB fields and valid operators.
- `url.ts`: Helper to convert existing table URL search params into an initial AND-group AST.
- `translate.ts`: Converts the AST into Prisma `where` input and returns computed filters (like parents/children counts) that must be applied post-query.

UI:
- `src/components/BooleanFilterBuilder.tsx` provides a nested AND/OR rule builder that emits the AST.

Server:
- `fetchEntriesByFilters` in `src/lib/llm/jobs.ts` uses `translateFilterASTToPrisma` to build Prisma queries, applies computed numeric filters, and respects `limit`.

Notes:
- Frame filters in verbs accept codes or numeric IDs; codes are resolved to frame IDs server-side.
- Computed fields (parentsCount, childrenCount) are filtered after fetching, using `_count` includes.

