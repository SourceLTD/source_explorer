import type { buildDocumentIndex } from '../../src/lib/documents/build-document-index';

export function blockLocator(
  canonicalText: string,
  documentIndex: ReturnType<typeof buildDocumentIndex>['documentIndex'],
  needle: string,
  occurrence: number = 0,
): { locator: object; mentionText: string } {
  let searchFrom = 0;
  for (let i = 0; i <= occurrence; i++) {
    const idx = canonicalText.indexOf(needle, searchFrom);
    if (idx === -1) {
      throw new Error(`Needle not found: "${needle}" (occurrence ${occurrence})`);
    }
    if (i === occurrence) {
      const block = documentIndex.blocks.find((b) => b.globalStart <= idx && idx < b.globalEnd);
      if (!block) throw new Error(`No block contains offset ${idx}`);
      return {
        locator: {
          type: 'block',
          sectionIndex: block.sectionIndex,
          paragraphIndex: block.paragraphIndex,
          start: idx - block.globalStart,
          end: idx - block.globalStart + needle.length,
          ...(block.page ? { page: block.page } : {}),
        },
        mentionText: needle,
      };
    }
    searchFrom = idx + needle.length;
  }
  throw new Error('Unreachable');
}

/** Spread GLP-1 occurrence indices across the document. */
export function spreadOccurrenceIndices(matchCount: number, pickCount: number = 5): number[] {
  if (matchCount < pickCount) {
    throw new Error(`Need at least ${pickCount} occurrences, found ${matchCount}`);
  }
  if (pickCount === 1) return [0];
  const indices: number[] = [];
  for (let i = 0; i < pickCount; i++) {
    indices.push(Math.floor((i * (matchCount - 1)) / (pickCount - 1)));
  }
  return indices;
}
