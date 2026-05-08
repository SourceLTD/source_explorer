/**
 * Seed the Frame Sense Standalone Audit health-check definition and diagnosis codes.
 *
 * Usage:
 *   npx tsx scripts/seed-frame-sense-standalone-health-check.ts --dry-run
 *   npx tsx scripts/seed-frame-sense-standalone-health-check.ts --apply
 */

import { config as loadEnv } from 'dotenv';
import { Prisma, PrismaClient, type issue_priority } from '@prisma/client';

loadEnv({ path: '.env.local' });
loadEnv();

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const CHECK_DEFINITION = {
  code: 'FRAME_SENSE_STANDALONE_AUDIT',
  label: 'Frame Sense Standalone Audit',
  description:
    'Audits standalone frame-sense quality from sense definitions, POS, same-frame sense patterns, and cross-POS sense patterns. Excludes frame-level definition adequacy, role coverage, role mappings, unavailable external evidence, and hierarchy relations.',
  target_types: ['frame_sense'],
  rule_version: 1,
  enabled: true,
  config: {
    scope: 'standalone_frame_senses',
    diagnosis_code_prefix: 'S',
    excludes: [
      'frame_level_definition_adequacy',
      'semantic_role_coverage',
      'role_mappings',
      'parent_child_hierarchy_relations',
    ],
  },
} satisfies {
  code: string;
  label: string;
  description: string;
  target_types: string[];
  rule_version: number;
  enabled: boolean;
  config: Prisma.InputJsonValue;
};

type DiagnosisInput = {
  code: string;
  category: string;
  label: string;
  description: string;
  examples: string[];
  severity?: issue_priority;
};

const REMOVED_DIAGNOSIS_CODES = ['S-002', 'S-003', 'S-065'];

