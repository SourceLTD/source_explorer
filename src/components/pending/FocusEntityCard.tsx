import React, { useEffect, useState, useRef } from 'react';
import NodeCard from '@/components/pending/context/NodeCard';
import LoadingSpinner from '@/components/LoadingSpinner';

type JsonRecord = Record<string, unknown>;

interface FocusEntityCardProps {
  entityType: string;
  entityId: string | null;
  summarySnapshot: JsonRecord | null;
  className?: string;
  subtle?: boolean;
}

function truncateText(input: string, maxLen: number): string {
  const s = input.trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return value.trim() === '' ? '""' : truncateText(value, 280);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allStrings = value.every(v => typeof v === 'string');
    if (allStrings) {
      const items = (value as string[]).slice(0, 8).map(v => truncateText(v, 48));
      const more = value.length > 8 ? `, …(+${value.length - 8})` : '';
      return `[${items.join(', ')}${more}]`;
    }
    const items = value.slice(0, 4).map(v => truncateText(JSON.stringify(v), 80));
    const more = value.length > 4 ? `, …(+${value.length - 4})` : '';
    return `[${items.join(', ')}${more}]`;
  }

  try {
    return truncateText(JSON.stringify(value), 320);
  } catch {
    return String(value);
  }
}

const META_KEYS = new Set(['id', 'created_at', 'updated_at', 'version', 'deleted']);

function getPreferredKeys(entityType: string): string[] {
  switch (entityType) {
    case 'frame':
      return ['label', 'code', 'short_definition', 'definition', 'super_frame_id'];
    case 'lexical_unit':
      return ['code', 'pos', 'lemmas', 'gloss', 'frame_id', 'lexfile', 'is_mwe'];
    default:
      return ['label', 'code', 'gloss', 'short_definition', 'definition'];
  }
}

function listDisplayPairs(entityType: string, snapshot: JsonRecord): Array<{ key: string; value: string; raw: unknown }> {
  const preferred = getPreferredKeys(entityType);
  const keys = Object.keys(snapshot).filter(k => !META_KEYS.has(k));
  const rest = keys.filter(k => !preferred.includes(k)).sort((a, b) => a.localeCompare(b));
  const ordered = [...preferred.filter(k => k in snapshot), ...rest];
  const limited = ordered.slice(0, 10);
  return limited.map(key => ({ key, value: formatValue(snapshot[key]), raw: snapshot[key] }));
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatLemmas(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const strs = value.filter(v => typeof v === 'string') as string[];
  if (strs.length === 0) return '';
  const shown = strs.slice(0, 6);
  const more = strs.length > shown.length ? `, …(+${strs.length - shown.length})` : '';
  return shown.join(', ') + more;
}

function renderLexicalUnitSnippets(lus: { id?: string; code?: string; gloss?: string }[] | undefined) {
  const items = Array.isArray(lus) ? lus : [];
  if (items.length === 0) return <div className="text-[11px] text-gray-500 italic">No lexical units found.</div>;

  return (
    <div className="mt-2 space-y-2">
      {items.slice(0, 10).map((lu, idx) => (
        <div key={lu.id || idx} className="flex flex-col gap-0.5 border-l-2 border-blue-100 pl-2">
          <a
            href={`/table?search=${encodeURIComponent(lu.id || lu.code || '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-blue-700 hover:text-blue-800 cursor-pointer font-bold"
          >
            {lu.code}
          </a>
          <div className="text-[10px] text-gray-600 leading-tight line-clamp-2" title={lu.gloss}>
            {lu.gloss}
          </div>
        </div>
      ))}
      {items.length > 10 && <span className="text-[10px] text-gray-400 italic">…(+{items.length - 10} more)</span>}
    </div>
  );
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return res.json() as Promise<T>;
}

export default function FocusEntityCard({
  entityType,
  entityId,
  summarySnapshot,
  className = '',
  subtle = false,
}: FocusEntityCardProps) {
  const [richData, setRichData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dataCacheRef = useRef(new Map<string, any>());

  useEffect(() => {
    if (!entityId || (entityType !== 'frame' && entityType !== 'lexical_unit')) {
      setRichData(null);
      return;
    }

    if (entityId.startsWith('-')) {
      setRichData(null);
      return;
    }

    const ac = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const cacheKey = `${entityType}-${entityId}`;
        if (dataCacheRef.current.has(cacheKey)) {
          setRichData(dataCacheRef.current.get(cacheKey));
        } else {
          const url = entityType === 'frame' 
            ? `/api/frames/${entityId}`
            : `/api/lexical-units/${entityId}`;
          const res = await fetchJson<any>(url, ac.signal);
          dataCacheRef.current.set(cacheKey, res);
          setRichData(res);
        }
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setRichData(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => ac.abort();
  }, [entityId, entityType]);

  if (!summarySnapshot) return null;

  if (entityType === 'frame') {
    const label = pickString(summarySnapshot.label || summarySnapshot.code || richData?.label);
    const def = pickString(summarySnapshot.short_definition || summarySnapshot.definition || richData?.short_definition || richData?.definition);
    const lus = richData?.lexical_units || [];
    return (
      <NodeCard
        title={label || 'Frame'}
        loading={loading}
        error={error}
        noDivider
        className={`${subtle ? 'shadow-none' : 'shadow-md'} ${className}`}
      >
        {def && <div className="text-[11px] text-gray-700 font-medium mb-2">{def}</div>}
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Lexical entries</div>
        {renderLexicalUnitSnippets(lus)}
      </NodeCard>
    );
  }

  if (entityType === 'lexical_unit') {
    const code = pickString(summarySnapshot.code || richData?.code);
    const pos = pickString(summarySnapshot.pos || richData?.pos);
    const gloss = pickString(summarySnapshot.gloss || richData?.gloss);
    const lemmas = formatLemmas(summarySnapshot.lemmas || richData?.lemmas);
    return (
      <NodeCard
        title={code || 'Lexical Entry'}
        loading={loading}
        error={error}
        noDivider
        className={`${subtle ? 'shadow-none' : 'shadow-md'} ${className}`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono text-[9px] uppercase">{pos}</span>
            <span className="text-[10px] text-gray-500 font-mono truncate">{lemmas}</span>
          </div>
          <div className="text-[11px] text-gray-700 font-medium leading-tight line-clamp-3">{gloss}</div>
        </div>
      </NodeCard>
    );
  }

  const pairs = listDisplayPairs(entityType, summarySnapshot);
  return (
    <div className={`p-4 rounded-xl border border-gray-200 bg-white ${subtle ? '' : 'shadow-md'} ${className}`}>
      <div className="text-sm font-semibold text-gray-900 mb-3">Entity Details</div>
      <div className="space-y-2">
        {pairs.map(({ key, value, raw }) => (
          <div key={key} className="flex items-start gap-3 text-sm">
            <div className="w-40 flex-shrink-0 font-mono text-xs text-gray-500 truncate" title={key}>
              {key}
            </div>
            <div className="flex-1 min-w-0 text-gray-900 break-words" title={typeof raw === 'string' ? raw : undefined}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
