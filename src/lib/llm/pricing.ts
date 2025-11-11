export interface ModelPricing {
  inputPerMillion: number; // USD per 1M input tokens
  outputPerMillion: number; // USD per 1M output tokens
}

// Pricing values sourced from OpenAI pricing page; adjust as needed.
// Using conservative defaults and easy to override if needed.
export const PRICING_BY_MODEL: Record<string, ModelPricing> = {
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
};

// Optional multipliers by service tier; defaults to 1.0 until official tier pricing deltas are published
export const SERVICE_TIER_MULTIPLIER: Record<'flex' | 'default' | 'priority', number> = {
  flex: 1.0,
  default: 1.0,
  priority: 1.0,
};

export function getModelPricing(model: string): ModelPricing | null {
  const found = PRICING_BY_MODEL[model];
  return found ?? null;
}

export function estimateUsdCost(params: {
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  serviceTier?: 'flex' | 'default' | 'priority';
}): number | null {
  const pricing = getModelPricing(params.model);
  if (!pricing) return null;
  const tierMultiplier = params.serviceTier ? SERVICE_TIER_MULTIPLIER[params.serviceTier] ?? 1.0 : 1.0;
  const inputUsd = (params.totalInputTokens / 1_000_000) * pricing.inputPerMillion * tierMultiplier;
  const outputUsd = (params.totalOutputTokens / 1_000_000) * pricing.outputPerMillion * tierMultiplier;
  return +(inputUsd + outputUsd).toFixed(6);
}


