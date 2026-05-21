/**
 * Attaches every remaining orphan Event/State concept as a direct child of
 * its subtype-level parent node.
 *
 * Rule:
 *   - orphan.subtype IS NOT NULL → parent = the level-1 node whose subtype
 *     matches (direct child of the archetype root with matching subtype).
 *   - orphan.subtype IS NULL     → parent = the archetype root itself.
 *
 * Each pair gets:
 *   1. A concept_relations row  (parent_id = subtype-node, child_id = orphan, type = parent_of)
 *   2. A changeset row          (entity_type = concept_relation, operation = create, status = committed)
 *      — written as already-committed so it appears in the audit trail without needing
 *        a separate approval step, matching how bulk-commit-reparents.ts works.
 *
 * Skips any orphan that already has a parent (race-safe).
 *
 * Usage:
 *   npx tsx scripts/attach-orphans-to-subtype-parents.ts
 *
 * Options (env vars):
 *   DRY_RUN=1        - print plan without writing
 *   COMMITTED_BY=..  - audit label (default "system:attach-orphans-to-subtype")
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { prisma } from '../src/lib/prisma';

const DRY_RUN = process.env.DRY_RUN === '1';
const COMMITTED_BY = process.env.COMMITTED_BY ?? 'system:attach-orphans-to-subtype';

async function main() {
  // ── 1. Build subtype → parent_id map for Event and State ──────────────────
  // Level-1 nodes = direct children of the archetype root.
  // Key: "Event:procedure", "State:quality", etc.
  // Fallback keys: "Event:null", "State:null" point to the root itself.

  const level1Rows = await prisma.$queryRaw<
    Array<{ archetype: string; child_subtype: string | null; child_id: bigint; root_id: bigint }>
  >`
    SELECT
      root.archetype::text   AS archetype,
      child.subtype::text    AS child_subtype,
      child.id               AS child_id,
      root.id                AS root_id
    FROM concepts root
    JOIN concept_relations cr  ON cr.parent_id = root.id AND cr.type = 'parent_of'
    JOIN concepts child        ON child.id = cr.child_id AND child.deleted = false
    WHERE root.archetype IN ('Event'::concept_archetype_enum, 'State'::concept_archetype_enum)
      AND root.label = root.archetype::text
      AND root.deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM concept_relations cr2
        WHERE cr2.child_id = root.id AND cr2.type = 'parent_of'
      )
  `;

  // subtype-keyed map: "Event:procedure" → concept_id of the subtype root
  const subtypeParent = new Map<string, bigint>();
  // archetype-keyed fallback for null-subtype orphans
  const archetypeRoot = new Map<string, bigint>();

  for (const row of level1Rows) {
    if (row.child_subtype !== null) {
      subtypeParent.set(`${row.archetype}:${row.child_subtype}`, row.child_id);
    }
    archetypeRoot.set(row.archetype, row.root_id);
  }

  // ── 2. Fetch all orphans ───────────────────────────────────────────────────
  const orphans = await prisma.$queryRaw<
    Array<{ id: bigint; archetype: string; subtype: string | null; label: string }>
  >`
    SELECT c.id, c.archetype::text AS archetype, c.subtype::text AS subtype, c.label
    FROM concepts c
    WHERE c.archetype IN ('Event'::concept_archetype_enum, 'State'::concept_archetype_enum)
      AND c.deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM concept_relations cr
        WHERE cr.child_id = c.id AND cr.type = 'parent_of'
      )
      -- exclude the archetype root nodes themselves
      AND NOT (
        c.label = c.archetype::text
        AND NOT EXISTS (SELECT 1 FROM concept_relations cr2 WHERE cr2.child_id = c.id AND cr2.type = 'parent_of')
      )
    ORDER BY c.archetype, c.subtype NULLS LAST, c.id
  `;

  // ── 3. Pair each orphan with its target parent ─────────────────────────────
  type Pair = { orphanId: bigint; parentId: bigint; orphanLabel: string; parentKey: string };
  const pairs: Pair[] = [];
  const unmatched: typeof orphans = [];

  for (const o of orphans) {
    let parentId: bigint | undefined;
    if (o.subtype !== null) {
      parentId = subtypeParent.get(`${o.archetype}:${o.subtype}`);
    }
    if (parentId === undefined) {
      parentId = archetypeRoot.get(o.archetype);
    }
    if (parentId === undefined) {
      unmatched.push(o);
      continue;
    }
    pairs.push({ orphanId: o.id, parentId, orphanLabel: o.label, parentKey: `${o.archetype}:${o.subtype ?? 'null'}` });
  }

  console.log(`Orphans found: ${orphans.length}`);
  console.log(`Pairs to attach: ${pairs.length}`);
  if (unmatched.length > 0) {
    console.warn(`UNMATCHED (no parent found): ${unmatched.length}`, unmatched.map(u => u.label));
  }

  if (DRY_RUN) {
    // Print a sample
    console.log('DRY_RUN=1 — sample of first 10 pairs:');
    for (const p of pairs.slice(0, 10)) {
      console.log(`  ${p.orphanLabel} (${p.orphanId}) → parent ${p.parentId}  [${p.parentKey}]`);
    }
    return;
  }

  if (pairs.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // ── 4. Commit in one transaction ───────────────────────────────────────────
  console.log(`Attaching ${pairs.length} orphans (COMMITTED_BY=${COMMITTED_BY})...`);
  const t0 = Date.now();
  let attached = 0;
  let skipped = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const pair of pairs) {
        // Race-safe: skip if parent already assigned since we loaded orphans
        const existing = await tx.concept_relations.findFirst({
          where: { child_id: pair.orphanId, type: 'parent_of' },
          select: { id: true },
        });
        if (existing) {
          skipped++;
          continue;
        }

        // Insert the parent_of edge
        const rel = await tx.concept_relations.create({
          data: {
            parent_id: pair.parentId,
            child_id: pair.orphanId,
            type: 'parent_of',
          },
        });

        // Write an already-committed changeset for the audit trail
        await tx.changesets.create({
          data: {
            entity_type: 'concept_relation',
            entity_id: rel.id,
            operation: 'create',
            status: 'committed',
            after_snapshot: {
              parent_id: pair.parentId.toString(),
              child_id: pair.orphanId.toString(),
              type: 'parent_of',
            },
            created_by: COMMITTED_BY,
            reviewed_by: COMMITTED_BY,
            reviewed_at: new Date(),
            committed_at: new Date(),
          },
        });

        attached++;
        if (attached % 500 === 0) {
          console.log(`  ... ${attached}/${pairs.length} attached`);
        }
      }
    },
    { timeout: 3_600_000, maxWait: 60_000 },
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s. Attached ${attached}, skipped (already parented) ${skipped}.`);
}

main()
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
