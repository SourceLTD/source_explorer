export interface ModelPricing {
  inputPerMillion: number; // USD per 1M input tokens
  outputPerMillion: number; // USD per 1M output tokens
}

// Pricing values sourced from OpenAI pricing page (Standard tier)
// Updated: Based on official OpenAI pricing as of 2025
export const PRICING_BY_MODEL: Record<string, ModelPricing> = {
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
};

// Service tier multipliers based on OpenAI pricing (Standard tier is baseline at 1.0)
// Flex/Batch tier is 50% of Standard pricing
// Priority tier is 2x Standard for gpt-5 models, 1.8x for gpt-5-mini
export const SERVICE_TIER_MULTIPLIER: Record<'flex' | 'default' | 'priority', number> = {
  flex: 0.5,      // 50% discount - Batch/Flex tier
  default: 1.0,   // Standard tier (baseline)
  priority: 2.0,  // 2x premium for gpt-5, 1.8x for gpt-5-mini (using conservative 2.0x)
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