const DIAGNOSES: DiagnosisInput[] = [
  {
    code: 'S-001',
    category: 'Coverage',
    label: 'Missing POS Sense',
    description:
      "A frame\'s existing senses imply a normal grammatical counterpart in another part of speech, but that counterpart is missing. This applies when the same underlying concept is already represented in one POS and would ordinarily have a direct same-concept realization in another POS, such as an event verb and event noun, a property noun and adjective, or an adjective and manner adverb.",
    examples: [
      "Frame has verb sense \"To attack someone\", but lacks noun sense \"An act of attacking someone\".",
      "Frame has adjective sense \"Being quick\", but lacks adverb sense \"In a quick manner\".",
      "Frame has noun sense \"The quality of being beautiful\", but lacks adjective sense \"Being beautiful\".",
    ],
  },
  {
    code: 'S-004',
    category: 'Coverage',
    label: 'Unusable Sense Content',
    description:
      "A sense is blank, tautological, circular, or so vague that a reader cannot determine what concept it picks out. Flag when the definition does not constrain reference enough to distinguish this sense from any other sense in the frame.",
    examples: [
      "Definition is blank or whitespace only.",
      "Definition is \"A thing related to this frame\" and does not identify a concept.",
      "Definition is tautological, such as \"A situation that is a situation\".",
    ],
  },
  {
    code: 'S-005',
    category: 'Coherence',
    label: 'Wrong Frame Sense',
    description:
      "One sense in the frame denotes a concept that belongs to a different frame, while the remaining senses form a coherent standalone concept among themselves. Flag the outlier; do not flag when the whole frame is incoherent (that is a different problem).",
    examples: [
      "In an event frame about attacking with senses \"To attack someone\" and \"An act of attacking someone\", an adjective sense \"Prone to attack\" denotes a stable disposition and belongs in a disposition frame.",
      "In a property frame for being beautiful, a verb sense \"To make something beautiful\" denotes a causation event and belongs in a related causative frame.",
    ],
  },
  {
    code: 'S-006',
    category: 'Coherence',
    label: 'Invalid Cross-POS Derivation',
    description:
      "Senses across POS in the same frame are merely thematically related rather than grammatical realizations of one underlying concept. Flag when at least one cross-POS pair fails the same-concept test (\"A and B describe the very same situation/property/relation, viewed under different grammar\").",
    examples: [
      "Sense \"To attack someone\" paired with sense \"Someone who attacks\": event vs participant, not the same concept.",
      "Sense \"Relating to medicine\" paired with sense \"A practitioner of medicine\": pertinence vs role, not the same concept.",
    ],
  },
  {
    code: 'S-007',
    category: 'Coherence',
    label: 'Cause-Effect Cross-POS Mismatch',
    description:
      "Two senses across POS in the frame describe opposite ends of a cause-effect chain: one names causing a state and the other names the resulting state or property. The two should live in distinct (causative vs stative) frames linked by a relation, not in the same frame.",
    examples: [
      "Sense \"To make something hot\" with sense \"Being at high temperature\": cause vs result.",
      "Sense \"To make something beautiful\" with sense \"Being beautiful\": cause vs property.",
    ],
  },
  {
    code: 'S-008',
    category: 'Coherence',
    label: 'Agent or Patient Noun as Event Nominalization',
    description:
      "A noun sense in an event frame denotes a participant role (agent, patient, instrument, location) rather than the event itself. The noun should sit in a participant-role frame; the event frame should keep only true event nominals.",
    examples: [
      "Event frame for teaching has verb sense \"To teach a subject\" alongside noun sense \"Someone who teaches\": noun sense is the agent, not the event.",
      "Event frame for attacking has verb sense \"To attack someone\" alongside noun sense \"Someone who attacks\": noun sense is the agent.",
      "Event frame for cutting has verb sense \"To cut something\" alongside noun sense \"A tool used to cut\": noun sense is the instrument.",
    ],
  },
  {
    code: 'S-009',
    category: 'Coherence',
    label: 'Agent vs Patient Capability Mix',
    description:
      "Two senses describe opposite sides of a capability/susceptibility relation: one means causing a condition in others, the other means being susceptible to undergoing that condition. These belong in different frames (active disposition vs susceptibility) rather than co-existing as senses of one frame.",
    examples: [
      "Sense \"Causing mutation in others\" alongside adjective sense \"Liable to undergo mutation\".",
      "Sense \"Tending to corrode other things\" alongside adjective sense \"Liable to be corroded\".",
      "Sense \"A substance that causes irritation\" alongside adjective sense \"Prone to being irritated\".",
    ],
  },
  {
    code: 'S-010',
    category: 'Coherence',
    label: 'Capability Adjective as Action Sense',
    description:
      "A capability/dispositional adjective (\"-able\", \"-ible\", \"prone to\") sits next to an action verb as if naming the same situation. The capability sense names a stable property of the patient; the verb names the action itself, so they belong in different frames.",
    examples: [
      "Sense \"To repair something\" alongside adjective sense \"Capable of being repaired\".",
      "Sense \"To read text\" alongside adjective sense \"Capable of being read\".",
      "Sense \"To break something\" alongside adjective sense \"Liable to break\".",
    ],
  },
  {
    code: 'S-011',
    category: 'Coherence',
    label: 'Entity-Like Noun on Property/Relation Frame',
    description:
      "The frame\'s other senses describe an abstract property or relation, but a noun sense names a concrete object class or referent that merely involves that property. The noun belongs in an entity frame, with a relation back to the property/relation frame.",
    examples: [
      "Property frame for caliber has noun sense \"The internal diameter of a gun barrel\" alongside noun sense \"A cartridge of a particular size\": the second is an object class.",
      "Property frame for charge has noun sense \"An amount of electric charge\" alongside noun sense \"A device that holds an electric charge\".",
    ],
  },
  {
    code: 'S-012',
    category: 'Coherence',
    label: 'Converse Relation Collapse',
    description:
      "Two relational senses are converse roles of the same underlying relation (parent/child, above/below, lender/borrower) but are treated as a single sense rather than as separate converse-related frames or as distinct same-frame senses with explicit perspective.",
    examples: [
      "Two converse senses collapsed into \"A person in a familial relation\".",
      "Two converse senses collapsed into \"Vertically related to something\".",
      "Two converse senses collapsed into \"A party to a loan\".",
    ],
  },
  {
    code: 'S-013',
    category: 'Coherence',
    label: 'Inconsistent Parallel POS Decisions',
    description:
      "The same semantic distinction is honored as two separate senses in one POS of the frame but bundled into a single sense in another POS. Either both POS should split or both should merge.",
    examples: [
      "Frame splits speech adjectives \"Relating to spoken language\" and \"Relating to vocal sound\", but bundles the corresponding nouns into a single \"vocal phenomenon\" sense.",
      "Frame splits causation verbs \"To cause directly\" and \"To cause indirectly\", but the noun nominalizes both as one sense \"An act of causing something\".",
    ],
  },
  {
    code: 'S-014',
    category: 'Coherence',
    label: 'Referent Noun in Pertinence Frame',
    description:
      "In a pertinence frame (\"adj relating to X\"), a noun sense names the entity X itself rather than the property of relating to X. The referent noun belongs in an entity frame; pertinence frames take only the relating-to property.",
    examples: [
      "Pertinence frame for adjective sense \"Relating to the trustee-beneficiary relation\" includes noun sense \"A person who holds assets in trust\": the noun is the entity, not the relation.",
      "Pertinence frame for adjective sense \"Relating to an orbit\" includes noun sense \"The path of a body in space\": the noun is the referent.",
    ],
  },
  {
    code: 'S-015',
    category: 'Bundling',
    label: 'Disjunctive Multi-Concept Sense',
    description:
      "A single sense joins two or more genuinely distinct concepts with \"or\", \"and\", or semicolons, rather than naming one concept. Flag when at least one disjunct is a real meaning that warrants its own sense; do not flag when the disjuncts are mere paraphrases of one meaning.",
    examples: [
      "creation and destruction are two senses.",
      "opposite tonal categories should not share a sense.",
      "two distinct event roles in one definition.",
    ],
  },
  {
    code: 'S-016',
    category: 'Bundling',
    label: 'Cartesian Product Disjunction',
    description:
      "A definition combines two or more independent contrast dimensions, producing a sense that effectively covers a Cartesian product of cases. Splitting may need to follow each dimension to avoid losing distinctions.",
    examples: [
      "creation/destruction crossed with physical/mental yields four distinct cases.",
      "speed crossed with medium yields four cases.",
    ],
  },
  {
    code: 'S-017',
    category: 'Bundling',
    label: 'Abstract/Physical Mix',
    description:
      "A definition bundles a physical manifestation with an abstract concept of the same domain. The two should usually be separate senses (or separate frames) because their truth conditions and participants differ.",
    examples: [
      "Sense defined \"A physical gathering of people or an abstract concept of social interaction\".",
      "Sense defined \"A physical link between two objects or an abstract relationship between two ideas\".",
    ],
  },
  {
    code: 'S-018',
    category: 'Bundling',
    label: 'Concrete/Abstract Entity Mix',
    description:
      "A noun sense treats a physical entity and an abstract organizing construct as one entity. Concrete and abstract entities support different predicates and should be separate senses.",
    examples: [
      "Sense defined \"A physical container or a conceptual framework\".",
      "Sense defined \"A physical bridge or an abstract link between two domains\".",
    ],
  },
  {
    code: 'S-019',
    category: 'Bundling',
    label: 'Literal/Metaphorical Mix',
    description:
      "A sense bundles a literal use with one or more figurative extensions of the one sense. Literal and metaphorical readings have different truth conditions and should be split.",
    examples: [
      "Sense defined \"To construct a structure or to construct an argument\".",
      "Sense defined \"To strike with a hammer or to attack decisively in argument\".",
      "Sense defined \"Of liquid, to move smoothly, or of conversation, to proceed easily\".",
    ],
  },
  {
    code: 'S-020',
    category: 'Bundling',
    label: 'Instrument-Specific vs Manner-General Collapse',
    description:
      "An instrument-requiring sense (using a specific tool) is merged with a broader manner sense that does not require the tool. The tool-bound and tool-free meanings should be separate.",
    examples: [
      "Sense defined \"To strike with a poleaxe, or to fell with stunning force\".",
      "Sense defined \"To cut with a saw, or to cut something in general\".",
      "Sense defined \"To strike with a hammer, or to strike forcefully\".",
    ],
  },
  {
    code: 'S-021',
    category: 'Bundling',
    label: 'Spatial/Temporal Mix',
    description:
      "A sense treats a spatial dimension and a temporal dimension as one. Spatial and temporal extents take different participants and predicates and should be separate senses.",
    examples: [
      "Sense defined \"Distance in space or time\".",
      "Sense defined \"Spatial extent of an object or duration of an event\".",
      "Sense defined \"An empty space or an interval of time\".",
    ],
  },
  {
    code: 'S-022',
    category: 'Bundling',
    label: 'Physical/Mental or Emotional Mix',
    description:
      "A sense bundles physical realizations with mental or emotional realizations of what would otherwise be the one sense. Body-domain and mind-domain interpretations have different truth conditions and should be separate.",
    examples: [
      "Sense defined \"Lacking physical energy or mental focus\".",
      "Sense defined \"Of large physical weight or of large emotional burden\".",
      "Sense defined \"Having a fine cutting edge or having keen mental insight\".",
    ],
  },
  {
    code: 'S-023',
    category: 'Bundling',
    label: 'Cognitive/Communicative Mix',
    description:
      "A sense bundles internal mental judgment or belief with outward speech or declaration of that judgment. Thinking and saying are different events with different participants and should be separate senses.",
    examples: [
      "Sense defined \"To consider or declare worthless\".",
      "Sense defined \"To think or say that something is true\".",
      "Sense defined \"To assess in one\'s mind or to publicly rank\".",
    ],
  },
  {
    code: 'S-024',
    category: 'Bundling',
    label: 'Creation/Joining/Modification Mix',
    description:
      "A sense collapses creation, joining, repair, decoration, or modification predicates that are independently distinct event types. These predicates apply to different patient states and should typically be separate senses.",
    examples: [
      "Sense defined \"To make or decorate garments\".",
      "Sense defined \"To make or sew together cloth\".",
      "Sense defined \"To create, repair, or refine an object\".",
    ],
  },
  {
    code: 'S-025',
    category: 'Bundling',
    label: 'Activity/Inactivity Mix',
    description:
      "A sense bundles \"doing X\" with \"failing to do X\" or \"being idle\". Activity and inactivity are mutually exclusive event types and should not share a sense.",
    examples: [
      "Sense defined \"Monotonous activity or idleness\".",
      "Sense defined \"To engage in light activity or to do nothing\".",
    ],
  },
  {
    code: 'S-026',
    category: 'Bundling',
    label: 'Manner vs Activity-Type Mix',
    description:
      "A sense collapses how an action is performed (manner) with what type of action is performed (activity type). These are different semantic dimensions and should be separate.",
    examples: [
      "manner vs activity type.",
      "Sense defined \"To move in a meandering manner or to engage in aimless activity\".",
    ],
  },
  {
    code: 'S-027',
    category: 'Bundling',
    label: 'Attempt vs Achievement',
    description:
      "A sense merges a mere attempt, failure, or effort with the successful accomplishment. Trying and succeeding have different result states and should be separate. Do not flag when an event frame legitimately treats process and result as views of the same event.",
    examples: [
      "Sense defined \"To try to solve or to solve a problem\".",
      "Sense defined \"To attempt to obtain or to obtain something\".",
      "Sense defined \"To try to persuade or to actually persuade someone\".",
    ],
  },
  {
    code: 'S-028',
    category: 'Bundling',
    label: 'Dynamic Change vs Static Property',
    description:
      "A sense bundles a change-of-state process with the resulting or static property/measurement that arises from it. Change events and resulting states have different aspect and participants and should be separate senses or separate frames.",
    examples: [
      "Sense defined \"To change the size of something or the size something has\".",
      "Sense defined \"To make hot or to be hot\".",
      "Sense defined \"To become deeper or to be deep\".",
    ],
  },
  {
    code: 'S-029',
    category: 'Bundling',
    label: 'Cause/Effect or Mechanism/Symptom Mix',
    description:
      "A sense treats an upstream cause/mechanism as if it were the downstream effect/symptom. Cause and effect have different participants and should be separate senses.",
    examples: [
      "mechanism vs symptom.",
      "Sense defined \"To set fire to or to scorch\".",
      "Sense defined \"To transmit a pathogen or to suffer the resulting illness\".",
    ],
  },
  {
    code: 'S-030',
    category: 'Bundling',
    label: 'Part-Whole or Material-System Mix',
    description:
      "A sense merges a component or material with the organized whole or system that contains it. Parts and wholes are different referents with different predicates and should be separate.",
    examples: [
      "Sense defined \"Neural tissue or the nervous system\".",
      "Sense defined \"The material wood or a tree\".",
      "Sense defined \"A single nerve cell or the brain\".",
    ],
  },
  {
    code: 'S-031',
    category: 'Bundling',
    label: 'Categorical vs Relational Mix',
    description:
      "A sense merges \"being X\" (categorical) with \"relating to X\" (relational/pertinence). Being and relating-to take different subject types and should be separate senses, often in separate frames.",
    examples: [
      "Sense defined \"Being a bilabial sound or pertaining to bilabial sounds\".",
      "Sense defined \"Being lawful or relating to law\".",
      "Sense defined \"Being music or relating to music\".",
    ],
  },
  {
    code: 'S-032',
    category: 'Bundling',
    label: 'Purpose/Function vs Relational Mix',
    description:
      "A sense merges \"designed for X\" or \"used for X\" with \"relating to X\". Purpose/function predicates and pure pertinence have different truth conditions and should be separate senses.",
    examples: [
      "instrument purpose vs topic relation.",
      "Sense defined \"Used in dentistry or relating to dentistry\".",
      "Sense defined \"Used for medical treatment or relating to medicine\".",
    ],
  },
  {
    code: 'S-033',
    category: 'Bundling',
    label: 'Relation Predicate Bundle',
    description:
      "A sense lists multiple distinct relation predicates joined by commas or \"or\" when one specific predicate should be selected. The reader cannot tell which relation actually holds.",
    examples: [
      "Sense defined \"Containing, composed of, or relating to a colloid\".",
      "Sense defined \"Made of, containing, or pertaining to metal\".",
    ],
  },
  {
    code: 'S-034',
    category: 'Bundling',
    label: 'Membership/Part/Belonging Mix',
    description:
      "A sense treats membership-of, part-of, and belonging-to as interchangeable predicates. These have different formal structure (set vs partonomic vs ownership) and should be separate senses.",
    examples: [
      "Sense defined \"Part of or member of a group\".",
      "Sense defined \"A part of, member of, or property belonging to a system\".",
    ],
  },
  {
    code: 'S-035',
    category: 'Bundling',
    label: 'Origin/Derivation/Source Mix',
    description:
      "A sense bundles derived-from, originating-in, and based-on relations as a single source predicate. Derivation, geographic origin, and basis-of are distinct and should be separate.",
    examples: [
      "Sense defined \"Derived from or originating in a region\".",
      "Sense defined \"Originating in, headquartered in, or modelled on a place\".",
    ],
  },
  {
    code: 'S-036',
    category: 'Bundling',
    label: 'Characteristic/Typical/Indicative Mix',
    description:
      "A sense lists multiple attribution predicates (characteristic of, typical of, indicative of) as if they were one. These quantify differently over instances and should be separate senses.",
    examples: [
      "Sense defined \"Characteristic of or typical of a disease\".",
      "Sense defined \"Typical of, exemplary of, or definitive of a category\".",
    ],
  },
  {
    code: 'S-037',
    category: 'Bundling',
    label: 'State vs Disposition Mix',
    description:
      "A sense bundles a stable disposition or tendency with a temporary occurrent state. Dispositions and occurrent states have different temporal profiles and should be separate.",
    examples: [
      "Sense defined \"Naturally curious or temporarily interested\".",
      "Sense defined \"Of an irritable temperament or currently feeling anger\".",
      "Sense defined \"Habitually generous or being generous on this occasion\".",
    ],
  },
  {
    code: 'S-038',
    category: 'Bundling',
    label: 'Intrinsic vs Comparative Property Mix',
    description:
      "A sense bundles an absolute, intrinsic property with a comparison-class-relative property of the same name. Absolute and comparative readings have different truth conditions and should be separate.",
    examples: [
      "Sense defined \"Large in absolute size or large compared to others of its kind\".",
      "Sense defined \"Moving at high absolute speed or fast for its category\".",
      "Sense defined \"Possessing great absolute wealth or wealthy relative to a reference group\".",
    ],
  },
  {
    code: 'S-039',
    category: 'Bundling',
    label: 'Personal vs Public/Collective Scope Mix',
    description:
      "A sense merges an individual experiential state with a public or collective status. Individual and collective scopes have different truth conditions and should be separate senses.",
    examples: [
      "Sense defined \"Personally unaccustomed to something or publicly unknown\".",
      "Sense defined \"Personally well-liked or held in widespread public favor\".",
    ],
  },
  {
    code: 'S-040',
    category: 'Bundling',
    label: 'Instantiated State vs Domain Supercategory',
    description:
      "A sense merges a specific first-order state with the broad status or category label that subsumes it. The instance and the supercategory are different abstraction levels and should be separate senses.",
    examples: [
      "Sense defined \"Currently on the job or pertaining to employment status\".",
      "Sense noun sense defined \"A specific high tidal state or pertaining to tidal phenomena in general\".",
      "Sense defined \"Currently in a wakeful state or pertaining to states of wakefulness\".",
    ],
  },
  {
    code: 'S-041',
    category: 'Bundling',
    label: 'Domain or Cultural Scope Mix',
    description:
      "A sense merges distinct technical, cultural, historical, or domain referents under one label. The referents have different extensions and should be separate senses.",
    examples: [
      "Sense defined \"Pertaining to Latin America or pertaining to classical Latin language\".",
      "Sense defined \"Universally inclusive or relating specifically to the Roman Catholic Church\".",
      "Sense defined \"Relating to ancient Greece or relating to modern Greece\".",
    ],
  },
  {
    code: 'S-042',
    category: 'Bundling',
    label: 'Classical Polysemy Collapse',
    description:
      "Two or more conceptually unrelated meanings are treated as one sense. Homonymy should be split into independent senses (and usually independent frames).",
    examples: [
      "Sense defined \"A flying mammal or a wooden implement\".",
      "Sense defined \"A financial institution or the side of a river\".",
      "Sense defined \"The outer covering of a tree or the sound a dog makes\".",
    ],
  },
  {
    code: 'S-043',
    category: 'Bundling',
    label: 'Neutral vs Pejorative/Evaluative Mix',
    description:
      "A sense bundles neutral description with accusatory, pejorative, or evaluative truth conditions of the one sense. Neutral and evaluative readings have different speaker stance and should be separate senses.",
    examples: [
      "Sense defined \"To make information known or to expose someone\'s wrongdoing\".",
      "Sense defined \"To convey information or to denounce a wrongdoer\".",
      "Sense defined \"To attach a name to or to derogatorily categorize someone\".",
    ],
  },
  {
    code: 'S-044',
    category: 'Bundling',
    label: 'General vs Specific Scope Mix',
    description:
      "A broad category sense is merged with one of its stricter subtypes or techniques. Hypernym and hyponym should be separate senses or, more often, the hyponym should live in a child frame.",
    examples: [
      "Sense defined \"To prepare food by heat or specifically to saute\".",
      "Sense defined \"A non-plant living organism or specifically a dog\".",
      "Sense defined \"A chemical reaction or specifically an oxidation reaction\".",
    ],
  },
  {
    code: 'S-045',
    category: 'Bundling',
    label: 'Type-Distinguishing Entity Collapse',
    description:
      "Distinct entity kinds are merged into one sense merely because they share a domain or hypernym. Different species, instruments, or pathogens have distinct properties and should be separate senses.",
    examples: [
      "Sense defined \"An oak or a maple\".",
      "Sense noun sense defined \"A violin or a viola\".",
      "Sense defined \"A bacterium or a virus\".",
    ],
  },
  {
    code: 'S-046',
    category: 'Bundling',
    label: 'Parenthetical/Domain Restriction Ignored',
    description:
      "A definition contains a bracketed or appended domain/type restriction that materially changes meaning, but the sense is treated as if the restriction were absent. The restricted reading should be a separate sense.",
    examples: [
      "legal sense distinct from everyday sense.",
      "musical sense distinct from everyday sense.",
      "zoological sense distinct from geometric sense.",
    ],
  },
  {
    code: 'S-047',
    category: 'Bundling',
    label: 'Scalar Degree/Threshold Collapse',
    description:
      "Different points or thresholds along a scalar dimension are merged into one sense. Scale points have different truth conditions (warmth is not heat) and should be distinct senses where explicitly distinguished by the sense definitions.",
    examples: [
      "Sense defined \"Warm, hot, or scorching\".",
      "Sense defined \"Damp, wet, or soaked\".",
      "Sense defined \"Audible, loud, or deafening\".",
    ],
  },
  {
    code: 'S-048',
    category: 'Bundling',
    label: 'Polarity/Antonym Collapse',
    description:
      "Opposite poles of a scalar or binary dimension are merged into one sense. Antonyms have opposite truth conditions and must be separate senses (and usually separate frames or paired converse senses).",
    examples: [
      "Sense defined \"Hot or cold\".",
      "Sense defined \"To expand or to contract\".",
      "Sense defined \"Tall or short\".",
    ],
  },
  {
    code: 'S-049',
    category: 'Bundling',
    label: 'Directional Opposite Collapse',
    description:
      "Mutually exclusive directions are merged into one sense as if they were perspectives on the same direction. Direction predicates point opposite ways and should be separate senses.",
    examples: [
      "Sense defined \"Inward or outward\".",
      "Sense defined \"Toward or away from a point\".",
      "Sense defined \"Above or below\".",
    ],
  },
  {
    code: 'S-050',
    category: 'Bundling',
    label: 'Directional POS Bias',
    description:
      "A neutral dimensional frame contains adjective or adverb senses that express only one pole of the dimension. The biased adj/adv senses should sit in a child pole frame, leaving the parent frame neutral.",
    examples: [
      "Frame for noun sense \"The thermal energy of something\" includes adjective sense \"Being at high temperature\" and adverb sense: only the hot pole is realized.",
      "Frame for noun sense \"The rate of motion of something\" includes adverb sense \"At high speed\": only the fast pole is realized.",
      "Frame for noun sense \"The loudness of a sound\" includes adjective sense \"Being at high loudness\": only the loud pole is realized.",
    ],
  },
  {
    code: 'S-051',
    category: 'Bundling',
    label: 'Biased Property Noun Split from Neutral Dimension',
    description:
      "A property noun that expresss one pole of a scale is treated as a separate sense within the neutral dimension frame, when it should live in a pole frame distinct from the neutral dimension.",
    examples: [
      "Frame for temperature has noun sense \"The state of being hot\" as a sense: hotness names only the hot pole.",
      "Frame for weight has noun sense \"The state of being heavy\" as a sense: heaviness names only the heavy pole.",
      "Frame for volume has noun sense \"The state of being loud\" as a sense: loudness names only the loud pole.",
    ],
  },
  {
    code: 'S-052',
    category: 'Redundancy',
    label: 'Duplicate Paraphrase Senses',
    description:
      "Two senses describe the same situation with only wording differences. Their truth conditions are identical, so one should be removed (or they should be merged into a single canonical wording).",
    examples: [
      "Two senses have both \"To become liquid when heated\" and \"To turn liquid through heat\".",
      "Two senses have both \"To completely ruin something\" and \"To utterly destroy something\".",
      "Two senses have both \"Free from agitation\" and \"Not agitated\".",
    ],
  },
  {
    code: 'S-053',
    category: 'Redundancy',
    label: 'Synonymous Elaboration Split',
    description:
      "A sense definition lists near-synonyms or tautological terms as if they were distinct, or two senses each pick up one of those near-synonyms. The synonyms collapse to one meaning.",
    examples: [
      "three near-synonyms in one definition.",
      "near-synonymous results.",
      "stylistic variants of one sense.",
    ],
  },
  {
    code: 'S-054',
    category: 'Redundancy',
    label: 'Complementary Attribute Split',
    description:
      "Co-defining attributes that together characterize a single quality are split as separate senses. The attributes are not independent meanings but parts of one definition and should be merged.",
    examples: [
      "both characterize the same quality.",
      "both characterize one robotic style.",
    ],
  },
  {
    code: 'S-055',
    category: 'Redundancy',
    label: 'Exhaustive Coverage Split',
    description:
      "Two or more senses partition one underlying concept into mutually exclusive alternatives that jointly exhaust it. The split is unmotivated when the concept itself is what is named.",
    examples: [
      "together they exhaust light, with no semantic remainder.",
      "Frame split into \"Vocal music\" and \"Instrumental music\".",
    ],
  },
  {
    code: 'S-056',
    category: 'Redundancy',
    label: 'With-Or-Without Modifier Split',
    description:
      "An optional modifier (consent, intent, awareness) is treated as a sense distinction. The modifier varies along an orthogonal dimension and should be a participant or annotation, not a sense split.",
    examples: [
      "consent is a participant property.",
      "intent is a participant property.",
    ],
  },
  {
    code: 'S-057',
    category: 'Redundancy',
    label: 'Someone-Or-Something Split',
    description:
      "A sense distinction is created solely because a participant can be a person or a non-person. Entity-type generality is not a sense distinction and should be modeled by participant typing.",
    examples: [
      "participant generality only.",
      "participant generality only.",
    ],
  },
  {
    code: 'S-058',
    category: 'Redundancy',
    label: 'False Pertinence Specificity',
    description:
      "A pertinence adjective frame is split into separate senses based on different dictionary phrasings of the same relating-to relation. The phrasings (\"of\", \"relating to\", \"characteristic of\", \"situated in\") are stylistic variants of the same pertinence.",
    examples: [
      "one pertinence relation.",
      "stylistic variants.",
    ],
  },
  {
    code: 'S-059',
    category: 'Redundancy',
    label: 'Unnecessary Causative/Inchoative Split',
    description:
      "The same event is split into two senses solely by whether a causer is expressed. Causative/inchoative alternation is a syntactic alternation, not a sense distinction, when the underlying event is the same.",
    examples: [
      "Frame split into \"To open\" and \"To cause to open\".",
      "Frame split into \"To melt\" (intransitive) and \"To melt something\" (transitive).",
      "Frame split into \"To break\" and \"To cause to break\".",
    ],
  },
  {
    code: 'S-060',
    category: 'Redundancy',
    label: 'Unnecessary Event Perspective Split',
    description:
      "A single underlying event is split into two senses solely by which reciprocal participant is taken as the subject. The event is the same; perspective is a participant alternation.",
    examples: [
      "Frame split into \"To buy\" and \"To sell\".",
      "Frame split into \"To lend\" and \"To borrow\".",
      "Frame split into \"To confer a degree\" and \"To receive a degree\".",
    ],
  },
  {
    code: 'S-061',
    category: 'Redundancy',
    label: 'Unnecessary Relation Realization Split',
    description:
      "One relation is split into two senses because one wording is stative (\"located near\") and the other is event-shaped (\"occurring near\"). Both express the same locative or temporal relation under different aspect.",
    examples: [
      "Frame split into \"Located near X\" and \"Occurring near X\".",
      "Frame split into \"Located around X\" and \"Happening around X\".",
    ],
  },
  {
    code: 'S-062',
    category: 'Redundancy',
    label: 'Minor Filler Variation Split',
    description:
      "Two senses differ only in the type of a non-defining filler. The underlying situation and event role are the same, so the filler variation does not warrant a sense split.",
    examples: [
      "Frame split into \"Defeat a person\" and \"Defeat a proposal\".",
      "Frame split into \"Move someone\" and \"Move something\".",
      "Frame split into \"Assess a person\" and \"Assess a project\".",
    ],
  },
  {
    code: 'S-063',
    category: 'Redundancy',
    label: 'Technical Non-Semantic Split',
    description:
      "A specialist or technical distinction is encoded as a sense split even though the frame-sense definitions do not mark that distinction. The distinction belongs in role typing or annotation, not in the sense inventory.",
    examples: [
      "Physics role distinction not explicitly distinguished by the sense definitions.",
      "Measurement-point distinction not explicitly distinguished by the sense definitions.",
    ],
  },
  {
    code: 'S-064',
    category: 'Redundancy',
    label: 'Invalid Same-POS Multiplicity',
    description:
      "A frame contains multiple same-POS senses without a true synonymy relation or an allowed alternation. Repeated same-POS senses with overlapping reference signal a missing merge.",
    examples: [
      "Frame has two noun senses: noun \"An attack\" and noun \"A specific kind of attack\" without distinct semantic content.",
      "Frame has three adjective senses that all describe relating to gardening with no real difference.",
    ],
  },
  {
    code: 'S-066',
    category: 'Register',
    label: 'Eventive Sense on Non-Eventive Frame',
    description:
      "A sense describes an act or process while the host frame\'s other senses describe a state, category, relation, or entity. The eventive sense belongs in a related event frame, not in this one.",
    examples: [
      "State frame for \"Being colored\" has verb sense \"To colorize an image\": eventive sense on a stative frame.",
      "Relation frame for \"Being above\" has verb sense \"To move through the air above\": eventive sense on a relation frame.",
      "Entity frame for \"A vehicle\" has verb sense \"To operate a vehicle\": eventive sense on an entity frame.",
    ],
  },
  {
    code: 'S-067',
    category: 'Register',
    label: 'Non-Eventive Sense on Event Frame',
    description:
      "A sense describes a state, property, category, relation, or pure result while the host frame is an event frame. The non-eventive sense belongs in a related state/property frame.",
    examples: [
      "Event frame for absorbing has adjective sense \"The state of having been absorbed\": resulting state, not the event.",
      "Event frame for breaking has adjective sense \"Being in a broken state\": resulting property, not the event.",
    ],
  },
  {
    code: 'S-068',
    category: 'Register',
    label: 'Wrong-Register Wording Only',
    description:
      "The sense correctly belongs on the frame, but the definition wording uses the wrong eventive vs non-eventive template. The fix is wording (rewrite as event or as state), not relocation.",
    examples: [
      "Event noun noun sense defined \"The state caused by absorbing\" should be \"The process of absorbing something\".",
      "Event verb verb sense defined \"Being in a collapsed condition\" should be \"To undergo collapse\".",
    ],
  },
  {
    code: 'S-069',
    category: 'Register',
    label: 'Whole-Frame Type Mismatch Visible from Senses',
    description:
      "Every sense in the frame points to the opposite eventive vs non-eventive register from the declared frame type. The frame type itself is wrong and should be retyped, not the individual senses.",
    examples: [
      "Frame typed as a Relation, but every sense reads as an act or process (verb sense, verb sense, verb sense).",
      "Frame typed as an Event, but every sense reads as a stable property (adjective sense, adjective sense, adjective sense).",
    ],
  },
  {
    code: 'S-070',
    category: 'Register',
    label: 'Role/Function/Capacity Misread as Eventive',
    description:
      "A definition uses \"to act as\", \"to serve as\", or \"to function as\" and is treated as an action verb, but the meaning is having a role/function rather than performing an event. The sense should be retyped as a role/capacity sense, not an action sense.",
    examples: [
      "the sense is occupying a role, not performing actions.",
      "the sense is having a function, not performing an event.",
      "the sense is being a buffer, not buffering as an event.",
    ],
  },
  {
    code: 'S-071',
    category: 'Form',
    label: 'Non-Canonical Sense Template',
    description:
      "A sense definition can be canonicalized to a standard template (\"To X\", \"Being X\", \"An act of X\", \"Relating to X\") without changing which referent it picks out. The fix is wording, not membership.",
    examples: [
      "Adjective sense defined \"Of the kind that pertains to dental work\" should be canonicalized to \"Relating to dentistry\".",
      "State verb sense defined \"When something is hot to the touch\" should be canonicalized to \"To be hot\".",
      "Event noun sense defined \"The thing where you attack someone\" should be canonicalized to \"An act of attacking someone\".",
    ],
  },
  {
    code: 'S-072',
    category: 'Form',
    label: 'Wrong POS Shape',
    description:
      "The grammatical form of the definition does not match the POS of the sense. Verb senses must read as actions/states, noun senses as entities or nominalizations, adjective senses as properties or pertinence, etc.",
    examples: [
      "Verb sense verb sense defined \"An act of running quickly\": defined as a noun.",
      "Noun sense noun sense defined \"To attack someone\": defined as a verb.",
      "Adjective sense adjective sense defined \"Quickly\": defined as an adverb.",
    ],
  },
  {
    code: 'S-073',
    category: 'Form',
    label: 'Circular Definition',
    description:
      "The definition uses its own wording or label as the only contentful term, so the definition explains nothing. Replace it with a non-circular paraphrase.",
    examples: [
      "Sense defined \"In an aggressive manner\".",
      "Sense defined \"In a quick way\".",
      "Sense defined \"The state of being beautiful\" with no further content (when the frame is itself the property of being beautiful).",
    ],
  },
  {
    code: 'S-074',
    category: 'Form',
    label: 'Open-Ended List',
    description:
      "The definition uses an imprecise enumeration (\"X, Y, or Z things\", \"and so on\") where one precise referent or type is needed. The list does not commit to a clear extension.",
    examples: [
      "Sense defined \"Relating to X, Y, or Z things\".",
      "Sense defined \"Pertaining to customs, rituals, ceremonies, and so on\".",
    ],
  },
  {
    code: 'S-075',
    category: 'Form',
    label: 'Figurative Scaffolding',
    description:
      "The definition explains the sense through a simile or metaphor (\"as if\", \"like\") instead of stating the literal semantic content. Replace with a direct paraphrase.",
    examples: [
      "should be \"To move with a smooth wave-like motion\" or a direct equivalent without simile scaffolding.",
      "should describe the motion directly.",
    ],
  },
  {
    code: 'S-076',
    category: 'Form',
    label: 'Hedged Definition',
    description:
      "The definition uses weak approximators (\"may involve\", \"somewhat\", \"often\") where the core meaning should be stated outright. Hedging hides whether the predicate is part of the sense.",
    examples: [
      "Sense defined \"May involve rapid movement\".",
      "Sense defined \"Somewhat related to nearby things\".",
      "Sense defined \"Often connected to a topic\".",
    ],
  },
  {
    code: 'S-077',
    category: 'Form',
    label: 'Elaborative or Rephrasing Definition',
    description:
      "The definition contains a semicolon restatement, a redundant paraphrase of itself, or a rewording in apposition. The extra clause does not add information and should be removed.",
    examples: [
      "Sense defined \"Being large; having enormous dimensions\".",
      "Sense defined \"To completely ruin; to fully wreck\".",
    ],
  },
  {
    code: 'S-078',
    category: 'Form',
    label: 'Example Clause Embedded in Definition',
    description:
      "Illustrative examples or usage notes appear inside the definition string itself (\"such as\", \"for example\", \"e.g.\"). Examples belong in an examples field, not in the semantic content.",
    examples: [
      "Sense defined \"Relating to mammals, such as dogs and whales\".",
      "Sense defined \"Movable household objects, e.g. chairs and tables\".",
    ],
  },
  {
    code: 'S-079',
    category: 'Form',
    label: 'Lost Domain Qualifier in Rewrite',
    description:
      "A rewrite of the definition drops a domain restriction (\"in contract law\", \"in physics\", \"in music\") that is part of the sense\'s boundary. Without the qualifier the sense over-extends to other domains.",
    examples: [
      "legal scope lost.",
      "musical scope lost.",
    ],
  },
  {
    code: 'S-080',
    category: 'Form',
    label: 'New Sense Not Disjunctive from Existing Sense',
    description:
      "A proposed new sense is fully covered by an existing sense in the frame: every situation it picks out is already in the existing sense\'s extension. The new sense should not be added or should be split off as a sibling.",
    examples: [
      "Existing sense \"To push or shake something\" covers the proposed new sense \"To push something\".",
      "Existing sense \"An act of cutting or slicing\" covers the proposed new sense \"An act of slicing\".",
    ],
  },
  {
    code: 'S-081',
    category: 'Form',
    label: 'Referent Inconsistency Across Senses',
    description:
      "Multiple senses that should share a referent use inconsistent noun phrases for that referent. Pick a single canonical referent phrase and use it across senses.",
    examples: [
      "Frame uses both \"the heart\" and \"the cardiac organ\" across different senses for the same referent.",
      "Frame uses \"the brain\" in some senses and \"the cerebral organ\" in others for the same referent.",
    ],
  },
  {
    code: 'S-082',
    category: 'Pertinence',
    label: 'Genuine Resemblance Misclassified as Pertinence',
    description:
      "A resemblance, style, or behavior adjective (\"-like\", \"-ish\", \"-esque\") is collapsed into a plain pertinence sense (\"relating to X\"). Resemblance and pertinence have different truth conditions and should be separate.",
    examples: [
      "Sense defined \"Relating to dreams\" should be \"Resembling a dream\".",
      "Sense defined \"Relating to clowns\" should be \"Behaving like a clown\".",
      "Sense defined \"Relating to Kafka\" should be \"Resembling the style or atmosphere of Kafka\".",
    ],
  },
  {
    code: 'S-083',
    category: 'Pertinence',
    label: 'Directional or Locational Pertinence False Positive',
    description:
      "An adjective with a directional or locational prefix is treated as a pertinence sense, but the prefix carries the real predicate, making the sense positional or state-like rather than pure pertinence.",
    examples: [
      "Sense defined \"Relating to the moon\" should be \"Lying beyond the moon\".",
      "Sense defined \"Relating to orbit\" should be \"Below or within an orbit\".",
      "Sense defined \"Relating to stars\" should be \"Lying between stars\".",
    ],
  },
  {
    code: 'S-084',
    category: 'Pertinence',
    label: 'Noun-Only or Adverb-Only Pertinence Misclassification',
    description:
      "A frame or sense is classified as pertinence even though the pertinence test requires an adjective derived from a referent. Noun-only or adverb-only frames should not be marked as pertinence.",
    examples: [
      "Noun-only frame for \"due process\" treated as a pertinence frame: there is no adjective deriving from a referent.",
      "Adverb-only frame for adverb sense \"In a legal manner\" treated as pertinence: pertinence applies to adjective-derived patterns.",
    ],
  },
  {
    code: 'S-085',
    category: 'Redundancy',
    label: 'Subset or Partial-Overlap Mistaken for Duplicate',
    description:
      "Two senses are flagged as duplicates when one is in fact a strict subset of the other, or each has distinct residual content beyond their overlap. The right action is splitting or relating, not merging as duplicates.",
    examples: [
      "Proposed duplicate: \"To break\" matches only one disjunct of target \"To break or shatter\": subset, not duplicate.",
      "Two senses share overlap \"An act of cutting\" but each adds different mechanism content: partial overlap, not duplicate.",
    ],
  },
  {
    code: 'S-086',
    category: 'Form',
    label: 'Elaborated Definition Needs Whittling',
    description:
      "A target sense includes a generic core plus extra mechanisms or specific details that make it stricter than the frame requires. The definition should be whittled to keep only the distinguishing elaboration that the frame actually licenses.",
    examples: [
      "Sense \"A neural network involving recurrent connections, feedback loops, and temporal dynamics\" should be whittled to the licensed elaboration of generic \"neural network\".",
      "Sense \"A vehicle with four wheels, a combustion engine, and a steel frame\" should be whittled to the elaboration that is actually distinctive in the frame.",
    ],
  },
  {
    code: 'S-087',
    category: 'Redundancy',
    label: 'Relation Association Synonym Split',
    description:
      "General association predicates (\"relating to\", \"concerning\", \"about\", \"associated with\", \"connected to\", \"linked to\", \"relevant to\", \"pertinent to\") are split into multiple senses despite being stylistic variants of the same association relation.",
    examples: [
      "Frame split into \"Relating to X\", \"Concerning X\", and \"About X\".",
      "Frame split into \"Associated with X\", \"Connected to X\", and \"Linked to X\".",
      "Frame split into \"Relevant to X\" and \"Pertinent to X\".",
    ],
  },
  {
    code: 'S-088',
    category: 'Redundancy',
    label: 'Purpose or Function Clause Split',
    description:
      "A definition that contains an intrinsic purpose or function clause is split into two senses: one for the entity and one for the purpose. The purpose clause is part of one sense and should not generate a separate sense.",
    examples: [
      "purpose is intrinsic to the entity sense.",
      "Frame split into \"A measuring device\" and \"For measuring atmospheric pressure\".",
      "Frame split into \"A metal vessel\" and \"For boiling water\".",
    ],
  },
  {
    code: 'S-089',
    category: 'Redundancy',
    label: 'Agentive vs Non-Agentive Event Split',
    description:
      "An event sense is split into separate agentive and non-agentive senses solely because the event allows both realizations. The event type is the same; agency is a participant property to be encoded once, not as two senses.",
    examples: [
      "Frame split into \"An act of interruption\" and \"An occurrence of interruption\".",
      "Frame split into \"An act of rising into the air\" and \"A phenomenon of rising into the air\".",
      "Frame split into \"An act of suspension\" and \"An instance of suspension\".",
    ],
  },
  {
    code: 'S-090',
    category: 'Redundancy',
    label: 'Head-Noun Scope Misread',
    description:
      "An event definition uses a shared head noun (act, process, instance, occurrence) that scopes over multiple coordinated predicates, but the predicates are split as if each lacked that shared scope. The shared head should be preserved and the senses kept together.",
    examples: [
      "Sense \"An act/process of heating or cooling\" split into separate heating and cooling senses, dropping the shared event-head scope.",
      "Sense \"An act of suspending or interrupting an activity\" split into a suspending sense and an interrupting sense.",
      "Sense \"An instance of growth or decline\" split into separate growth and decline senses, ignoring the shared instance scope.",
    ],
  },
];

