import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import type { CuratedMappingFile, MedicalConceptRecord } from './types';

const DEFAULT_SOURCE_MEDICAL_ROOT = path.resolve(process.cwd(), '../source-medical');

export function resolveSourceMedicalRoot(): string {
  return process.env.SOURCE_MEDICAL_PATH ?? DEFAULT_SOURCE_MEDICAL_ROOT;
}

export function loadCuratedMappingFiles(root?: string): CuratedMappingFile[] {
  const base = root ?? resolveSourceMedicalRoot();
  const curatedDir = path.join(base, 'mappings', 'curated');
  if (!fs.existsSync(curatedDir)) {
    throw new Error(
      `source-medical curated mappings not found at ${curatedDir}. ` +
        'Set SOURCE_MEDICAL_PATH or clone source-medical alongside source-explorer.',
    );
  }

  const files: CuratedMappingFile[] = [];
  for (const filePath of walkYamlFiles(curatedDir)) {
    const raw = yaml.parse(fs.readFileSync(filePath, 'utf8')) as CuratedMappingFile;
    if (!raw?.concept?.id) {
      throw new Error(`Invalid mapping file (missing concept.id): ${filePath}`);
    }
    files.push(raw);
  }
  return files;
}

export function flattenConceptRecords(files: CuratedMappingFile[]): MedicalConceptRecord[] {
  const records: MedicalConceptRecord[] = [];
  for (const file of files) {
    records.push(file.concept);
    for (const variant of file.variants ?? []) {
      records.push(variant);
    }
  }
  return records;
}

function walkYamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkYamlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
      out.push(full);
    }
  }
  return out.sort();
}
