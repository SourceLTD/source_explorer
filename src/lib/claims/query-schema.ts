import { z } from 'zod';

export const claimsPropertyFilterSchema = z.object({
  propertyLabel: z.string(),
  fillerConceptLabel: z.string().optional(),
  fillerValueContains: z.string().optional(),
});

export const claimsQuerySchema = z.object({
  conceptLabels: z.array(z.string()).optional(),
  propertyFilters: z.array(claimsPropertyFilterSchema).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  expandNeighborhood: z.boolean().optional(),
  explanation: z.string().describe('Brief plain-English summary of what the query finds'),
});

export type ClaimsQueryFilter = z.infer<typeof claimsQuerySchema>;
