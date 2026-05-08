/**
 * Seed the frame hierarchy parent-child relation health check definition and
 * diagnosis-code taxonomy.
 *
 * Usage:
 *   npx tsx scripts/seed-parent-child-health-check.ts --dry-run
 *   npx tsx scripts/seed-parent-child-health-check.ts --apply
 */

import dotenv from 'dotenv';
import { PrismaClient, Prisma } from '@prisma/client';

dotenv.config({ path: '.env.local', override: true });

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const CHECK_CODE = 'FRAME_HIERARCHY_PARENT_CHILD_RELATIONS_V1';
const CHECK_LABEL = 'Frame Hierarchy Parent-Child Relations';
const CHECK_DESCRIPTION =
  'Audits frame parent-child hierarchy edges for invalid IS-A relations, wrong placement, type/category mistakes, domain/register mismatches, graph-structure problems, and data-quality blockers.';

type Severity = 'low' | 'medium' | 'high' | 'critical';

type Diagnosis = {
  label: string;
  description: string;
  examples: string[];
  severity: Severity;
  category: string;
  remediation: string;
};

const baseDiagnoses: Diagnosis[] = [
  {
    label: 'Direction reversal',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The recorded parent is narrower than the child, and the reverse direction is the valid IS-A relation.',
    examples: ['KILLING recorded under ASSASSINATION', 'MOTION recorded under BROWNIAN_MOTION'],
    remediation: 'Remove the edge and, if appropriate, create the reversed parent-child edge.',
  },
  {
    label: 'Child broader than parent',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The child has broader scope than the parent because the parent adds constraints, domain limits, mechanisms, or participant restrictions the child does not satisfy.',
    examples: ['TERMINATION recorded under QUENCH', 'QUALITY recorded under TENSILE_STRENGTH'],
    remediation: 'Remove the edge and place the child under a broader parent that actually subsumes it.',
  },
  {
    label: 'Grandparent is correct parent',
    category: 'wrong_level_or_placement',
    severity: 'medium',
    description:
      'The child fits the current parent’s parent but not the current parent; the child should be a sibling of the current parent.',
    examples: ['VAPORIZATION fits PHYSICAL_CHANGE but not HEATING'],
    remediation: 'Move the child edge up to the visible grandparent or another valid broader frame.',
  },
  {
    label: 'Sibling mislabelled as parent',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'Parent and child are peer concepts under a shared superordinate; neither frame subsumes the other.',
    examples: ['HOT recorded under COLD', 'TEACHER recorded under STUDENT', 'EMPLOYER recorded under EMPLOYEE'],
    remediation: 'Remove the edge and attach both frames to their shared superordinate if needed.',
  },
  {
    label: 'Merge candidate edge',
    category: 'invalid_is_a_edge',
    severity: 'medium',
    description:
      'Parent and child describe essentially the same concept at the same specificity, so a hierarchy edge is masking a duplicate/merge candidate.',
    examples: ['ASSEMBLE recorded under PUT_TOGETHER', 'CONSTRUCT recorded under BUILD', 'BEGIN recorded under START'],
    remediation: 'Remove the hierarchy edge and send the pair to the frame-merge/deduplication workflow.',
  },
  {
    label: 'Surface vocabulary trap',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The edge relies on shared words, lemmas, or near-synonyms, but the semantic relation is not IS-A once surface vocabulary is ignored.',
    examples: ['Physical RUNNING as parent of RUNNING_A_BUSINESS', 'Thin as DILUTE vs physically NARROW'],
    remediation: 'Remove the edge and judge placement from definitions/senses rather than lexical overlap.',
  },
  {
    label: 'Literal-metaphorical mismatch',
    category: 'domain_or_register_error',
    severity: 'high',
    description:
      'One frame is literal and the other is figurative or metaphorical; shared metaphorical language does not establish inheritance.',
    examples: ['PHYSICAL_CUTTING as parent of BUDGET_CUTTING', 'PHYSICAL_GRASPING as parent of UNDERSTANDING'],
    remediation: 'Remove the edge and place the metaphorical frame under an abstract/social/psychological parent.',
  },
  {
    label: 'Concrete-abstract mismatch',
    category: 'domain_or_register_error',
    severity: 'high',
    description:
      'A physical/concrete frame and an abstract conceptual frame are linked by analogy rather than true subsumption.',
    examples: ['PHYSICAL_WEIGHT as parent of MORAL_WEIGHT', 'SPATIAL_DEPTH as parent of DEEP_UNDERSTANDING'],
    remediation: 'Remove the edge and keep concrete and abstract branches separate unless true subtype evidence exists.',
  },
  {
    label: 'Different mechanism, same domain',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The frames share a topic, domain, or broad outcome, but the constitutive mechanism or resulting state differs.',
    examples: ['DILUTING as parent of COOLING', 'CLEANING as parent of COOKING', 'FRIENDSHIP as parent of KINSHIP'],
    remediation: 'Remove the edge and place the child under a parent that shares the same mechanism or a genuinely broader mechanism.',
  },
  {
    label: 'Property contradiction',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The child contradicts a defining qualifier of the parent, so every child instance cannot satisfy the parent definition.',
    examples: ['Parent requires a hard layer but child describes a soft film', 'Parent requires voluntary action but child is involuntary'],
    remediation: 'Remove the edge or rewrite corrupted definitions if the contradiction is a data error.',
  },
  {
    label: 'Role or participant mismatch',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'Core participant structures do not map; the child does not preserve the parent’s role structure as a specialization.',
    examples: ['COOKING under CLEANING', 'OWNERSHIP under SPATIAL_PROXIMITY'],
    remediation: 'Remove the edge and use role-compatible parents; do not treat unrelated participant structures as inheritance.',
  },
  {
    label: 'Wrong entity whose property',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The frames describe properties or states of different entity types or different participants in the scenario.',
    examples: ['CONTAINER_CAPACITY under CONTENT_VOLUME', 'HAZARD_DANGEROUSNESS under PERSON_VULNERABILITY'],
    remediation: 'Remove the edge and separate properties by the entity or participant they predicate of.',
  },
  {
    label: 'Perspective split',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The two frames describe the same situation from different participant viewpoints rather than a parent-child relation.',
    examples: ['AFRAID under FRIGHTENING', 'EMPLOYING under BEING_EMPLOYED_BY', 'PARENT_OF under CHILD_OF'],
    remediation: 'Remove the edge and attach the perspective frames as siblings under a neutral shared scenario where appropriate.',
  },
  {
    label: 'Polarity or converse error',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'Opposite scalar poles, contradictory values, or converse relations have been treated as parent-child.',
    examples: ['HOT under COLD', 'BRIGHTNESS under DARKNESS', 'OWNING under BEING_OWNED_BY'],
    remediation: 'Remove the edge and attach both poles/converses to the neutral dimension or relation when available.',
  },
  {
    label: 'Associative relation mistaken for IS-A',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'The relation is causal, sequential, part-whole, co-occurrence, or mere association rather than subtype inheritance.',
    examples: ['COOKING under EATING', 'TEMPERATURE under CLIMATE', 'FATIGUE under EXERTION'],
    remediation: 'Remove the edge; represent association with a different relation type only if the schema supports it.',
  },
  {
    label: 'Process-outcome confusion',
    category: 'invalid_is_a_edge',
    severity: 'high',
    description:
      'An event/process is linked to its resulting state, product, or outcome as though it were a subtype.',
    examples: ['COOKING under COOKED_STATE', 'BREAKING under BROKEN', 'MANUFACTURING under PRODUCT'],
    remediation: 'Remove the edge and keep processes separate from result states/products.',
  },
  {
    label: 'Cross-type edge',
    category: 'type_or_category_error',
    severity: 'critical',
    description:
      'An Event frame is linked to a non-Event frame, or vice versa, without a strong explicit case that IS-A still holds.',
    examples: ['ARGUING event under TENDENCY_TO_ARGUE state', 'COOKING event under COOKED state'],
    remediation: 'Remove cross-type edges by default; only keep with explicit evidence that the child truly specializes the parent.',
  },
  {
    label: 'Cross-category semantic mismatch',
    category: 'type_or_category_error',
    severity: 'high',
    description:
      'The frames share a broad type or domain but belong to different semantic categories such as event, ability, state, relation, disposition, or propensity.',
    examples: ['ABILITY_TO_RUN under RUNNING', 'PROPENSITY_FOR_CONFLICT under CONFLICT'],
    remediation: 'Move the child into the appropriate semantic-category subtree.',
  },
  {
    label: 'Habit or disposition vs state confusion',
    category: 'type_or_category_error',
    severity: 'high',
    description:
      'A recurring habit, trait, tendency, or disposition is treated as a current condition/property, or vice versa.',
    examples: ['CLEANLINESS_HABIT under BEING_CLEAN', 'PRONE_TO_OVERHEATING under HOT'],
    remediation: 'Separate habitual/dispositional branches from current-state/property branches.',
  },
  {
    label: 'Scalar hierarchy error',
    category: 'wrong_level_or_placement',
    severity: 'medium',
    description:
      'A scalar edge skips, reverses, or otherwise violates the expected hierarchy from extreme value to basic pole to neutral dimension.',
    examples: ['FREEZING directly under TEMPERATURE instead of COLD', 'HOT under COLD'],
    remediation: 'Reparent scalar values through the adjacent basic pole or neutral dimension as appropriate.',
  },
  {
    label: 'Domain contradiction',
    category: 'domain_or_register_error',
    severity: 'high',
    description:
      'Parent and child carry incompatible domain qualifiers, such as chemistry vs music, with no legitimate inheritance path.',
    examples: ['(in chemistry) PRECIPITATION under (in music) CADENCE', '(in law) CONTRACT_TERMINATION under (in physics) TERMINATION'],
    remediation: 'Remove the edge and place each frame within its compatible domain hierarchy.',
  },
  {
    label: 'Domain broadening after specialization',
    category: 'domain_or_register_error',
    severity: 'high',
    description:
      'A domain-specific parent has a general child whose meaning escapes the parent’s domain; domain specificity must stay the same or increase downward.',
    examples: ['GENERAL_MOTION under BROWNIAN_MOTION', 'GENERAL_ENDING under DISBAND'],
    remediation: 'Move the broader child above the domain-specific frame or to a domain-neutral parent.',
  },
  {
    label: 'Multi-sense mismatch',
    category: 'data_quality_error',
    severity: 'medium',
    description:
      'The child has multiple senses and the parent subsumes only some of them, indicating a possible latent frame split.',
    examples: ['Child has both physical and abstract senses, but parent only covers the physical sense'],
    remediation: 'Split or clean up the child frame before deciding parentage.',
  },
  {
    label: 'Vacuous parent definition',
    category: 'data_quality_error',
    severity: 'medium',
    description:
      'The parent definition is so thin or tautological that it conveys no useful IS-A constraint.',
    examples: ['Parent defined only as "a thing that happens"', 'Parent defined only as "an aspect of something"'],
    remediation: 'Improve or replace the parent definition before accepting hierarchy edges under it.',
  },
  {
    label: 'Corrupted or insufficient data',
    category: 'data_quality_error',
    severity: 'medium',
    description:
      'Missing, contradictory, empty, or unusable senses/definitions make the edge untrustworthy or impossible to judge confidently.',
    examples: ['No frame senses on parent or child', 'Definition contradicts lemmas', 'Parent and child definitions are both tautological'],
    remediation: 'Repair the underlying frame/sense data, then rerun the hierarchy audit.',
  },
  {
    label: 'Redundant parent edge',
    category: 'graph_structural_error',
    severity: 'low',
    description:
      'The child has an unnecessary parent edge, such as a direct ancestor edge already implied by a more specific valid parent; this is policy-dependent in DAG mode.',
    examples: ['JOGGING has parent RUNNING and also direct parent ACTIVITY'],
    remediation: 'If the current pass enforces minimal edges, remove the redundant ancestor edge; otherwise treat as advisory.',
  },
  {
    label: 'Cycle or self-ancestry',
    category: 'graph_structural_error',
    severity: 'critical',
    description:
      'The edge creates a cycle or makes a frame its own ancestor, which violates DAG hierarchy invariants.',
    examples: ['A -> B, B -> C, then C -> A', 'A direct self-edge A -> A'],
    remediation: 'Remove the cycle-forming edge immediately.',
  },
  {
    label: 'Orphan after removal',
    category: 'graph_structural_error',
    severity: 'low',
    description:
      'Removing an invalid edge would leave the child without any valid path to the hierarchy root; this is not a reason to keep the bad edge, but it needs follow-up placement.',
    examples: ['A child has only one parent edge, and that edge is invalid'],
    remediation: 'Remove the invalid edge and queue the frame for orphan placement under a valid parent.',
  },
  {
    label: 'Missing parent path',
    category: 'graph_structural_error',
    severity: 'medium',
    description:
      'A non-root frame has no valid parent path to the appropriate hierarchy root before any proposed edge removals.',
    examples: ['A frame has no parent_of incoming edge and is not an approved root', 'A frame has parents, but all parent paths are invalid or broken'],
    remediation: 'Queue the frame for orphan placement and attach it to the closest valid parent/root path.',
  },
  {
    label: 'Deleted or missing endpoint',
    category: 'db_integrity_error',
    severity: 'critical',
    description:
      'The hierarchy relation points to a parent or child frame that is missing, deleted, or otherwise unavailable for audit.',
    examples: ['A parent_of edge references a deleted parent frame', 'A parent_of edge references a child frame id that no longer exists'],
    remediation: 'Remove or repair the dangling relation and re-run hierarchy coverage checks.',
  },
  {
    label: 'Wrong relation type in hierarchy scope',
    category: 'db_integrity_error',
    severity: 'medium',
    description:
      'A relation that is not a parent_of edge is present in the hierarchy audit scope or being treated as inheritance.',
    examples: ['A related_to edge is included in the parent-child audit batch', 'A causal relation is stored where parent_of is expected'],
    remediation: 'Exclude non-parent_of relations from the hierarchy audit or migrate them to the correct relation type.',
  },
  {
    label: 'Root invariant violation',
    category: 'graph_structural_error',
    severity: 'critical',
    description:
      'A hierarchy root has a parent, or a non-root frame is incorrectly treated as a root.',
    examples: ['EVENT root has a parent_of parent', 'A domain bucket frame is treated as a top-level root despite needing an ancestor'],
    remediation: 'Restore root invariants by removing parent edges from true roots and attaching non-roots to valid ancestors.',
  },
  {
    label: 'Wrong top-level hierarchy',
    category: 'type_or_category_error',
    severity: 'critical',
    description:
      'A frame is connected into the wrong top-level DAG or root family, such as an Event frame under the SCRA hierarchy.',
    examples: ['Event frame path leads to a State root', 'Relation frame path leads to an Event root'],
    remediation: 'Move the frame into the top-level hierarchy that matches its frame type and semantic category.',
  },
  {
    label: 'Duplicate physical edge',
    category: 'db_integrity_error',
    severity: 'low',
    description:
      'The database contains duplicate physical rows for the same parent-child relation, if constraints or imports allow duplicates.',
    examples: ['Two identical parent_of rows with the same source_id and target_id', 'Duplicate edge rows differing only by metadata'],
    remediation: 'Deduplicate the relation rows and enforce or restore the uniqueness constraint for hierarchy edges.',
  },
];

