/**
 * Types for the normalized document format produced by source-normalize.
 *
 * Matches the Python schema in source-normalize/schema/__init__.py.
 * All character offsets use UTF-16 code units (matching JS String semantics).
 */

export interface Link {
  text: string;
  url: string;
}

export interface Paragraph {
  text: string;
  links?: Link[];
  /** PDF page where this paragraph starts (1-indexed) */
  page?: number;
  /** If paragraph spans pages, the last page involved */
  page_end?: number;
}

export type HeadingLevel = 'intro' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export interface Section {
  heading: string;
  heading_level: HeadingLevel;
  paragraphs: Paragraph[];
  /** PDF page where the heading appears */
  heading_page?: number;
}

export interface Article {
  sections: Section[];
}

export type SourceType = 'web' | 'pdf' | 'wikipedia' | 'jats';

export interface NormalizedDocument {
  url: string;
  source_type: SourceType;
  normalized_at: string;
  article: Article;
  metadata?: Record<string, unknown>;
}
