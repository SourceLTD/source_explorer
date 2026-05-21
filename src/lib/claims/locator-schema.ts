/**
 * Block locator schema and resolver for instance mentions.
 *
 * A BlockLocator points to a specific character range within a paragraph
 * or heading in a normalized document. Offsets are UTF-16 code units
 * within the block's text (not global).
 */

import { z } from 'zod';
import type { DocumentIndex, DocumentBlock } from '../documents';

export const blockLocatorSchema = z.object({
  type: z.literal('block'),
  sectionIndex: z.number().int().min(0),
  paragraphIndex: z.number().int().min(0).optional(),
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  page: z.number().int().min(1).optional(),
}).refine((loc) => loc.end > loc.start, {
  message: 'end must be greater than start',
});

export type BlockLocator = z.infer<typeof blockLocatorSchema>;

export interface ResolvedMention {
  globalStart: number;
  globalEnd: number;
  mentionText: string;
  breadcrumb: string;
  page?: number;
  pageEnd?: number;
}

/**
 * Find the matching block in the document index for a locator.
 */
function findBlock(index: DocumentIndex, locator: BlockLocator): DocumentBlock | undefined {
  return index.blocks.find((b) => {
    if (b.sectionIndex !== locator.sectionIndex) return false;
    if (locator.paragraphIndex === undefined) {
      return b.kind === 'heading';
    }
    return b.kind === 'paragraph' && b.paragraphIndex === locator.paragraphIndex;
  });
}

/**
 * Resolve a block locator against a document index and canonical text.
 *
 * Returns the global character range and extracted mention text,
 * or null if the locator doesn't match any block.
 */
export function resolveLocator(
  locator: BlockLocator,
  index: DocumentIndex,
  canonicalText: string,
): ResolvedMention | null {
  const block = findBlock(index, locator);
  if (!block) return null;

  const globalStart = block.globalStart + locator.start;
  const globalEnd = block.globalStart + locator.end;

  if (globalEnd > canonicalText.length) return null;

  const mentionText = canonicalText.slice(globalStart, globalEnd);

  const section = index.sections.find((s) => s.index === locator.sectionIndex);
  const sectionLabel = section?.heading ?? `Section ${locator.sectionIndex}`;
  const paraLabel =
    locator.paragraphIndex !== undefined ? ` > paragraph ${locator.paragraphIndex + 1}` : '';
  const breadcrumb = sectionLabel + paraLabel;

  return {
    globalStart,
    globalEnd,
    mentionText,
    breadcrumb,
    page: locator.page ?? block.page,
    pageEnd: block.pageEnd,
  };
}