const diagnosisEnrichment: Record<string, Pick<Diagnosis, 'description' | 'examples'>> = {
  'Direction reversal': {
    description:
      'The recorded parent is actually a narrower subtype of the child, so the edge points in the wrong direction. Use this only when the reverse edge would pass the IS-A test: every instance of the recorded parent is an instance of the recorded child, but not every instance of the recorded child is an instance of the recorded parent.',
    examples: [
      'KILLING recorded under ASSASSINATION: assassination is a specific kind of killing, so ASSASSINATION should inherit from KILLING, not the other way around.',
      'MOTION recorded under BROWNIAN_MOTION: Brownian motion is a specific physical kind of motion, while motion in general includes many non-Brownian cases.',
      'QUALITY recorded under TENSILE_STRENGTH: tensile strength is a specific material quality, not a parent of all qualities.',
    ],
  },
  'Child broader than parent': {
    description:
      'The child covers cases outside the parent because the parent adds domain, mechanism, participant, manner, or scope restrictions that the child does not have. Unlike a clean direction reversal, the reverse edge may not be the right fix; the important point is that the recorded parent cannot subsume the full child meaning.',
    examples: [
      'TERMINATION recorded under QUENCH: termination can end any process, while quenching is restricted to extinguishing, cooling, or satisfying specific processes.',
      'CONNECTION recorded under EMPLOYMENT: employment is one institutional connection; connection in general covers spatial, social, causal, and abstract links.',
      'SIZE recorded under WAIST_CIRCUMFERENCE: waist circumference is one body measurement, while size covers many dimensions and entities.',
    ],
  },
  'Grandparent is correct parent': {
    description:
      'The child fits the current parent\'s parent, but the current parent adds an extra constraint that the child does not satisfy. This is a wrong-depth placement: the child belongs alongside the current parent under the grandparent, not beneath the current parent.',
    examples: [
      'VAPORIZATION under HEATING when both sit under PHYSICAL_CHANGE: vaporization is a physical change, but it is not always heating because pressure changes can also cause it.',
      'ROAD_RAGE under ASSAULT_WITH_WEAPON when both sit under AGGRAVATED_ASSAULT: road rage may be aggravated assault, but it does not necessarily involve a weapon.',
      'COMPUTER_STORAGE under HARD_DRIVE when both sit under DATA_STORAGE: computer storage is a broad data-storage category, not a subtype of one specific storage device.',
    ],
  },
  'Sibling mislabelled as parent': {
    description:
      'The two frames are peers under a shared superordinate. They may contrast, complement, or occupy the same level of specificity, but neither one is more general than the other.',
    examples: [
      'HOT recorded under COLD: both are temperature poles under TEMPERATURE, and neither pole subsumes the other.',
      'TEACHER recorded under STUDENT: these are role/entity counterparts in an educational scenario, not a general-to-specific taxonomy.',
      'EMPLOYER recorded under EMPLOYEE: the two frames name opposite institutional roles; neither role is a subtype of the other.',
    ],
  },
  'Merge candidate edge': {
    description:
      'The parent and child appear to name the same frame-level concept at the same granularity. A hierarchy edge between paraphrases creates artificial structure where the correct repair is likely consolidation or deduplication.',
    examples: [
      'ASSEMBLE recorded under PUT_TOGETHER: both describe causing parts to form a whole at the same specificity, so a merge review is more appropriate.',
      'CONSTRUCT recorded under BUILD: if both frames mean creating a structure by assembling materials, neither is a parent of the other.',
      'BEGIN recorded under START: if their senses are simple paraphrases of initiating an event, the edge is masking a duplicate concept.',
    ],
  },
  'Surface vocabulary trap': {
    description:
      'The edge is supported mainly by shared words, lemmas, or etymological similarity rather than true semantic subsumption. The relationship should still be explainable after replacing the shared vocabulary with neutral paraphrases; if not, this diagnosis applies.',
    examples: [
      'RUNNING_A_BUSINESS under physical RUNNING: the shared word "run" hides that managing an organization is not locomotion.',
      'DILUTING under THIN_SHAPE: the word "thin" can mean low concentration or narrow physical shape, but those are different concepts.',
      'SHARP_WIT under SHARP_EDGE: shared "sharp" vocabulary does not make intelligence or wit a subtype of physical edge acuity.',
    ],
  },
  'Literal-metaphorical mismatch': {
    description:
      'One side is a literal physical frame and the other is a figurative extension. Metaphorical extensions should be placed under the abstract, social, or psychological concept they actually denote, not under the literal source domain.',
    examples: [
      'BUDGET_CUTTING under PHYSICAL_CUTTING: reducing a budget is not an instance of using a blade or severing material.',
      'UNDERSTANDING under PHYSICAL_GRASPING: grasping an idea is a metaphor for comprehension, not a hand-contact event.',
      'EMOTIONAL_WARMTH under PHYSICAL_WARMTH: friendliness or affection is not a thermal property of matter.',
    ],
  },
  'Concrete-abstract mismatch': {
    description:
      'A concrete entity/event/property is connected to an abstract concept through analogy or conceptual association rather than subtype inheritance. Concrete and abstract branches can sometimes share ancestors, but one should not inherit from the other unless every instance truly crosses that boundary.',
    examples: [
      'MORAL_WEIGHT under PHYSICAL_WEIGHT: seriousness or importance is not mass or gravitational load.',
      'DEEP_UNDERSTANDING under SPATIAL_DEPTH: cognitive depth is not a physical extent downward or inward.',
      'BRIDGE_LOAN under BRIDGE_STRUCTURE: a financial bridge loan is not a structure spanning a physical gap.',
    ],
  },
  'Different mechanism, same domain': {
    description:
      'The frames occur in the same broad domain or lead to a superficially similar outcome, but the defining mechanism differs. A valid child may specialize the parent mechanism; it may not use a parallel mechanism while merely sharing topic or result.',
    examples: [
      'COOLING under DILUTING: both can reduce intensity, but cooling changes temperature while diluting changes concentration by adding material.',
      'COOKING under CLEANING: both may be domestic activities, but preparing food and removing dirt have different mechanisms and goals.',
      'KINSHIP under FRIENDSHIP: both are social bonds, but kinship is genealogical/legal while friendship is voluntary/social affiliation.',
    ],
  },
  'Property contradiction': {
    description:
      'The child violates an explicit qualifier in the parent definition. If the parent requires a property such as hard, voluntary, spatial, intentional, or physical-contact-based, every child instance must preserve or strengthen that property rather than contradict it.',
    examples: [
      'CREAMING under ENCRUSTATION where ENCRUSTATION requires a hard crust: a soft or filmy layer does not satisfy the hard-layer qualifier.',
      'INVOLUNTARY_RESPONSE under VOLUNTARY_ACTION: an involuntary condition contradicts the parent requirement of deliberate action.',
      'REMOTE_INFLUENCE under PHYSICAL_CONTACT: an event that works without contact cannot inherit from a parent whose definition requires contact.',
    ],
  },
  'Role or participant mismatch': {
    description:
      'The child does not preserve the parent\'s core participant structure. Role names do not need to match exactly, but the functional participants and their relations must map; fundamentally different scenarios are not inheritance.',
    examples: [
      'COOKING under CLEANING: cook/ingredients/dish do not refine cleaner/surface/mess as the same participant structure.',
      'OWNERSHIP under SPATIAL_PROXIMITY: possessor/possessed object is a legal or possessive relation, not figure/ground spatial nearness.',
      'DIFFICULTY under STRUGGLING: difficulty predicates of a task or situation, while struggling predicates of an agent undergoing effort.',
    ],
  },
  'Wrong entity whose property': {
    description:
      'The edge treats properties or states of different entities as if they were refinements of one another. A child property must predicate of the same kind of bearer as the parent, or a genuine specialization of that bearer.',
    examples: [
      'CONTENT_VOLUME under CONTAINER_CAPACITY: volume measures contents or occupied space, while capacity is a property of the container.',
      'INSTRUMENT_SHARPNESS under AGENT_SKILL: sharpness belongs to a tool or edge, while skill belongs to an agent.',
      'PERSON_VULNERABILITY under HAZARD_DANGEROUSNESS: vulnerability is a property of the exposed person, while dangerousness is a property of the hazard.',
    ],
  },
  'Perspective split': {
    description:
      'The frames describe a counterpart viewpoint or profiled participant rather than a subtype relation. For Event frames, true perspectival alternations such as buy/sell or teach/learn should normally be represented as the same underlying event frame; this diagnosis is for cases where separate viewpoint/counterpart frames exist and have been linked parent-child.',
    examples: [
      'AFRAID under FRIGHTENING: the experiencer state and stimulus property are linked but predicate of different participants.',
      'EMPLOYING under BEING_EMPLOYED_BY: the same employment relation is profiled from employer and employee perspectives.',
      'PARENT_OF under CHILD_OF: the same kinship relation is viewed from opposite relata, so neither direction is a subtype of the other.',
    ],
  },
  'Polarity or converse error': {
    description:
      'Opposite poles, contradictory scalar values, or converse relation directions have been linked as parent and child. Such frames normally share a neutral parent or relation family but do not inherit from one another.',
    examples: [
      'HOT under COLD: opposite temperature poles are mutually contrasting values under TEMPERATURE.',
      'ABOVE under BELOW: each relation reverses figure and ground, so neither subsumes the other.',
      'PREDATOR under PREY: the roles are complementary within an ecological relation, not subtype levels.',
    ],
  },
  'Associative relation mistaken for IS-A': {
    description:
      'The edge represents cause, effect, temporal sequence, part-whole, co-occurrence, prerequisite, or loose association rather than "is a kind of". These links may be meaningful, but they are not parent_of inheritance.',
    examples: [
      'COOKING under EATING: cooking often precedes eating, but it is not a kind of eating.',
      'TEMPERATURE under CLIMATE: temperature is one component of climate, not a subtype of climate.',
      'FATIGUE under EXERTION: exertion can cause fatigue, but fatigue is not a kind of exertion.',
    ],
  },
  'Process-outcome confusion': {
    description:
      'An event/process is treated as a subtype of its result state, product, or outcome, or vice versa. The happening and the state/product that follows it belong in distinct parts of the ontology.',
    examples: [
      'COOKING under COOKED_STATE: cooking is the process; cooked is the resulting condition of food.',
      'BREAKING under BROKEN: breaking is the event that creates a broken state, not a subtype of that state.',
      'MANUFACTURING under PRODUCT: manufacturing is an event of making, while a product is the entity made.',
    ],
  },
  'Cross-type edge': {
    description:
      'The edge connects fundamentally different top-level frame types, especially Event versus non-Event (State, Category, Relation, Attribute/SCRA). Cross-type parent_of edges should default to invalid unless the audit can state a strong positive IS-A case.',
    examples: [
      'ARGUING event under TENDENCY_TO_ARGUE state: a disposition to argue is not the event of arguing.',
      'COOKING event under COOKED state: the process and result state belong to different frame types.',
      'OWNERSHIP relation under PURCHASING event: a possessive relation may result from purchase, but it is not an event subtype.',
    ],
  },
  'Cross-category semantic mismatch': {
    description:
      'The frames may share a broad type or domain, but they belong to different semantic categories such as ability, event, current state, disposition, relation, category, measure, or propensity. Adding a categorical layer does not create inheritance.',
    examples: [
      'ABILITY_TO_RUN under RUNNING: a capacity or potential is not the event itself.',
      'PROPENSITY_FOR_CONFLICT under CONFLICT: a tendency toward a relation is not the relation.',
      'EMPLOYMENT_STATUS under EMPLOYED_NOW: a status-domain heading is not a subtype of one current employment state.',
    ],
  },
  'Habit or disposition vs state confusion': {
    description:
      'A recurring pattern, habit, trait, tendency, or disposition is treated as if it were a current state/property, or the reverse. Habitual/dispositional concepts should form their own branches rather than inheriting from first-order conditions.',
    examples: [
      'CLEANLINESS_HABIT under BEING_CLEAN: habitually keeping things clean is not the same as currently being clean.',
      'PRONE_TO_OVERHEATING under HOT: a tendency to become hot is not a current high-temperature state.',
      'LOYALTY_AS_TRAIT under BEING_LOYAL_NOW: a stable disposition and a current relational stance have different temporal structure.',
    ],
  },
  'Scalar hierarchy error': {
    description:
      'A gradable hierarchy is malformed by skipping an obvious intermediate, reversing scalar direction, or linking opposite values. The intended pattern is usually extreme value -> basic pole -> neutral dimension, with moderate values going directly to the dimension only when no basic-pole intermediate exists.',
    examples: [
      'FREEZING directly under TEMPERATURE: the edge skips the nearer parent COLD, which is the basic pole that FREEZING intensifies.',
      'SCORCHING under TEMPERATURE: if HOT exists, SCORCHING should inherit through HOT rather than jumping to the neutral dimension.',
      'HOT under COLD: this reverses across opposite poles rather than moving upward to TEMPERATURE.',
    ],
  },
  'Domain contradiction': {
    description:
      'The child and parent are explicitly scoped to incompatible domains, and the child cannot plausibly specialize the parent within that domain. Domain qualifiers such as "in chemistry" or "in music" are semantic constraints, not examples.',
    examples: [
      '(in chemistry) PRECIPITATION under (in music) CADENCE: chemical formation of solids and musical phrase closure are unrelated domain senses.',
      '(in law) CONTRACT_TERMINATION under (in physics) TERMINATION: legal ending of an agreement is not a physics-domain process.',
      '(in computing) HASH_FUNCTION under (in cooking) MIXING: both may involve "combining" in loose language, but their domains and mechanisms are incompatible.',
    ],
  },
  'Domain broadening after specialization': {
    description:
      'A descendant of a domain-specific parent broadens back out beyond that parent\'s domain or scope. Once an edge specializes into a domain, all children must stay within that domain or specialize further.',
    examples: [
      'GENERAL_MOTION under BROWNIAN_MOTION: general motion includes walking, falling, and orbiting, not just microscopic random particle motion.',
      'GENERAL_ENDING under DISBAND: ending in general includes many processes beyond dissolving a group.',
      'GENERAL_PROPERTY under COMPUTATIONAL_COMPLEXITY: properties in general are broader than the computing-specific complexity dimension.',
    ],
  },
  'Multi-sense mismatch': {
    description:
      'The child frame bundles multiple senses, and the parent subsumes only a subset of them. The edge should not be accepted until every child sense is covered, or the child is split into cleaner frames.',
    examples: [
      'A child has physical CUTTING and budget-reduction CUTTING senses, but the parent only covers physical cutting.',
      'A child has noun sense "the tool" and verb sense "to use the tool", but the parent only covers the event sense.',
      'A child mixes literal hiding and information secrecy, while the parent only covers spatial concealment.',
    ],
  },
  'Vacuous parent definition': {
    description:
      'The parent definition is so generic, tautological, or empty that it fails to impose meaningful inheritance constraints. This is not merely a broad-but-valid parent; it is a parent whose definition does not say enough to audit subsumption.',
    examples: [
      'Parent defined as "a thing that happens": almost any event could fit, so the edge conveys no useful hierarchy information.',
      'Parent defined as "an aspect of something": the definition is too abstract to test whether the child is a subtype.',
      'Parent defined only as "a kind of entity": the definition lacks the domain or type constraints needed for a meaningful child relation.',
    ],
  },
  'Corrupted or insufficient data': {
    description:
      'The edge cannot be reliably audited because one or both endpoint records are missing, internally inconsistent, empty, or obviously corrupted. Use this for data repair needs, not for ordinary hard semantic disagreements.',
    examples: [
      'Parent or child has no frame senses and no usable definition, so there is no semantic content to compare.',
      'A frame definition says it is a physical object while all senses describe an abstract relation, creating contradictory evidence.',
      'The child lemmas and definitions point to unrelated meanings because a prior merge or import combined incompatible records.',
    ],
  },
  'Redundant parent edge': {
    description:
      'The edge is semantically valid but unnecessary under the active graph policy, usually because a more specific valid parent already gives the child a path to the same ancestor. This is advisory in DAG mode unless minimal direct edges or single-inheritance is required.',
    examples: [
      'JOGGING has parent RUNNING and also direct parent ACTIVITY: ACTIVITY is valid but redundant if RUNNING already inherits from ACTIVITY.',
      'ASSASSINATION has parent KILLING and also direct parent EVENT: EVENT is a true ancestor but not a useful direct parent in a minimal hierarchy.',
      'CRIMSON has parent RED and also direct parent COLOR: COLOR is implied through RED and may be removed if transitive reduction is desired.',
    ],
  },
  'Cycle or self-ancestry': {
    description:
      'The hierarchy contains a direct self-edge or a cycle, so a frame becomes its own ancestor. This violates DAG invariants regardless of whether individual edge labels look plausible in isolation.',
    examples: [
      'A direct self-edge A parent_of A: no frame can be a more general kind of itself as a child edge.',
      'A -> B, B -> C, and C -> A: following parent links loops back to the starting frame.',
      'TEMPERATURE -> PHYSICAL_PROPERTY and PHYSICAL_PROPERTY -> TEMPERATURE: each is made ancestor of the other, collapsing hierarchy direction.',
    ],
  },
  'Orphan after removal': {
    description:
      'The edge is invalid, but removing it would leave the child with no remaining valid path to the appropriate root. This diagnosis tracks the follow-up placement problem; it is not a reason to keep the invalid edge.',
    examples: [
      'A child has exactly one parent edge, and that edge is invalid due to role mismatch, so removal leaves no parent path.',
      'A child has several parents, but all are invalid or dangling, so removing bad edges leaves it orphaned.',
      'A frame was attached directly to a wrong bucket; after removing that edge, it needs a new nearest valid parent.',
    ],
  },
  'Missing parent path': {
    description:
      'A non-root frame already lacks any valid route to its expected root before considering new edge removals. This is a coverage failure in the hierarchy rather than an issue with one specific semantic comparison.',
    examples: [
      'A frame has no incoming parent_of edge and is not one of the approved top-level roots.',
      'A frame has parent links only to deleted frames, so graph traversal cannot reach a live root.',
      'A frame belongs in the Event DAG but every path from it terminates before reaching the Event root.',
    ],
  },
  'Deleted or missing endpoint': {
    description:
      'The relation row references a parent or child frame that is deleted, missing, or unavailable. Semantic auditing cannot proceed because the edge endpoint itself is not a valid live frame.',
    examples: [
      'A parent_of relation references a parent frame whose deleted flag is true.',
      'A relation row has a target_id that no longer exists in the frames table.',
      'A child frame exists but the parent id points to a failed or partially imported placeholder record.',
    ],
  },
  'Wrong relation type in hierarchy scope': {
    description:
      'A non-inheritance relation is being audited, displayed, or stored as though it were a parent-child hierarchy edge. The hierarchy audit should only judge parent_of / IS-A relations.',
    examples: [
      'A causal relation is included in a parent-child batch even though it means A causes B, not A is parent of B.',
      'A related_to edge appears in the hierarchy view and is treated as inheritance by traversal code.',
      'A part_of relation between WHEEL and CAR is stored in the same scope as parent_of edges.',
    ],
  },
  'Root invariant violation': {
    description:
      'A true hierarchy root has a parent, or a frame that requires an ancestor is being treated as a root. Root status is a graph invariant independent of normal edge-level semantic fit.',
    examples: [
      'The EVENT root has a parent_of parent, making it no longer the top of the Event DAG.',
      'The SCRA root inherits from a domain-specific state, reversing the intended top-level structure.',
      'A bucket frame such as COMMUNICATION_EVENT is treated as a root even though it should inherit from EVENT.',
    ],
  },
  'Wrong top-level hierarchy': {
    description:
      'A frame is connected into the wrong root family or top-level DAG. This catches path-level mistakes such as Event frames ending under a State/Relation/Category root, beyond a single local cross-type edge.',
    examples: [
      'An Event frame has a parent path that reaches a State root instead of the Event root.',
      'A Relation frame is placed under an Event root because one relation sense was confused with an event of establishing the relation.',
      'A Measure frame is attached under a physical-object Entity branch rather than the Measure hierarchy.',
    ],
  },
  'Duplicate physical edge': {
    description:
      'The same parent-child relation exists more than once as physical rows or otherwise duplicate records. This is a database integrity issue even when the semantic edge itself is valid.',
    examples: [
      'Two rows have the same source_id, target_id, and parent_of type after a repeated import.',
      'Duplicate parent_of rows differ only by timestamps or metadata, so traversal sees the same edge twice.',
      'A retry created a second identical edge because uniqueness enforcement was absent or bypassed.',
    ],
  },
};