function diagnosisRows(checkDefinitionId: bigint | null) {
  return DIAGNOSES.map((diagnosis) => ({
    check_definition_id: checkDefinitionId,
    code: diagnosis.code,
    label: diagnosis.label,
    description: diagnosis.description,
    examples: diagnosis.examples,
    severity: diagnosis.severity ?? 'medium',
    category: diagnosis.category,
    remediation:
      'Review the flagged frame sense evidence and either split, merge, move, retype, rewrite, or keep the sense according to the diagnosis.',
    enabled: true,
  }));
}

async function existingState() {
  const definition = await prisma.health_check_definitions.findUnique({
    where: { code: CHECK_DEFINITION.code },
    include: { diagnosis_codes: { orderBy: { code: 'asc' } } },
  });

  const desiredCodes = DIAGNOSES.map((diagnosis) => diagnosis.code);
  const existingCodes = await prisma.health_diagnosis_codes.findMany({
    where: { code: { in: desiredCodes } },
    select: { code: true, label: true, check_definition_id: true },
    orderBy: { code: 'asc' },
  });

  return { definition, existingCodes };
}

function printPlan({
  definition,
  existingCodes,
}: Awaited<ReturnType<typeof existingState>>) {
  console.log(`${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} ${CHECK_DEFINITION.label}`);
  console.log(`Definition code: ${CHECK_DEFINITION.code}`);
  console.log(`Target types: ${CHECK_DEFINITION.target_types.join(', ')}`);
  console.log(`Diagnosis codes to ensure: ${DIAGNOSES.length}`);
  console.log(`Active code range: ${DIAGNOSES[0]?.code}..${DIAGNOSES[DIAGNOSES.length - 1]?.code}`);

  if (definition) {
    console.log(`Existing definition: id=${definition.id.toString()}, diagnosis_codes=${definition.diagnosis_codes.length}`);
  } else {
    console.log('Existing definition: none; would create it');
  }

  if (existingCodes.length > 0) {
    console.log(`Existing desired S-* codes: ${existingCodes.length}`);
    for (const existing of existingCodes) {
      const owner =
        existing.check_definition_id === null
          ? 'unlinked'
          : `check_definition_id=${existing.check_definition_id.toString()}`;
      console.log(`  - ${existing.code}: ${existing.label} (${owner})`);
    }
  } else {
    console.log('Existing desired S-* codes: none');
  }

  console.log('\nDiagnosis plan:');
  for (const diagnosis of DIAGNOSES) {
    console.log(
      `  ${diagnosis.code} | ${diagnosis.category} | ${diagnosis.label}`,
    );
  }
}

