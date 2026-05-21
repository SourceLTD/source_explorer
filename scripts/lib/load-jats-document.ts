import { execFileSync } from 'child_process';
import path from 'path';
import type { NormalizedDocument } from '../../src/lib/documents/schema';

const DEFAULT_PAPER_XML = path.resolve(
  __dirname,
  '../../../source-normalize/samples/2021_10.1016_j.molmet.2020.101102/paper.xml',
);

export function loadJatsDocument(xmlPath: string = DEFAULT_PAPER_XML): NormalizedDocument {
  const script = path.join(__dirname, 'normalize-jats.py');
  const out = execFileSync('python3', [script, xmlPath], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out) as NormalizedDocument;
}

export const GLP1_SOURCE_URI = 'doi:10.1016/j.molmet.2020.101102';
export const GLP1_GRAPH_LABEL = 'GLP-1 review (Nauck 2021)';
