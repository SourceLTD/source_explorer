import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

// Embedding model configuration (must match the Edge Function)
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface SemanticSearchResult {
  id: number;
  code: string;
  lemmas: string[];
  gloss: string;
  similarity: number;
}

interface FrameSearchResult {
  id: number;
  label: string;
  short_definition: string;
  similarity: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const table = searchParams.get('table') || 'verbs';
  const limitParam = searchParams.get('limit');
  const thresholdParam = searchParams.get('threshold');
  
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.7;

  if (!query) {
    return NextResponse.json({ error: 'Search query (q) is required' }, { status: 400 });
  }

  const validTables = ['verbs', 'nouns', 'adjectives', 'adverbs', 'frames'];
  if (!validTables.includes(table)) {
    return NextResponse.json(
      { error: `Invalid table. Must be one of: ${validTables.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    // Initialize clients
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Generate embedding for the search query
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Call the appropriate semantic search function
    const functionName = `search_${table}_semantic`;
    
    const { data, error } = await supabase.rpc(functionName, {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Semantic search error:', error);
      return NextResponse.json(
        { error: `Semantic search failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Transform results to match the existing search result format
    const results = (data as (SemanticSearchResult | FrameSearchResult)[]).map((item) => {
      if ('label' in item) {
        // Frame result
        return {
          id: item.id.toString(),
          label: item.label,
          gloss: item.short_definition,
          pos: 'f',
          lemmas: [],
          src_lemmas: [],
          legacy_id: '',
          similarity: item.similarity,
        };
      } else {
        // Lexical entry result
        const posMap: Record<string, string> = {
          verbs: 'v',
          nouns: 'n',
          adjectives: 'a',
          adverbs: 'r',
        };
        return {
          id: item.code,
          label: item.code,
          gloss: item.gloss,
          pos: posMap[table] || 'v',
          lemmas: item.lemmas || [],
          src_lemmas: [],
          legacy_id: '',
          similarity: item.similarity,
        };
      }
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Semantic search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Semantic search failed: ${message}` },
      { status: 500 }
    );
  }
}

