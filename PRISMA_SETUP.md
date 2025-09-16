# Prisma Integration Setup Guide

This guide explains how to set up and use the Prisma integration with your PostgreSQL/Supabase database.

## 📁 Files Created

### Core Prisma Files
- `prisma/schema.prisma` - Prisma schema definition
- `prisma/seed.ts` - Database seeding script
- `.env` - Environment variables (contains your DATABASE_URL)
- `.env.example` - Template for environment variables

### Application Code
- `src/lib/prisma.ts` - Prisma client instance
- `src/lib/db.ts` - Database service with utility methods
- `src/lib/types.ts` - TypeScript type definitions
- `src/lib/hooks.ts` - React hooks for data fetching

### API Routes
- `src/app/api/search/route.ts` - Full-text search endpoint
- `src/app/api/entries/route.ts` - CRUD operations for entries
- `src/app/api/entries/[id]/route.ts` - Single entry operations
- `src/app/api/entries/[id]/relations/route.ts` - Entry relations
- `src/app/api/relations/route.ts` - Relation management
- `src/app/api/stats/route.ts` - Database statistics

## 🚀 Quick Setup

### 1. Configure Database Connection

Edit your `.env` file with your database connection string:

```bash
# For local PostgreSQL
DATABASE_URL="postgresql://username:password@localhost:5432/database_name?schema=public"

# For Supabase
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

### 2. Run Your Existing Schema

Since you already have a `schema.sql` file, apply it to your database first:

```bash
# For local PostgreSQL
psql -d your_database -f schema.sql

# For Supabase, use the SQL Editor in the dashboard to run schema.sql
```

### 3. Generate Prisma Client

```bash
npm run db:generate
```

### 4. Push Schema to Database (Optional)

If you want Prisma to manage your schema:

```bash
npm run db:push
```

### 5. Seed the Database (Optional)

```bash
npm run db:seed
```

## 📊 Available Scripts

```bash
npm run db:generate    # Generate Prisma client
npm run db:push       # Push schema changes to database
npm run db:migrate    # Create and apply migrations
npm run db:deploy     # Deploy migrations (production)
npm run db:reset      # Reset database and apply migrations
npm run db:seed       # Run seed script
npm run db:studio     # Open Prisma Studio (database GUI)
```

## 💻 Usage Examples

### Basic Database Operations

```typescript
import { db } from '@/lib/db'

// Search entries
const results = await db.searchLexicalEntries('dog', {
  limit: 10,
  pos: 'n'
})

// Get entry with relations
const entry = await db.getLexicalEntry('dog.n.01', true)

// Create new entry
const newEntry = await db.createLexicalEntry({
  id: 'cat.n.01',
  gloss: 'feline mammal usually having thick soft fur',
  pos: 'n',
  lexfile: 'noun.animal',
  lemmas: ['cat', 'domestic_cat']
})

// Add relation
await db.createEntryRelation('cat.n.01', 'animal.n.01', 'hypernym')
```

### Using React Hooks

```tsx
'use client'
import { useSearchEntries, useLexicalEntry } from '@/lib/hooks'

function SearchComponent() {
  const { results, loading, error, search } = useSearchEntries()
  
  const handleSearch = (query: string) => {
    search({ query, limit: 20 })
  }
  
  return (
    <div>
      {loading && <div>Searching...</div>}
      {error && <div>Error: {error}</div>}
      {results.entries.map(entry => (
        <div key={entry.id}>{entry.gloss}</div>
      ))}
    </div>
  )
}

function EntryDetail({ id }: { id: string }) {
  const { entry, loading, updateEntry } = useLexicalEntry(id)
  
  if (loading) return <div>Loading...</div>
  if (!entry) return <div>Entry not found</div>
  
  return (
    <div>
      <h1>{entry.gloss}</h1>
      <p>POS: {entry.pos}</p>
      <p>Lemmas: {entry.lemmas.join(', ')}</p>
    </div>
  )
}
```

### API Usage

```typescript
// Search entries
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'dog',
    pos: 'n',
    limit: 10
  })
})
const { entries } = await response.json()

// Get single entry
const entry = await fetch('/api/entries/dog.n.01?relations=true')
  .then(res => res.json())

// Create entry
await fetch('/api/entries', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'cat.n.01',
    gloss: 'feline mammal',
    pos: 'n',
    lexfile: 'noun.animal'
  })
})

// Create relation
await fetch('/api/relations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sourceId: 'cat.n.01',
    targetId: 'animal.n.01',
    type: 'hypernym'
  })
})
```

## 🔍 Full-Text Search

The integration supports PostgreSQL's full-text search using tsvector columns:

```typescript
// Search in gloss and examples
const results = await db.searchLexicalEntries('fast moving animal')

// The query uses:
// - plainto_tsquery for natural language queries
// - ts_rank for relevance scoring
// - Array searches for exact lemma/particle matches
```

## 📈 Database Statistics

```typescript
import { db } from '@/lib/db'

const stats = await db.getStatistics()
// Returns:
// {
//   totalEntries: 100000,
//   totalRelations: 50000,
//   multiwordExpressions: 5000,
//   entriesByPos: [
//     { pos: 'n', count: 40000 },
//     { pos: 'v', count: 30000 },
//     ...
//   ],
//   relationsByType: [
//     { type: 'hypernym', count: 20000 },
//     ...
//   ]
// }
```

## 🛠 Advanced Features

### Bulk Operations

```typescript
// Bulk insert entries
await db.bulkInsertLexicalEntries([
  { id: 'entry1', gloss: '...', pos: 'n', lexfile: 'noun.animal' },
  { id: 'entry2', gloss: '...', pos: 'v', lexfile: 'verb.motion' }
])

// Bulk insert relations
await db.bulkInsertRelations([
  { sourceId: 'entry1', targetId: 'entry2', type: 'also_see' }
])
```

### Raw Queries

```typescript
import { prisma } from '@/lib/prisma'

// Custom raw query
const results = await prisma.$queryRaw`
  SELECT * FROM lexical_entries 
  WHERE gloss_tsv @@ plainto_tsquery('english', ${query})
  ORDER BY ts_rank(gloss_tsv, plainto_tsquery('english', ${query})) DESC
`
```

## 🔧 Troubleshooting

### Common Issues

1. **Connection Issues**
   - Verify DATABASE_URL in `.env`
   - Check database is running and accessible
   - Test with: `npm run db:studio`

2. **Schema Sync Issues**
   - Run `npm run db:generate` after schema changes
   - Use `npm run db:push` to sync schema

3. **Full-Text Search Not Working**
   - Ensure tsvector columns are properly populated
   - Check if triggers from schema.sql are active

### Database Connection Test

```typescript
import { testConnection } from '@/lib/prisma'

const result = await testConnection()
console.log(result) // { success: true, message: "Database connection successful" }
```

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [Supabase with Prisma](https://supabase.com/docs/guides/integrations/prisma)

## 🎯 Next Steps

1. Configure your DATABASE_URL
2. Apply your existing schema.sql
3. Generate Prisma client: `npm run db:generate`
4. Test the connection: `npm run db:studio`
5. Optionally seed with sample data: `npm run db:seed`
6. Start building your application with the provided utilities!
