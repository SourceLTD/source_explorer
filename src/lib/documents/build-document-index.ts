/**
 * Build a document index from a NormalizedDocument.
 *
 * The index provides:
 * - canonicalText: the flat text all locators reference (UTF-16 offsets)
 * - sections: lightweight section registry for breadcrumb display
 * - blocks: paragraph/heading blocks with global character ranges
 *
 * Canonical flatten convention (MUST match any Python equivalent):
 *   for each section:
 *     if heading and headingLevel != "intro":
 *       emit heading block: "{heading}\n\n"
 *     for each paragraph:
 *       emit paragraph block: "{text}\n\n"
 */

import type { NormalizedDocument } from './schema';

export interface DocumentBlock {
  id: string;
  kind: 'heading' | 'paragraph';
  sectionIndex: number;
  paragraphIndex?: number;
  globalStart: number;
  globalEnd: number;
  page?: number;
  pageEnd?: number;
}

export interface DocumentIndexSection {
  index: number;
  heading: string;
  headingLevel: string;
}

export interface DocumentIndex {
  version: 1;
  encoding: 'utf16';
  sections: DocumentIndexSection[];
  blocks: DocumentBlock[];
}

export interface BuildDocumentIndexResult {
  canonicalText: string;
  documentIndex: DocumentIndex;
}

export function buildDocumentIndex(doc: NormalizedDocument): BuildDocumentIndexResult {
  const blocks: DocumentBlock[] = [];
  const sections: DocumentIndexSection[] = [];
  const textParts: string[] = [];
  let globalOffset = 0;

  for (let sectionIdx = 0; sectionIdx < doc.article.sections.length; sectionIdx++) {
    const section = doc.article.sections[sectionIdx];

    sections.push({
      index: sectionIdx,
      heading: section.heading,
      headingLevel: section.heading_level,
    });

    if (section.heading && section.heading_level !== 'intro') {
      const headingText = section.heading + '\n\n';
      const headingLen = headingText.length; // JS string length = UTF-16 code units
      blocks.push({
        id: `s${sectionIdx}-h`,
        kind: 'heading',
        sectionIndex: sectionIdx,
        globalStart: globalOffset,
        globalEnd: globalOffset + headingLen,
        page: section.heading_page ?? undefined,
      });
      textParts.push(headingText);
      globalOffset += headingLen;
    }

    for (let paraIdx = 0; paraIdx < section.paragraphs.length; paraIdx++) {
      const para = section.paragraphs[paraIdx];
      const paraText = para.text + '\n\n';
      const paraLen = paraText.length;
      blocks.push({
        id: `s${sectionIdx}-p${paraIdx}`,
        kind: 'paragraph',
        sectionIndex: sectionIdx,
        paragraphIndex: paraIdx,
        globalStart: globalOffset,
        globalEnd: globalOffset + paraLen,
        page: para.page ?? undefined,
        pageEnd: para.page_end ?? undefined,
      });
      textParts.push(paraText);
      globalOffset += paraLen;
    }
  }

  const canonicalText = textParts.join('');

  return {
    canonicalText,
    documentIndex: {
      version: 1,
      encoding: 'utf16',
      sections,
      blocks,
    },
  };
}
