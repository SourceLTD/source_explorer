import { NextRequest, NextResponse } from 'next/server';
import type { CreateLLMJobParams } from '@/lib/llm/types';
import { fetchUnitsForScope, renderPromptAsync } from '@/lib/llm/jobs';
import { getOpenAIClient } from '@/lib/llm/client';
import { estimateUsdCost } from '@/lib/llm/pricing';

interface EstimateResponseBody {
  totalItems: number;
  sampleSize: number;
  inputTokensPerItem: number;
  outputTokensPerItem: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUSD: number | null;
  clusteringError?: string;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateLLMJobParams> & {
      outputTokensPerItem?: number;
    };

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    if (!payload.model || typeof payload.model !== 'string') {
      return NextResponse.json({ error: 'model is required.' }, { status: 400 });
    }
    if (!payload.promptTemplate || typeof payload.promptTemplate !== 'string') {
      return NextResponse.json({ error: 'promptTemplate is required.' }, { status: 400 });
    }
    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    // Get total count separately to provide accurate info to the UI
    const { countEntriesForScope } = await import('@/lib/llm/entries');
    const totalEntries = await countEntriesForScope(payload.scope as any);
    
    if (totalEntries === 0) {
      return NextResponse.json({ error: 'No entries found for provided scope.' }, { status: 400 });
    }

    // For estimation, we only need a few samples.
    const estimateScope = { ...payload.scope };
    if (estimateScope.kind === 'filters') {
      estimateScope.filters = { ...estimateScope.filters, limit: 5 };
    } else if (estimateScope.kind === 'frame_ids') {
      estimateScope.frameIds = estimateScope.frameIds.slice(0, 5);
      estimateScope.limit = 5;
    } else if (estimateScope.kind === 'ids') {
      estimateScope.ids = estimateScope.ids.slice(0, 5);
    }

    const entries = await fetchUnitsForScope(estimateScope as any);
    const sampleSize = entries.length;
    const sample = entries;

    const client = getOpenAIClient();
    const clusteringErrors = new Set<string>();
    const renderedUserPrompts = await Promise.all(
      sample.map(async (entry) => {
        const rendered = await renderPromptAsync(payload.promptTemplate!, entry, {
          metadata: payload.metadata,
          onClusteringError: (msg) => clusteringErrors.add(msg),
        });
        return rendered.prompt;
      })
    );
    const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt : '';

    // Try to use Responses input token counting; fall back to heuristic
    const countTokensForText = async (text: string): Promise<number> => {
      let counted: number | null = null;
      if (client) {
        try {
          const anyClient: any = client as any;
          if (anyClient?.responses?.inputTokens?.create) {
            const resp = await anyClient.responses.inputTokens.create({
              model: payload.model,
              input: text,
            });
            counted = resp?.usage?.input_tokens ?? resp?.input_tokens ?? null;
          } else if (anyClient?.responses?.countTokens) {
            const resp = await anyClient.responses.countTokens({
              model: payload.model,
              input: text,
            });
            counted = resp?.tokens ?? resp?.usage?.input_tokens ?? null;
          }
        } catch {
          // ignore and use fallback
        }
      }
      if (typeof counted !== 'number' || !Number.isFinite(counted)) {
        // Simple heuristic ~4 chars per token
        counted = Math.ceil(text.length / 4);
      }
      return counted;
    };

    const systemTokenCount = systemPrompt.trim().length > 0 ? await countTokensForText(systemPrompt) : 0;

    const inputTokenCounts: number[] = [];
    for (const userText of renderedUserPrompts) {
      const userTokens = await countTokensForText(userText);
      inputTokenCounts.push(systemTokenCount + userTokens);
    }

    const avgInputTokens = Math.round(inputTokenCounts.reduce((a, b) => a + b, 0) / inputTokenCounts.length);
    const totalItems = totalEntries;
    const totalInputTokens = avgInputTokens * totalItems;
    const outputTokensPerItem = typeof payload.outputTokensPerItem === 'number' ? payload.outputTokensPerItem : 5000;
    const totalOutputTokens = outputTokensPerItem * totalItems;

    const estimatedCostUSD = estimateUsdCost({
      model: payload.model,
      totalInputTokens,
      totalOutputTokens,
      serviceTier: payload.serviceTier,
    });

    const body: EstimateResponseBody = {
      totalItems,
      sampleSize,
      inputTokensPerItem: avgInputTokens,
      outputTokensPerItem,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUSD,
      clusteringError: clusteringErrors.size ? Array.from(clusteringErrors)[0] : undefined,
    };

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to estimate cost' },
      { status: 500 }
    );
  }
}