const diagnoses: Diagnosis[] = baseDiagnoses.map((diagnosis) => ({
  ...diagnosis,
  ...diagnosisEnrichment[diagnosis.label],
}));

function diagnosisCode(index: number): string {
  return `I-${String(index + 1).padStart(3, '0')}`;
}

async function assertSchema() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string; udt_name: string }>>`
    SELECT table_name, column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('health_check_definitions', 'health_diagnosis_codes')
    ORDER BY table_name, ordinal_position
  `;

  const required: Record<string, string[]> = {
    health_check_definitions: ['id', 'code', 'label', 'description', 'target_types', 'rule_version', 'enabled', 'config'],
    health_diagnosis_codes: [
      'id',
      'check_definition_id',
      'code',
      'label',
      'description',
      'examples',
      'severity',
      'category',
      'enabled',
    ],
  };

  for (const [table, columns] of Object.entries(required)) {
    const present = new Set(rows.filter((row) => row.table_name === table).map((row) => row.column_name));
    const missing = columns.filter((column) => !present.has(column));
    if (missing.length > 0) {
      throw new Error(`Missing required columns on ${table}: ${missing.join(', ')}`);
    }
  }

  const entityTypes = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'entity_type'
  `;
  if (!entityTypes.some((row) => row.enumlabel === 'frame_relation')) {
    throw new Error('entity_type enum is missing frame_relation');
  }

  const priorities = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'issue_priority'
  `;
  const allowedPriorities = new Set(priorities.map((row) => row.enumlabel));
  for (const diagnosis of diagnoses) {
    if (!allowedPriorities.has(diagnosis.severity)) {
      throw new Error(`issue_priority enum is missing ${diagnosis.severity}`);
    }
    if (diagnosis.examples.length < 3) {
      throw new Error(`Diagnosis "${diagnosis.label}" must have at least three examples`);
    }
    if (diagnosis.description.length < 120) {
      throw new Error(`Diagnosis "${diagnosis.label}" needs a more comprehensive description`);
    }
  }
}

