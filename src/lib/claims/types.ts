export type ClaimsNodeType = 'instance' | 'concept';

export type ReferentialStatus = 'specific' | 'generic' | 'hypothetical';

export interface ClaimsNode {
  id: string;
  type: ClaimsNodeType;
  label: string;
  conceptLabel?: string;
  conceptId?: string;
  confidence?: number;
  matched?: boolean;
  referentialStatus?: ReferentialStatus;
  pendingChangePlanId?: string;
  pendingConceptLabel?: string;
  pendingConceptArchetype?: string;
  fallbackConceptLabel?: string;
}

export type ClaimsLinkType = 'filler' | 'typed_as';

export interface ClaimsLink {
  id: string;
  source: string;
  target: string;
  type: ClaimsLinkType;
  propertyLabel?: string;
  fillerValue?: string;
}

export interface ClaimsGraphPayload {
  nodes: ClaimsNode[];
  links: ClaimsLink[];
}

export interface KnowledgeGraphSummary {
  id: string;
  label: string;
  description: string | null;
  instanceCount: number;
}

export interface ClaimsFillerDetail {
  id: string;
  propertyLabel: string | null;
  propertyId: string;
  fillerInstanceId: string | null;
  fillerInstanceLabel: string | null;
  fillerValue: string | null;
  confidence: number | null;
  sourceSpanStart: number | null;
  sourceSpanEnd: number | null;
}

export interface ClaimsInstanceDetail {
  id: string;
  conceptId: string;
  conceptLabel: string;
  conceptDefinition: string | null;
  conceptArchetype: string | null;
  conceptDomain: string | null;
  conceptCode: string | null;
  conceptParents: { id: string; label: string }[];
  confidence: number | null;
  metadata: Record<string, unknown> | null;
  referentialStatus: ReferentialStatus;
  knowledgeGraphId: string | null;
  sourceText: {
    id: string;
    content: string;
    sourceUri: string | null;
    contentType: string | null;
    artifactUri: string | null;
    documentIndex: import('../documents').DocumentIndex | null;
  } | null;
  fillers: ClaimsFillerDetail[];
  mentions: ClaimsMentionDetail[];
}

export interface ClaimsMentionDetail {
  id: string;
  locator: import('./locator-schema').BlockLocator;
  mentionText: string | null;
  confidence: number | null;
  /** Resolved global highlight range (computed server-side) */
  globalStart: number | null;
  globalEnd: number | null;
  breadcrumb: string | null;
  page: number | null;
}

export interface ClaimsQueryResult {
  explanation: string;
  matchedInstanceIds: string[];
  graph: ClaimsGraphPayload;
}
