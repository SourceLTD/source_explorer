# Lexical Explorer Setup Guide

A WordNet-like lexical database explorer built with Next.js, Prisma, PostgreSQL, and Mermaid diagrams.

## Features

- 🔍 **Full-text search** across lexical entries
- 📊 **Interactive graph visualization** using Mermaid diagrams
- 🧭 **Breadcrumb navigation** showing hierarchical paths
- 🔗 **Hypernym/Hyponym relationships** with visual connections
- 📱 **Responsive design** with clean, professional UI
- ⚡ **Real-time navigation** between related entries

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables Setup

1. Create a PostgreSQL database for the project
2. Create a `.env` file in the project root:
   ```bash
   touch .env
   ```
3. Add the following environment variables to your `.env` file:
   ```bash
   # For local PostgreSQL
   POSTGRES_PRISMA_URL="postgresql://username:password@localhost:5432/lexical_explorer"
   POSTGRES_URL_NON_POOLING="postgresql://username:password@localhost:5432/lexical_explorer"
   
   # For Supabase
   POSTGRES_PRISMA_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
   POSTGRES_URL_NON_POOLING="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
   
   # Supabase Authentication (if using auth features)
   NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
   NEXT_PUBLIC_SITE_URL="http://localhost:3000"
   ```

### 3. Initialize Database Schema

Run the SQL schema to set up tables, indexes, and triggers:

```bash
# Connect to your PostgreSQL database and run:
psql -d lexical_explorer -f schema.sql
```

### 4. Generate Prisma Client

```bash
npm run db:generate
```

### 5. Seed Sample Data

```bash
npm run db:seed
```

This will create sample lexical entries with relationships based on WordNet data, including entries like "have.v.02" with its various hyponyms.

### 6. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Usage

### Search
- Use the search box in the top-right to find lexical entries
- Search supports full-text search across definitions and examples
- Click any search result to navigate to that entry

### Navigation
- Click nodes in the graph to navigate between related entries
- Use breadcrumbs in the top-left to navigate up the hierarchy
- The sidebar shows detailed information about the current entry

### Graph Visualization
- **Blue nodes**: Current entry
- **Green nodes**: Parents (hypernyms)  
- **Yellow nodes**: Children (hyponyms)
- Click any node to navigate to it

## Database Schema

The application uses two main tables:

- `lexical_entries`: Stores word definitions, parts of speech, examples, and lemmas
- `entry_relations`: Stores relationships between entries (hypernym, hyponym, etc.)

Full-text search is powered by PostgreSQL's tsvector columns with GIN indexes.

## API Endpoints

- `GET /api/search?q={query}` - Search lexical entries
- `GET /api/entries/{id}` - Get entry details
- `GET /api/entries/{id}/graph` - Get entry with parents/children for graph
- `GET /api/breadcrumbs/{id}` - Get ancestor path for breadcrumbs

## Development

### Database Commands

```bash
npm run db:studio    # Open Prisma Studio
npm run db:push      # Push schema changes
npm run db:seed      # Seed sample data
```

### Adding Data

To add your own lexical data:

1. Modify `prisma/seed.ts` with your entries and relations
2. Run `npm run db:seed` to populate the database
3. Or use the Prisma client directly in your own scripts

## Architecture

- **Frontend**: Next.js 15 with TypeScript and Tailwind CSS
- **Backend**: Next.js API routes with Prisma ORM
- **Database**: PostgreSQL with full-text search
- **Visualization**: Mermaid.js for graph diagrams
- **Styling**: Tailwind CSS with custom components

The application follows a clean, professional design inspired by modern documentation sites and research tools.

## Environment Variables Reference

Create a `.env` file in your project root with the following variables:

```bash
# Database Configuration (required)
# Choose either local PostgreSQL or Supabase configuration

# For local PostgreSQL:
POSTGRES_PRISMA_URL="postgresql://username:password@localhost:5432/lexical_explorer"
POSTGRES_URL_NON_POOLING="postgresql://username:password@localhost:5432/lexical_explorer"

# For Supabase (replace with your actual values):
# POSTGRES_PRISMA_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
# POSTGRES_URL_NON_POOLING="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Supabase Authentication (required for login features)
# Get these from your Supabase project settings > API
NEXT_PUBLIC_SUPABASE_URL="https://[YOUR-PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key_here"

# Site URL (used for auth redirects)
NEXT_PUBLIC_SITE_URL="http://localhost:3000"

# In production, set NEXT_PUBLIC_SITE_URL to your actual domain:
# NEXT_PUBLIC_SITE_URL="https://yourdomain.com"
```

### Required vs Optional Variables

**Required for basic functionality:**
- `POSTGRES_PRISMA_URL` - Primary database connection
- `POSTGRES_URL_NON_POOLING` - Direct database connection (can be same as above for local dev)

**Required for authentication features:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `NEXT_PUBLIC_SITE_URL` - Your site URL for auth redirects