async function existingSummary() {
  const existingDefinition = await prisma.health_check_definitions.findUnique({
    where: { code: CHECK_CODE },
    select: { id: true, code: true, label: true },
  });
  const existingCodes = await prisma.health_diagnosis_codes.findMany({
    where: { code: { in: diagnoses.map((_, index) => diagnosisCode(index)) } },
    select: { code: true, label: true, check_definition_id: true },
    orderBy: { code: 'asc' },
  });
  return { existingDefinition, existingCodes };
}

async function applySeed() {
  await prisma.$transaction(async (tx) => {
    const definition = await tx.health_check_definitions.upsert({
      where: { code: CHECK_CODE },
      update: {
        label: CHECK_LABEL,
        description: CHECK_DESCRIPTION,
        target_types: ['frame_relation'],
        rule_version: 1,
        enabled: true,
        config: {
          relation_type: 'parent_of',
          taxonomy_scope: 'frame_hierarchy_parent_child_relations',
          taxonomy_version: 1,
          policy_notes: [
            'Semantic invalidity, graph structure, and data quality are separate diagnosis categories.',
            'Broad but semantically correct parents may be valid; closest-parent problems are placement advisories unless the current audit policy requires minimal direct edges.',
            'Multiple parents are policy-dependent and should not be treated as a hard error unless the active audit pass enforces single inheritance.',
          ],
        } satisfies Prisma.InputJsonValue,
      },
      create: {
        code: CHECK_CODE,
        label: CHECK_LABEL,
        description: CHECK_DESCRIPTION,
        target_types: ['frame_relation'],
        rule_version: 1,
        enabled: true,
        config: {
          relation_type: 'parent_of',
          taxonomy_scope: 'frame_hierarchy_parent_child_relations',
          taxonomy_version: 1,
          policy_notes: [
            'Semantic invalidity, graph structure, and data quality are separate diagnosis categories.',
            'Broad but semantically correct parents may be valid; closest-parent problems are placement advisories unless the current audit policy requires minimal direct edges.',
            'Multiple parents are policy-dependent and should not be treated as a hard error unless the active audit pass enforces single inheritance.',
          ],
        } satisfies Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    for (const [index, diagnosis] of diagnoses.entries()) {
      await tx.health_diagnosis_codes.upsert({
        where: { code: diagnosisCode(index) },
        update: {
          check_definition_id: definition.id,
          label: diagnosis.label,
          description: diagnosis.description,
          examples: diagnosis.examples,
          severity: diagnosis.severity,
          category: diagnosis.category,
          enabled: true,
        },
        create: {
          check_definition_id: definition.id,
          code: diagnosisCode(index),
          label: diagnosis.label,
          description: diagnosis.description,
          examples: diagnosis.examples,
          severity: diagnosis.severity,
          category: diagnosis.category,
          enabled: true,
        },
      });
    }
  });
}

async function main() {
  console.log(`${DRY_RUN ? 'Dry run' : 'Apply'}: ${CHECK_CODE}`);
  await assertSchema();
  console.log('Schema check passed.');

  const { existingDefinition, existingCodes } = await existingSummary();
  console.log(
    existingDefinition
      ? `Existing definition found: ${existingDefinition.code} (${existingDefinition.label})`
      : 'Definition does not exist yet.',
  );
  console.log(`Diagnosis codes in requested I-001..I-${String(diagnoses.length).padStart(3, '0')} range already present: ${existingCodes.length}`);
  for (const code of existingCodes) {
    console.log(`  - ${code.code}: ${code.label} (check_definition_id=${code.check_definition_id ?? 'null'})`);
  }

  console.log('\nPlanned definition:');
  console.log(`  code: ${CHECK_CODE}`);
  console.log(`  label: ${CHECK_LABEL}`);
  console.log('  target_types: frame_relation');

  console.log('\nPlanned diagnosis codes:');
  for (const [index, diagnosis] of diagnoses.entries()) {
    console.log(`  ${diagnosisCode(index)} [${diagnosis.category}/${diagnosis.severity}] ${diagnosis.label}`);
  }

  if (DRY_RUN) {
    console.log('\nDry run only. No rows were inserted or updated.');
    return;
  }

  await applySeed();
  console.log(`\nSeeded ${CHECK_CODE} with ${diagnoses.length} diagnosis codes.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
