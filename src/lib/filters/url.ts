import type { BooleanFilterGroup, BooleanFilterRule } from './types';
import { createEmptyGroup } from './types';
import type { PartOfSpeech } from '@/lib/llm/types';

function addRule(group: BooleanFilterGroup, rule: BooleanFilterRule) {
  group.children.push(rule);
}

export function parseURLToFilterAST(pos: PartOfSpeech, input: string | URLSearchParams): BooleanFilterGroup | null {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const group = createEmptyGroup();

  const get = (k: string) => params.get(k);

  // Text filters
  if (pos === 'frames') {
    // Frame-specific text filters
    const frameName = get('frame_name');
    if (frameName) addRule(group, { kind: 'rule', field: 'frame_name', operator: 'contains', value: frameName });

    const definition = get('definition');
    if (definition) addRule(group, { kind: 'rule', field: 'definition', operator: 'contains', value: definition });

    const shortDefinition = get('short_definition');
    if (shortDefinition) addRule(group, { kind: 'rule', field: 'short_definition', operator: 'contains', value: shortDefinition });

    const prototypicalSynset = get('prototypical_synset');
    if (prototypicalSynset) addRule(group, { kind: 'rule', field: 'prototypical_synset', operator: 'contains', value: prototypicalSynset });
  } else {
    // Entry-specific text filters (verbs, nouns, adjectives, adverbs)
    const gloss = get('gloss');
    if (gloss) addRule(group, { kind: 'rule', field: 'gloss', operator: 'contains', value: gloss });

    const lemmas = get('lemmas');
    if (lemmas) addRule(group, { kind: 'rule', field: 'lemmas', operator: 'hasSome', value: splitList(lemmas) });

    const examples = get('examples');
    if (examples) addRule(group, { kind: 'rule', field: 'examples', operator: 'hasSome', value: splitList(examples) });

    const particles = get('particles');
    if (particles && pos === 'verbs') addRule(group, { kind: 'rule', field: 'particles', operator: 'hasSome', value: splitList(particles) });
  }

  // Common text filters
  const flaggedReason = get('flaggedReason');
  if (flaggedReason) addRule(group, { kind: 'rule', field: 'flagged_reason', operator: 'contains', value: flaggedReason });

  const forbiddenReason = get('forbiddenReason');
  if (forbiddenReason) addRule(group, { kind: 'rule', field: 'forbidden_reason', operator: 'contains', value: forbiddenReason });

  // Categorical (skip for frames)
  if (pos !== 'frames') {
    const lexfile = get('lexfile');
    if (lexfile) {
      const values = splitCsv(lexfile);
      addRule(group, { kind: 'rule', field: 'lexfile', operator: values.length > 1 ? 'in' : 'equals', value: values.length > 1 ? values : values[0] });
    }

    const frameId = get('frame_id');
    if (frameId && pos === 'verbs') {
      const values = splitCsv(frameId);
      addRule(group, { kind: 'rule', field: 'frame_id', operator: values.length > 1 ? 'in' : 'equals', value: values.length > 1 ? values : values[0] });
    }
  }

  // Booleans (URL uses camelCase for isMwe)
  if (pos === 'frames') {
    // Frame-specific boolean filters
    const isSupportingFrame = get('is_supporting_frame');
    if (isSupportingFrame !== null) addRule(group, { kind: 'rule', field: 'is_supporting_frame', operator: 'is', value: isSupportingFrame === 'true' });

    const communication = get('communication');
    if (communication !== null) addRule(group, { kind: 'rule', field: 'communication', operator: 'is', value: communication === 'true' });
  } else {
    // Entry-specific boolean filters
    const isMwe = get('isMwe');
    if (isMwe !== null) addRule(group, { kind: 'rule', field: 'is_mwe', operator: 'is', value: isMwe === 'true' });

    const transitive = get('transitive');
    if (transitive !== null && pos === 'verbs') addRule(group, { kind: 'rule', field: 'transitive', operator: 'is', value: transitive === 'true' });
  }

  // Common boolean filters
  const flagged = get('flagged');
  if (flagged !== null) addRule(group, { kind: 'rule', field: 'flagged', operator: 'is', value: flagged === 'true' });

  const forbidden = get('forbidden');
  if (forbidden !== null) addRule(group, { kind: 'rule', field: 'forbidden', operator: 'is', value: forbidden === 'true' });

  // Numeric (computed for verbs only)
  if (pos === 'verbs') {
    const parentsMin = get('parentsCountMin');
    if (parentsMin) addRule(group, { kind: 'rule', field: 'parentsCount', operator: 'gte', value: parseInt(parentsMin, 10) });
    const parentsMax = get('parentsCountMax');
    if (parentsMax) addRule(group, { kind: 'rule', field: 'parentsCount', operator: 'lte', value: parseInt(parentsMax, 10) });
    const childrenMin = get('childrenCountMin');
    if (childrenMin) addRule(group, { kind: 'rule', field: 'childrenCount', operator: 'gte', value: parseInt(childrenMin, 10) });
    const childrenMax = get('childrenCountMax');
    if (childrenMax) addRule(group, { kind: 'rule', field: 'childrenCount', operator: 'lte', value: parseInt(childrenMax, 10) });
  }

  // Dates
  const createdAfter = get('createdAfter');
  if (createdAfter) addRule(group, { kind: 'rule', field: 'created_at', operator: 'after', value: createdAfter });
  const createdBefore = get('createdBefore');
  if (createdBefore) addRule(group, { kind: 'rule', field: 'created_at', operator: 'before', value: createdBefore });
  const updatedAfter = get('updatedAfter');
  if (updatedAfter) addRule(group, { kind: 'rule', field: 'updated_at', operator: 'after', value: updatedAfter });
  const updatedBefore = get('updatedBefore');
  if (updatedBefore) addRule(group, { kind: 'rule', field: 'updated_at', operator: 'before', value: updatedBefore });

  return group.children.length > 0 ? group : null;
}

function splitList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}


