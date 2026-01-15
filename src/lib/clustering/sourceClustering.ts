export type SourceClusteringMode = 'superframe' | 'frame' | 'lexical_unit';
export type SourceClusteringIdsKind = 'superframe_ids' | 'frame_ids' | 'lexical_unit_ids';
export type SourceClusteringDType = 'float32' | 'float64';

export interface SourceClusteringRequest {
  mode: SourceClusteringMode;
  ids_kind: SourceClusteringIdsKind;
  ids: number[];
  k: number;
  seed?: number;
  max_iters?: number;
  dtype?: SourceClusteringDType;
}

export interface SourceClusteringResponse {
  assignments: Array<{ id: string; cluster: number }>;
  clusters: Array<{ cluster: number; size: number; exemplar_id: string }>;
  missing_ids: number[];
  stats: {
    fetch_ms: number;
    cluster_ms: number;
    total_ms: number;
    dims: number;
    n: number;
  };
  resolution?: {
    mode: string;
    ids_kind: string;
    input_count: number;
    resolved_count: number;
    resolved_entity_type: string;
  };
}

export class SourceClusteringError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SourceClusteringError';
  }
}

function getClusteringConfig(): { url: string; apiKey: string } {
  const url = process.env.CLUSTERING_API_URL;
  const apiKey = process.env.CLUSTERING_API_KEY;
  if (!url || !apiKey) {
    throw new SourceClusteringError(
      'Missing CLUSTERING_API_URL or CLUSTERING_API_KEY server env vars.',
      500
    );
  }
  return { url, apiKey };
}

export async function callSourceClustering(
  payload: SourceClusteringRequest
): Promise<SourceClusteringResponse> {
  const { url, apiKey } = getClusteringConfig();

  const resp = await fetch(url.endsWith('/') ? url : `${url}/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
    // Avoid caching across requests.
    cache: 'no-store',
  });

  const text = await resp.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // leave as text
  }

  if (!resp.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body && typeof (body as any).error === 'string'
        ? (body as any).error
        : `source-clustering failed: HTTP ${resp.status}`;
    throw new SourceClusteringError(message, resp.status, body);
  }

  return body as SourceClusteringResponse;
}