async function applySeed() {
  await prisma.$transaction(async (tx) => {
    const definition = await tx.health_check_definitions.upsert({
      where: { code: CHECK_DEFINITION.code },
      update: {
        label: CHECK_DEFINITION.label,
        description: CHECK_DEFINITION.description,
        target_types: CHECK_DEFINITION.target_types as never,
        rule_version: CHECK_DEFINITION.rule_version,
        enabled: CHECK_DEFINITION.enabled,
        config: CHECK_DEFINITION.config,
      },
      create: {
        code: CHECK_DEFINITION.code,
        label: CHECK_DEFINITION.label,
        description: CHECK_DEFINITION.description,
        target_types: CHECK_DEFINITION.target_types as never,
        rule_version: CHECK_DEFINITION.rule_version,
        enabled: CHECK_DEFINITION.enabled,
        config: CHECK_DEFINITION.config,
      },
    });

    const desiredCodes = DIAGNOSES.map((diagnosis) => diagnosis.code);
    const conflictingCodes = await tx.health_diagnosis_codes.findMany({
      where: {
        code: { in: desiredCodes },
        OR: [
          { check_definition_id: null },
          { check_definition_id: { not: definition.id } },
        ],
      },
      select: { code: true, label: true, check_definition_id: true },
      orderBy: { code: 'asc' },
    });

    if (conflictingCodes.length > 0) {
      const details = conflictingCodes
        .map((code) => {
          const owner =
            code.check_definition_id === null
              ? 'unlinked'
              : `check_definition_id=${code.check_definition_id.toString()}`;
          return `${code.code} (${code.label}, ${owner})`;
        })
        .join(', ');
      throw new Error(
        `Refusing to overwrite globally unique diagnosis code(s) owned outside ${CHECK_DEFINITION.code}: ${details}`,
      );
    }

    for (const row of diagnosisRows(definition.id)) {
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO health_diagnosis_codes (
            check_definition_id,
            code,
            label,
            description,
            examples,
            severity,
            category,
            enabled
          )
          VALUES (
            ${definition.id},
            ${row.code},
            ${row.label},
            ${row.description},
            ${row.examples}::TEXT[],
            ${row.severity}::issue_priority,
            ${row.category},
            ${row.enabled}
          )
          ON CONFLICT (code) DO UPDATE SET
            check_definition_id = EXCLUDED.check_definition_id,
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            examples = EXCLUDED.examples,
            severity = EXCLUDED.severity,
            category = EXCLUDED.category,
            enabled = EXCLUDED.enabled
        `,
      );
    }

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE health_diagnosis_codes
        SET enabled = false,
            label = 'Removed Diagnosis Code',
            description = 'Removed from the active standalone frame-sense audit because it requires evidence that is not available to the prompt.',
            examples = ARRAY[]::TEXT[],
            category = 'Removed'
        WHERE check_definition_id = ${definition.id}
          AND code IN (${Prisma.join(REMOVED_DIAGNOSIS_CODES)})
      `,
    );
  });
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npx tsx scripts/seed-frame-sense-standalone-health-check.ts [--dry-run|--apply]');
    return;
  }

  if (process.argv.includes('--dry-run') && process.argv.includes('--apply')) {
    throw new Error('Use either --dry-run or --apply, not both.');
  }

  const state = await existingState();
  printPlan(state);

  if (DRY_RUN) {
    console.log('\nDry run only. No database writes performed.');
    return;
  }

  await applySeed();
  console.log('\nSeed applied successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
