import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiApiKey = process.env.OPENAI_API_KEY!;

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface SemanticSearchResult {
  id: number;
  code: string;
  pos: string;
  lemmas: string[];
  gloss: string;
  similarity: number;
}

interface FrameSearchResult {
  id: number;
  label: string;
  short_definition?: string | null;
  similarity: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const table = searchParams.get('table') || 'lexical_units';
  const limitParam = searchParams.get('limit');
  const thresholdParam = searchParams.get('threshold');
  
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.7;

  if (!query) {
    return NextResponse.json({ error: 'Search query (q) is required' }, { status: 400 });
  }

  // Update valid tables to include lexical_units
  const validTables = ['lexical_units', 'frames', 'verbs', 'nouns', 'adjectives', 'adverbs'];
  if (!validTables.includes(table)) {
    return NextResponse.json(
      { error: `Invalid table. Must be one of: ${validTables.join(', ')}` },
      { status: 400 }
    );
  }

  // Map legacy table names to the new unified table
  const actualTable = ['verbs', 'nouns', 'adjectives', 'adverbs', 'lexical_units'].includes(table) 
    ? 'lexical_units' 
    : table;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Use the unified function for lexical units
    const functionName = `search_${actualTable}_semantic`;
    
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

    const results = (data as (SemanticSearchResult | FrameSearchResult)[]).map((item) => {
      if ('label' in item) {
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
        // Map long POS names to short codes if needed by frontend
        const posMap: Record<string, string> = {
          verb: 'v',
          noun: 'n',
          adjective: 'a',
          adverb: 'r',
        };
        return {
          id: item.code,
          label: item.code,
          gloss: item.gloss,
          pos: posMap[item.pos] || item.pos,
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
