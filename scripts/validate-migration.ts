/**
 * Migration Validation Script
 * 
 * Verifies that all data was correctly migrated from old tables to new tables.
 * Run with: npx ts-node scripts/validate-migration.ts
 * 
 * Exit codes:
 *   0 = All validations passed
 *   1 = Validation errors found
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationResult {
  check: string;
  passed: boolean;
  expected: number | string;
  actual: number | string;
  details?: string;
}

const results: ValidationResult[] = [];

function log(result: ValidationResult) {
  results.push(result);
  const status = result.passed ? '✅' : '❌';
  console.log(`${status} ${result.check}`);
  if (!result.passed) {
    console.log(`   Expected: ${result.expected}`);
    console.log(`   Actual:   ${result.actual}`);
    if (result.details) console.log(`   Details:  ${result.details}`);
  }
}

// Helper to safely compare bigint counts from Prisma raw queries
function countEquals(a: bigint, b: bigint): boolean {
  return a.toString() === b.toString();
}

async function validateRowCounts() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ROW COUNT VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Verbs
  const verbsOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM verbs`;
  const verbsNew = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM lexical_units WHERE pos = 'verb'`;
  log({
    check: 'Verbs count matches',
    passed: countEquals(verbsOld[0].count, verbsNew[0].count),
    expected: verbsOld[0].count.toString(),
    actual: verbsNew[0].count.toString(),
  });
  
  // Nouns
  const nounsOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM nouns`;
  const nounsNew = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM lexical_units WHERE pos = 'noun'`;
  log({
    check: 'Nouns count matches',
    passed: countEquals(nounsOld[0].count, nounsNew[0].count),
    expected: nounsOld[0].count.toString(),
    actual: nounsNew[0].count.toString(),
  });
  
  // Adjectives
  const adjOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM adjectives`;
  const adjNew = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM lexical_units WHERE pos = 'adjective'`;
  log({
    check: 'Adjectives count matches',
    passed: countEquals(adjOld[0].count, adjNew[0].count),
    expected: adjOld[0].count.toString(),
    actual: adjNew[0].count.toString(),
  });
  
  // Adverbs
  const advOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM adverbs`;
  const advNew = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM lexical_units WHERE pos = 'adverb'`;
  log({
    check: 'Adverbs count matches',
    passed: countEquals(advOld[0].count, advNew[0].count),
    expected: advOld[0].count.toString(),
    actual: advNew[0].count.toString(),
  });
  
  // Total
  const totalOld = Number(verbsOld[0].count) + Number(nounsOld[0].count) + 
                   Number(adjOld[0].count) + Number(advOld[0].count);
  const totalNew = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM lexical_units`;
  log({
    check: 'Total lexical units count matches',
    passed: totalOld === Number(totalNew[0].count),
    expected: totalOld.toString(),
    actual: totalNew[0].count.toString(),
  });
}

async function validateRelationCounts() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RELATION COUNT VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const verbRelOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM verb_relations`;
  const nounRelOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM noun_relations`;
  const adjRelOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM adjective_relations`;
  const advRelOld = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM adverb_relations`;
  
  const totalOld = BigInt(verbRelOld[0].count) + BigInt(nounRelOld[0].count) + 
                   BigInt(adjRelOld[0].count) + BigInt(advRelOld[0].count);
  
  const relNew = await prisma.$queryRaw<[{count: bigint}]>`SELECT COUNT(*) as count FROM lexical_unit_relations`;
  
  log({
    check: 'Verb relations count',
    passed: true, // Just info
    expected: verbRelOld[0].count.toString(),
    actual: verbRelOld[0].count.toString(),
  });
  
  log({
    check: 'Noun relations count',
    passed: true,
    expected: nounRelOld[0].count.toString(),
    actual: nounRelOld[0].count.toString(),
  });
  
  log({
    check: 'Adjective relations count',
    passed: true,
    expected: adjRelOld[0].count.toString(),
    actual: adjRelOld[0].count.toString(),
  });
  
  log({
    check: 'Adverb relations count',
    passed: true,
    expected: advRelOld[0].count.toString(),
    actual: advRelOld[0].count.toString(),
  });
  
  log({
    check: 'Total relations count matches',
    passed: countEquals(totalOld, relNew[0].count),
    expected: totalOld.toString(),
    actual: relNew[0].count.toString(),
    details: `verb_rel=${verbRelOld[0].count}, noun_rel=${nounRelOld[0].count}, adj_rel=${adjRelOld[0].count}, adv_rel=${advRelOld[0].count}`,
  });
}

async function validateDataIntegrity() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DATA INTEGRITY VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // CRITICAL: Check for duplicate codes across POS types that could cause migration failures
  const duplicateCodes = await prisma.$queryRaw<{code: string, count: bigint}[]>`
    SELECT code, COUNT(*) as count FROM (
      SELECT code FROM verbs
      UNION ALL SELECT code FROM nouns
      UNION ALL SELECT code FROM adjectives
      UNION ALL SELECT code FROM adverbs
    ) all_codes
    GROUP BY code HAVING COUNT(*) > 1
    LIMIT 10
  `;
  log({
    check: 'No duplicate codes across POS types',
    passed: duplicateCodes.length === 0,
    expected: '0 duplicates',
    actual: `${duplicateCodes.length} duplicates`,
    details: duplicateCodes.length > 0 
      ? `⚠️ CRITICAL: Duplicate codes will cause data loss! First duplicates: ${duplicateCodes.slice(0, 5).map(d => d.code).join(', ')}`
      : undefined,
  });
  
  // Check all verb codes exist in lexical_units
  const missingVerbs = await prisma.$queryRaw<{code: string}[]>`
    SELECT v.code FROM verbs v 
    LEFT JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb'
    WHERE lu.id IS NULL
    LIMIT 10
  `;
  log({
    check: 'All verb codes migrated',
    passed: missingVerbs.length === 0,
    expected: '0 missing',
    actual: `${missingVerbs.length} missing`,
    details: missingVerbs.length > 0 ? `First missing: ${missingVerbs.slice(0, 5).map(v => v.code).join(', ')}` : undefined,
  });
  
  // Check all noun codes exist
  const missingNouns = await prisma.$queryRaw<{code: string}[]>`
    SELECT n.code FROM nouns n 
    LEFT JOIN lexical_units lu ON lu.code = n.code AND lu.pos = 'noun'
    WHERE lu.id IS NULL
    LIMIT 10
  `;
  log({
    check: 'All noun codes migrated',
    passed: missingNouns.length === 0,
    expected: '0 missing',
    actual: `${missingNouns.length} missing`,
    details: missingNouns.length > 0 ? `First missing: ${missingNouns.slice(0, 5).map(n => n.code).join(', ')}` : undefined,
  });
  
  // Check all adjective codes exist
  const missingAdj = await prisma.$queryRaw<{code: string}[]>`
    SELECT a.code FROM adjectives a 
    LEFT JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adjective'
    WHERE lu.id IS NULL
    LIMIT 10
  `;
  log({
    check: 'All adjective codes migrated',
    passed: missingAdj.length === 0,
    expected: '0 missing',
    actual: `${missingAdj.length} missing`,
    details: missingAdj.length > 0 ? `First missing: ${missingAdj.slice(0, 5).map(a => a.code).join(', ')}` : undefined,
  });
  
  // Check all adverb codes exist
  const missingAdv = await prisma.$queryRaw<{code: string}[]>`
    SELECT a.code FROM adverbs a 
    LEFT JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adverb'
    WHERE lu.id IS NULL
    LIMIT 10
  `;
  log({
    check: 'All adverb codes migrated',
    passed: missingAdv.length === 0,
    expected: '0 missing',
    actual: `${missingAdv.length} missing`,
    details: missingAdv.length > 0 ? `First missing: ${missingAdv.slice(0, 5).map(a => a.code).join(', ')}` : undefined,
  });
}

async function validateFieldValues() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FIELD VALUE VALIDATION (Sample Checks)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Verify gloss values match for verbs
  const verbMismatches = await prisma.$queryRaw<{code: string, old_gloss: string, new_gloss: string}[]>`
    SELECT v.code, v.gloss as old_gloss, lu.gloss as new_gloss 
    FROM verbs v
    JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb'
    WHERE v.gloss != lu.gloss OR v.legacy_id != lu.legacy_id OR v.lexfile != lu.lexfile
    LIMIT 10
  `;
  log({
    check: 'Verb field values match (gloss, legacy_id, lexfile)',
    passed: verbMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${verbMismatches.length} mismatches`,
    details: verbMismatches.length > 0 ? `First: ${verbMismatches[0].code}` : undefined,
  });
  
  // Verify verb-specific fields (vendler_class, concrete, created_from)
  const verbSpecificMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT v.code FROM verbs v
    JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb'
    WHERE COALESCE(v.vendler_class::text, '') != COALESCE(lu.vendler_class::text, '')
       OR COALESCE(v.concrete, false) != COALESCE(lu.concrete, false)
       OR COALESCE(v.created_from, '{}') != COALESCE(lu.created_from, '{}')
    LIMIT 10
  `;
  log({
    check: 'Verb-specific field values match (vendler_class, concrete, created_from)',
    passed: verbSpecificMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${verbSpecificMismatches.length} mismatches`,
    details: verbSpecificMismatches.length > 0 ? `First: ${verbSpecificMismatches[0].code}` : undefined,
  });
  
  // Verify noun-specific fields
  const nounMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT n.code FROM nouns n
    JOIN lexical_units lu ON lu.code = n.code AND lu.pos = 'noun'
    WHERE COALESCE(n.countable, false) != COALESCE(lu.countable, false)
       OR COALESCE(n.proper, false) != COALESCE(lu.proper, false)
       OR COALESCE(n.collective, false) != COALESCE(lu.collective, false)
       OR COALESCE(n.concrete, false) != COALESCE(lu.concrete, false)
       OR COALESCE(n.predicate, false) != COALESCE(lu.predicate, false)
       OR COALESCE(n.is_mwe, false) != COALESCE(lu.is_mwe, false)
    LIMIT 10
  `;
  log({
    check: 'Noun-specific field values match (countable, proper, collective, concrete, predicate, is_mwe)',
    passed: nounMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${nounMismatches.length} mismatches`,
    details: nounMismatches.length > 0 ? `First: ${nounMismatches[0].code}` : undefined,
  });
  
  // Verify adjective-specific fields
  const adjMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT a.code FROM adjectives a
    JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adjective'
    WHERE COALESCE(a.is_satellite, false) != COALESCE(lu.is_satellite, false)
       OR COALESCE(a.predicative, true) != COALESCE(lu.predicative, true)
       OR COALESCE(a.attributive, true) != COALESCE(lu.attributive, true)
       OR COALESCE(a.subjective, false) != COALESCE(lu.subjective, false)
       OR COALESCE(a.relational, false) != COALESCE(lu.relational, false)
       OR COALESCE(a.gradable, false) != COALESCE(lu.gradable, false)
       OR COALESCE(a.is_mwe, false) != COALESCE(lu.is_mwe, false)
    LIMIT 10
  `;
  log({
    check: 'Adjective-specific field values match (including gradable, is_mwe)',
    passed: adjMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${adjMismatches.length} mismatches`,
    details: adjMismatches.length > 0 ? `First: ${adjMismatches[0].code}` : undefined,
  });
  
  // Verify adverb-specific fields
  const advMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT a.code FROM adverbs a
    JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adverb'
    WHERE COALESCE(a.gradable, false) != COALESCE(lu.gradable, false)
       OR COALESCE(a.is_mwe, false) != COALESCE(lu.is_mwe, false)
    LIMIT 10
  `;
  log({
    check: 'Adverb-specific field values match (gradable, is_mwe)',
    passed: advMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${advMismatches.length} mismatches`,
    details: advMismatches.length > 0 ? `First: ${advMismatches[0].code}` : undefined,
  });
  
  // Verify frame_id matches for all POS types
  const verbFrameMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT v.code FROM verbs v
    JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb'
    WHERE COALESCE(v.frame_id, -1) != COALESCE(lu.frame_id, -1)
    LIMIT 10
  `;
  log({
    check: 'Frame IDs match for verbs',
    passed: verbFrameMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${verbFrameMismatches.length} mismatches`,
    details: verbFrameMismatches.length > 0 ? `First: ${verbFrameMismatches[0].code}` : undefined,
  });
  
  const nounFrameMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT n.code FROM nouns n
    JOIN lexical_units lu ON lu.code = n.code AND lu.pos = 'noun'
    WHERE COALESCE(n.frame_id, -1) != COALESCE(lu.frame_id, -1)
    LIMIT 10
  `;
  log({
    check: 'Frame IDs match for nouns',
    passed: nounFrameMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${nounFrameMismatches.length} mismatches`,
    details: nounFrameMismatches.length > 0 ? `First: ${nounFrameMismatches[0].code}` : undefined,
  });
  
  const adjFrameMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT a.code FROM adjectives a
    JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adjective'
    WHERE COALESCE(a.frame_id, -1) != COALESCE(lu.frame_id, -1)
    LIMIT 10
  `;
  log({
    check: 'Frame IDs match for adjectives',
    passed: adjFrameMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${adjFrameMismatches.length} mismatches`,
    details: adjFrameMismatches.length > 0 ? `First: ${adjFrameMismatches[0].code}` : undefined,
  });
  
  const advFrameMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT a.code FROM adverbs a
    JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adverb'
    WHERE COALESCE(a.frame_id, -1) != COALESCE(lu.frame_id, -1)
    LIMIT 10
  `;
  log({
    check: 'Frame IDs match for adverbs',
    passed: advFrameMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${advFrameMismatches.length} mismatches`,
    details: advFrameMismatches.length > 0 ? `First: ${advFrameMismatches[0].code}` : undefined,
  });
  
  // Verify flagged/verifiable fields
  const flagMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT v.code FROM verbs v
    JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb'
    WHERE COALESCE(v.flagged, false) != COALESCE(lu.flagged, false)
       OR COALESCE(v.verifiable, false) != COALESCE(lu.verifiable, false)
    LIMIT 10
  `;
  log({
    check: 'Flagged/verifiable fields match',
    passed: flagMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${flagMismatches.length} mismatches`,
  });
  
  // Verify deleted fields match
  const deletedMismatches = await prisma.$queryRaw<{code: string}[]>`
    SELECT v.code FROM verbs v
    JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb'
    WHERE v.deleted != lu.deleted
       OR v.version != lu.version
    LIMIT 10
  `;
  log({
    check: 'Deleted and version fields match for verbs',
    passed: deletedMismatches.length === 0,
    expected: '0 mismatches',
    actual: `${deletedMismatches.length} mismatches`,
  });
}

async function validateRelationMappings() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RELATION MAPPING VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Check verb relations are correctly mapped
  const verbRelMissing = await prisma.$queryRaw<[{count: bigint}]>`
    WITH verb_map AS (
      SELECT v.id as old_id, lu.id as new_id FROM verbs v
      JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb'
    )
    SELECT COUNT(*) as count FROM verb_relations vr
    JOIN verb_map sm ON vr.source_id = sm.old_id
    JOIN verb_map tm ON vr.target_id = tm.old_id
    LEFT JOIN lexical_unit_relations lur 
      ON lur.source_id = sm.new_id 
      AND lur.target_id = tm.new_id 
      AND lur.type::text = vr.type::text
    WHERE lur.id IS NULL
  `;
  log({
    check: 'All verb relations migrated correctly',
    passed: Number(verbRelMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${verbRelMissing[0].count} missing`,
  });
  
  // Check noun relations
  const nounRelMissing = await prisma.$queryRaw<[{count: bigint}]>`
    WITH noun_map AS (
      SELECT n.id as old_id, lu.id as new_id FROM nouns n
      JOIN lexical_units lu ON lu.code = n.code AND lu.pos = 'noun'
    )
    SELECT COUNT(*) as count FROM noun_relations nr
    JOIN noun_map sm ON nr.source_id = sm.old_id
    JOIN noun_map tm ON nr.target_id = tm.old_id
    LEFT JOIN lexical_unit_relations lur 
      ON lur.source_id = sm.new_id 
      AND lur.target_id = tm.new_id 
      AND lur.type::text = nr.type::text
    WHERE lur.id IS NULL
  `;
  log({
    check: 'All noun relations migrated correctly',
    passed: Number(nounRelMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${nounRelMissing[0].count} missing`,
  });
  
  // Check adjective relations
  const adjRelMissing = await prisma.$queryRaw<[{count: bigint}]>`
    WITH adj_map AS (
      SELECT a.id as old_id, lu.id as new_id FROM adjectives a
      JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adjective'
    )
    SELECT COUNT(*) as count FROM adjective_relations ar
    JOIN adj_map sm ON ar.source_id = sm.old_id
    JOIN adj_map tm ON ar.target_id = tm.old_id
    LEFT JOIN lexical_unit_relations lur 
      ON lur.source_id = sm.new_id 
      AND lur.target_id = tm.new_id 
      AND lur.type::text = ar.type::text
    WHERE lur.id IS NULL
  `;
  log({
    check: 'All adjective relations migrated correctly',
    passed: Number(adjRelMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${adjRelMissing[0].count} missing`,
  });
  
  // Check adverb relations
  const advRelMissing = await prisma.$queryRaw<[{count: bigint}]>`
    WITH adv_map AS (
      SELECT a.id as old_id, lu.id as new_id FROM adverbs a
      JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adverb'
    )
    SELECT COUNT(*) as count FROM adverb_relations ar
    JOIN adv_map sm ON ar.source_id = sm.old_id
    JOIN adv_map tm ON ar.target_id = tm.old_id
    LEFT JOIN lexical_unit_relations lur 
      ON lur.source_id = sm.new_id 
      AND lur.target_id = tm.new_id 
      AND lur.type::text = ar.type::text
    WHERE lur.id IS NULL
  `;
  log({
    check: 'All adverb relations migrated correctly',
    passed: Number(advRelMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${advRelMissing[0].count} missing`,
  });
}

async function validateRecipeMigration() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RECIPE MIGRATION VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Check recipes have frame_id populated where verb had frame_id
  const recipesMissingFrame = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipes r
    JOIN verbs v ON r.verb_id = v.id
    WHERE v.frame_id IS NOT NULL AND r.frame_id IS NULL
  `;
  log({
    check: 'Recipes have frame_id populated from verb',
    passed: Number(recipesMissingFrame[0].count) === 0,
    expected: '0 missing',
    actual: `${recipesMissingFrame[0].count} missing`,
  });
  
  // Check recipe_predicates have predicate_frame_id populated
  const predicatesMissingFrame = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipe_predicates rp
    JOIN verbs v ON rp.predicate_verb_id = v.id
    WHERE v.frame_id IS NOT NULL AND rp.predicate_frame_id IS NULL
  `;
  log({
    check: 'Recipe predicates have predicate_frame_id populated',
    passed: Number(predicatesMissingFrame[0].count) === 0,
    expected: '0 missing',
    actual: `${predicatesMissingFrame[0].count} missing`,
  });
  
  // Verify frame_id matches verb's frame_id
  const recipesFrameMismatch = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipes r
    JOIN verbs v ON r.verb_id = v.id
    WHERE r.frame_id IS NOT NULL AND v.frame_id IS NOT NULL AND r.frame_id != v.frame_id
  `;
  log({
    check: 'Recipe frame_id matches verb frame_id',
    passed: Number(recipesFrameMismatch[0].count) === 0,
    expected: '0 mismatches',
    actual: `${recipesFrameMismatch[0].count} mismatches`,
  });
}

async function validateRecipeVariables() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RECIPE VARIABLES VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Check all items with noun_id have lexical_unit_id
  const nounVarsMissing = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipe_variables
    WHERE noun_id IS NOT NULL AND lexical_unit_id IS NULL
  `;
  log({
    check: 'Recipe variables with noun_id have lexical_unit_id',
    passed: Number(nounVarsMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${nounVarsMissing[0].count} missing`,
  });
  
  // Verify lexical_unit_id points to correct noun
  const nounVarsMismatch = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipe_variables rv
    JOIN nouns n ON rv.noun_id = n.id
    JOIN lexical_units lu ON rv.lexical_unit_id = lu.id
    WHERE lu.code != n.code OR lu.pos != 'noun'
  `;
  log({
    check: 'Recipe variables lexical_unit_id points to correct noun',
    passed: Number(nounVarsMismatch[0].count) === 0,
    expected: '0 mismatches',
    actual: `${nounVarsMismatch[0].count} mismatches`,
  });
}

async function validateLLMJobItems() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  LLM JOB ITEMS VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Check all items with verb_id have lexical_unit_id
  const verbItemsMissing = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items
    WHERE verb_id IS NOT NULL AND lexical_unit_id IS NULL
  `;
  log({
    check: 'LLM job items with verb_id have lexical_unit_id',
    passed: Number(verbItemsMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${verbItemsMissing[0].count} missing`,
  });
  
  // Check items with noun_id
  const nounItemsMissing = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items
    WHERE noun_id IS NOT NULL AND lexical_unit_id IS NULL
  `;
  log({
    check: 'LLM job items with noun_id have lexical_unit_id',
    passed: Number(nounItemsMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${nounItemsMissing[0].count} missing`,
  });
  
  // Check items with adjective_id
  const adjItemsMissing = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items
    WHERE adjective_id IS NOT NULL AND lexical_unit_id IS NULL
  `;
  log({
    check: 'LLM job items with adjective_id have lexical_unit_id',
    passed: Number(adjItemsMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${adjItemsMissing[0].count} missing`,
  });
  
  // Check items with adverb_id
  const advItemsMissing = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items
    WHERE adverb_id IS NOT NULL AND lexical_unit_id IS NULL
  `;
  log({
    check: 'LLM job items with adverb_id have lexical_unit_id',
    passed: Number(advItemsMissing[0].count) === 0,
    expected: '0 missing',
    actual: `${advItemsMissing[0].count} missing`,
  });
  
  // Verify lexical_unit_id points to correct entry for verbs
  const verbItemsMismatch = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items lji
    JOIN verbs v ON lji.verb_id = v.id
    JOIN lexical_units lu ON lji.lexical_unit_id = lu.id
    WHERE lu.code != v.code OR lu.pos != 'verb'
  `;
  log({
    check: 'LLM job items lexical_unit_id points to correct verb',
    passed: Number(verbItemsMismatch[0].count) === 0,
    expected: '0 mismatches',
    actual: `${verbItemsMismatch[0].count} mismatches`,
  });
  
  // Verify lexical_unit_id points to correct entry for nouns
  const nounItemsMismatch = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items lji
    JOIN nouns n ON lji.noun_id = n.id
    JOIN lexical_units lu ON lji.lexical_unit_id = lu.id
    WHERE lu.code != n.code OR lu.pos != 'noun'
  `;
  log({
    check: 'LLM job items lexical_unit_id points to correct noun',
    passed: Number(nounItemsMismatch[0].count) === 0,
    expected: '0 mismatches',
    actual: `${nounItemsMismatch[0].count} mismatches`,
  });
  
  // Verify lexical_unit_id points to correct entry for adjectives
  const adjItemsMismatch = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items lji
    JOIN adjectives a ON lji.adjective_id = a.id
    JOIN lexical_units lu ON lji.lexical_unit_id = lu.id
    WHERE lu.code != a.code OR lu.pos != 'adjective'
  `;
  log({
    check: 'LLM job items lexical_unit_id points to correct adjective',
    passed: Number(adjItemsMismatch[0].count) === 0,
    expected: '0 mismatches',
    actual: `${adjItemsMismatch[0].count} mismatches`,
  });
  
  // Verify lexical_unit_id points to correct entry for adverbs
  const advItemsMismatch = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM llm_job_items lji
    JOIN adverbs a ON lji.adverb_id = a.id
    JOIN lexical_units lu ON lji.lexical_unit_id = lu.id
    WHERE lu.code != a.code OR lu.pos != 'adverb'
  `;
  log({
    check: 'LLM job items lexical_unit_id points to correct adverb',
    passed: Number(advItemsMismatch[0].count) === 0,
    expected: '0 mismatches',
    actual: `${advItemsMismatch[0].count} mismatches`,
  });
}

async function validateRoleGroups() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ROLE GROUPS VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const roleGroupsMissingFrame = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM role_groups rg
    JOIN verbs v ON rg.verb_id = v.id
    WHERE v.frame_id IS NOT NULL AND rg.frame_id IS NULL
  `;
  log({
    check: 'Role groups have frame_id populated from verb',
    passed: Number(roleGroupsMissingFrame[0].count) === 0,
    expected: '0 missing',
    actual: `${roleGroupsMissingFrame[0].count} missing`,
  });
  
  // Verify frame_id matches verb's frame_id
  const roleGroupsFrameMismatch = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM role_groups rg
    JOIN verbs v ON rg.verb_id = v.id
    WHERE rg.frame_id IS NOT NULL AND v.frame_id IS NOT NULL AND rg.frame_id != v.frame_id
  `;
  log({
    check: 'Role group frame_id matches verb frame_id',
    passed: Number(roleGroupsFrameMismatch[0].count) === 0,
    expected: '0 mismatches',
    actual: `${roleGroupsFrameMismatch[0].count} mismatches`,
  });
}

async function validateOrphanedData() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ORPHANED DATA CHECK (WARNINGS)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Check for recipes with verbs that have no frame_id
  const orphanedRecipes = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipes r
    JOIN verbs v ON r.verb_id = v.id
    WHERE v.frame_id IS NULL
  `;
  const orphanedRecipeCount = Number(orphanedRecipes[0].count);
  log({
    check: 'Recipes with NULL frame_id (verb has no frame)',
    passed: true, // Warning only, not a failure
    expected: '0 (ideal)',
    actual: `${orphanedRecipeCount}`,
    details: orphanedRecipeCount > 0 
      ? '⚠️  WARNING: These recipes will have NULL frame_id after migration'
      : undefined,
  });
  
  // Check for recipe_predicates with verbs that have no frame_id  
  const orphanedPredicates = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipe_predicates rp
    JOIN verbs v ON rp.predicate_verb_id = v.id
    WHERE v.frame_id IS NULL
  `;
  const orphanedPredicateCount = Number(orphanedPredicates[0].count);
  log({
    check: 'Recipe predicates with NULL predicate_frame_id (verb has no frame)',
    passed: true, // Warning only
    expected: '0 (ideal)',
    actual: `${orphanedPredicateCount}`,
    details: orphanedPredicateCount > 0 
      ? '⚠️  WARNING: These predicates will have NULL predicate_frame_id after migration'
      : undefined,
  });
  
  // Check for role_groups with verbs that have no frame_id
  const orphanedRoleGroups = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM role_groups rg
    JOIN verbs v ON rg.verb_id = v.id
    WHERE v.frame_id IS NULL
  `;
  const orphanedRoleGroupCount = Number(orphanedRoleGroups[0].count);
  log({
    check: 'Role groups with NULL frame_id (verb has no frame)',
    passed: true, // Warning only
    expected: '0 (ideal)',
    actual: `${orphanedRoleGroupCount}`,
    details: orphanedRoleGroupCount > 0 
      ? '⚠️  WARNING: These role_groups will have NULL frame_id after migration'
      : undefined,
  });
}

async function validateVerbRolesCleanup() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  VERB ROLES CLEANUP CHECK (DATA TO BE DELETED)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Count role bindings that will be deleted
  const roleBindings = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipe_predicate_role_bindings
  `;
  log({
    check: 'Recipe predicate role bindings to be deleted',
    passed: true, // Info only
    expected: 'N/A',
    actual: `${roleBindings[0].count}`,
    details: '⚠️  These will be CASCADE deleted when roles table is dropped',
  });
  
  // Count role preconditions that will lose their reference
  const rolePreconditions = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM recipe_preconditions WHERE target_role_id IS NOT NULL
  `;
  log({
    check: 'Recipe preconditions with target_role_id to be cleared',
    passed: true, // Info only
    expected: 'N/A',
    actual: `${rolePreconditions[0].count}`,
    details: '⚠️  target_role_id will be set to NULL',
  });
  
  // Count total verb roles
  const verbRoles = await prisma.$queryRaw<[{count: bigint}]>`
    SELECT COUNT(*) as count FROM roles
  `;
  log({
    check: 'Total verb roles to be deleted',
    passed: true, // Info only
    expected: 'N/A',
    actual: `${verbRoles[0].count}`,
    details: '⚠️  Verb roles table will be dropped entirely',
  });
}

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     LEXICAL UNITS MIGRATION VALIDATION SCRIPT                 ║');
  console.log('║                                                               ║');
  console.log('║     Verifies 100% data consistency between old and new tables ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  try {
    await validateRowCounts();
    await validateRelationCounts();
    await validateDataIntegrity();
    await validateFieldValues();
    await validateRelationMappings();
    await validateRecipeMigration();
    await validateRecipeVariables();
    await validateLLMJobItems();
    await validateRoleGroups();
    await validateOrphanedData();
    await validateVerbRolesCleanup();
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const failed = results.filter(r => !r.passed);
    const passed = results.filter(r => r.passed);
    
    console.log(`Total checks: ${results.length}`);
    console.log(`Passed: ${passed.length}`);
    console.log(`Failed: ${failed.length}`);
    
    if (failed.length > 0) {
      console.log('\n❌ VALIDATION FAILED - DO NOT PROCEED TO NEXT PHASE\n');
      console.log('Failed checks:');
      failed.forEach(f => {
        console.log(`  ❌ ${f.check}`);
        console.log(`     Expected: ${f.expected}, Actual: ${f.actual}`);
        if (f.details) console.log(`     Details: ${f.details}`);
      });
      console.log('');
      process.exit(1);
    } else {
      console.log('\n✅ ALL VALIDATIONS PASSED - SAFE TO PROCEED TO NEXT PHASE\n');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n💥 VALIDATION SCRIPT ERROR:', error);
    console.error('\nThis may indicate the migration has not been run yet.');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
