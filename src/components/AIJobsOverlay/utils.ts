import type { BooleanFilterGroup } from '@/lib/filters/types';
import type { ScopeMode } from './types';
import type { JobScopeIds, JobScopeFilters, JobScope } from '@/lib/llm/types';

export function calculateCursorPosition(textarea: HTMLTextAreaElement, cursorPos: number) {
  const textareaRect = textarea.getBoundingClientRect();
  const style = getComputedStyle(textarea);

  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  // Safari sometimes returns an empty composite font string; copy individual props as a fallback
  if (style.font && style.font.trim().length > 0) {
    mirror.style.font = style.font;
  } else {
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight as string;
    mirror.style.fontStyle = style.fontStyle;
  }
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.padding = style.padding;
  mirror.style.border = 'none';
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.overflow = 'hidden';
  mirror.style.width = `${textarea.clientWidth}px`;

  const before = document.createTextNode(textarea.value.substring(0, cursorPos));
  const marker = document.createElement('span');
  // Use zero-width space so marker sits exactly at caret
  marker.textContent = '\u200b';

  mirror.appendChild(before);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerTop = marker.offsetTop;
  const markerLeft = marker.offsetLeft;

  document.body.removeChild(mirror);

  const top = textareaRect.top + markerTop - textarea.scrollTop + 4;
  const left = textareaRect.left + markerLeft - textarea.scrollLeft + 4;

  return { top, left };
}

export function getReplacementRange(text: string, caretStart: number, caretEnd: number) {
  // Find the earliest unmatched '{{' before the caret using a simple stack
  const tokenRegex = /\{\{|\}\}/g;
  let match: RegExpExecArray | null;
  const stack: number[] = [];
  while ((match = tokenRegex.exec(text)) && match.index < caretStart) {
    if (match[0] === '{{') {
      stack.push(match.index);
    } else if (stack.length > 0) {
      stack.pop();
    }
  }
  // If not inside any unmatched token, fallback to last '{{'
  if (stack.length === 0) {
    const lastOpen = text.lastIndexOf('{{', caretStart);
    if (lastOpen === -1) return { start: caretStart, end: caretEnd };
    return { start: lastOpen, end: caretEnd };
  }
  const openIndex = stack[0]; // earliest unmatched open
  // Find the closing that balances that earliest unmatched open
  let depth = stack.length;
  while ((match = tokenRegex.exec(text))) {
    if (match[0] === '{{') depth += 1;
    else depth -= 1;
    if (depth === 0) {
      return { start: openIndex, end: match.index + 2 };
    }
  }
  // If no closing found, replace up to the caret
  return { start: openIndex, end: caretEnd };
}

export function parseIds(raw: string): string[] {
  return raw
    .split(/\s|,|;|\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

export function idsToText(ids: string[]): string {
  return ids.join(', ');
}

export function serviceTierToPriority(tier?: string | null): 'flex' | 'normal' | 'priority' {
  if (tier === 'flex') return 'flex';
  if (tier === 'priority') return 'priority';
  return 'normal'; // default or null
}

export function buildScope(
  mode: ScopeMode,
  pos: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames',
  selectedIds: string[],
  manualIdsText: string,
  frameIdsText: string,
  filterGroup?: BooleanFilterGroup,
  filterLimit?: number,
  frameIncludeVerbs?: boolean,
  frameFlagTarget?: 'frame' | 'verb' | 'both'
): JobScope {
  switch (mode) {
    case 'selection':
      return {
        kind: 'ids',
        pos,
        ids: selectedIds,
      };
    case 'all':
      return {
        kind: 'filters',
        pos,
        filters: { limit: 0 },
      };
    case 'filters':
      return {
        kind: 'filters',
        pos,
        filters: {
          limit: typeof filterLimit === 'number' ? filterLimit : 50,
          where: filterGroup && filterGroup.children.length > 0 ? filterGroup : undefined,
        },
      };
    case 'manual':
      return {
        kind: 'ids',
        pos,
        ids: parseIds(manualIdsText).map(normalizeLexicalCode),
      };
    case 'frames':
      return {
        kind: 'frame_ids',
        pos,
        frameIds: parseIds(frameIdsText),
        includeVerbs: frameIncludeVerbs,
        flagTarget: frameFlagTarget,
      };
    default:
      return {
        kind: 'ids',
        pos,
        ids: selectedIds,
      };
  }
}

export function normalizeLexicalCode(input: string): string {
  const value = input.trim().toLowerCase();
  const match = value.match(/^([a-z0-9_]+)\.([vnar])\.([0-9]{1,2})$/);
  if (!match) return value;
  const [, lemma, pos, sense] = match;
  const padded = sense.padStart(2, '0');
  return `${lemma}.${pos}.${padded}`;
}

export function getManualIdPlaceholder(pos: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames'): string {
  switch (pos) {
    case 'verbs':
      return 'e.g., say.v.01, run.v.02';
    case 'nouns':
      return 'e.g., dog.n.01, cat.n.02';
    case 'adjectives':
      return 'e.g., big.a.01, small.a.02';
    case 'adverbs':
      return 'e.g., quickly.r.01, slowly.r.02';
    case 'frames':
      return 'e.g., Communication, Motion';
    default:
      return 'e.g., word.pos.01';
  }
}

export function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}…`;
}

export function formatRuntime(start: string | null, end?: string) {
  if (!start) return '—';
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = endTime - startTime;
  if (diff <= 0) return '—';
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Estimates the size of a JSON payload in bytes
 */
export function estimatePayloadSize(data: unknown): number {
  return JSON.stringify(data).length;
}

/**
 * Checks if a scope object is too large for HTTP body transmission
 * Uses 2MB threshold (well under Vercel's 4.5MB limit for safety margin)
 */
export function isScopeTooLarge(scope: unknown): boolean {
  const size = estimatePayloadSize(scope);
  // Use 2MB threshold (well under Vercel's 4.5MB limit)
  return size > 2 * 1024 * 1024;
}

/**
 * Converts an ID-based scope to a filter-based scope for large batches
 * This prevents HTTP body size limit errors by having the server resolve IDs
 */
export function convertIdsToFilterScope(scope: JobScopeIds): JobScopeFilters {
  return {
    kind: 'filters',
    pos: scope.pos,
    filters: {
      limit: 0, // no limit - process all matching entries
      where: {
        kind: 'group',
        op: 'or',
        children: scope.ids.map(id => ({
          kind: 'rule',
          field: 'code',
          operator: 'equals',
          value: id,
        })),
      },
    },
  };
}

