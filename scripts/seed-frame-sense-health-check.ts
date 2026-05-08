import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { PrismaClient, type issue_priority } from '@prisma/client';

loadEnv({ path: '.env.local', override: false });

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const CHECK_DEFINITION = {
  code: 'FRAME_SENSE_AUDIT',
  label: 'Frame Sense Coherence Audit',
  description:
    "Audits a frame's frame_senses as an inventory: coverage, sense coherence, over-bundling, redundancy, eventive/non-eventive register, and canonical sense-form issues. Excludes frame-level definitions, roles, role mappings, and hierarchy edges.",
  target_types: ['frame_sense_frame'],
  rule_version: 1,
  enabled: true,
  config: {
    diagnosis_code_prefix: 'FS',
    taxonomy_scope:
      'Frame-sense-level findings derived from existing prompt taxonomy; excludes definitions, roles, mappings, and parent-child relations.',
  },
} as const;

type DiagnosisSeed = {
  category: string;
  label: string;
  description: string;
  examples: string[];
  severity?: issue_priority;
  remediation: string;
};

const DIAGNOSES: DiagnosisSeed[] = [
  {
    category: 'Coverage',
    label: 'Missing POS Sense',
    description:
      'A frame has evidence for a normal cross-POS realization of the same concept, but the corresponding frame sense is absent.',
    examples: ['attack.v lacks the event noun attack.n', 'quick.adj lacks quickly.adv'],
    remediation: 'Add the missing POS sense only if it is a grammatical realization of the same underlying concept.',
  },
  {
    category: 'Coverage',
    label: 'Missing Lexical-Unit Distinction',
    description:
      'A lexical-unit gloss contains a real semantic distinction that is not represented by any current frame sense.',
    examples: ['A gloss says "consider or declare worthless" but only the cognitive judging sense is present.'],
    severity: 'high',
    remediation: 'Add a focused frame sense for the missing semantic chunk or move the lexical unit to a better-fitting frame.',
  },
  {
    category: 'Coverage',
    label: 'Stale Broad Sense',
    description:
      'A broad frame sense remains attached even though narrower committed senses now fully cover its semantic content.',
    examples: ['"Physical or mental suppression" remains after separate physical and mental suppression senses exist.'],
    remediation: 'Remove or disable the broad sense after confirming the narrower senses exhaust its coverage.',
  },
  {
    category: 'Coverage',
    label: 'Unusable Sense Content',
    description:
      'A frame sense is blank, tautological, or too thin to establish what semantic contribution it makes.',
    examples: ['Blank definition', '"A thing related to this frame"'],
    severity: 'high',
    remediation: 'Rewrite the sense from lexical-unit evidence or flag it for manual review if evidence is insufficient.',
  },
  {
    category: 'Coherence',
    label: 'Wrong Frame Sense',
    description:
      'One frame sense belongs to a different frame, while the other senses form a coherent frame.',
    examples: ['An Event frame has one adjective sense denoting a stable property rather than an event result.'],
    severity: 'high',
    remediation: 'Move the misplaced sense to the correct frame or create a new frame if no suitable target exists.',
  },
  {
    category: 'Coherence',
    label: 'Whole Frame Type Mismatch',
    description:
      'All frame senses point to a different semantic register or frame type than the frame currently has.',
    examples: ['A Relation frame where every sense describes an act or process.'],
    severity: 'high',
    remediation: 'Retype the frame rather than rewriting every sense into the wrong register.',
  },
  {
    category: 'Coherence',
    label: 'Invalid Cross-POS Derivation',
    description:
      'Different POS senses are merely related words or participants, not grammatical perspectives on the same concept.',
    examples: ['attack.v with attacker.n', 'medical.adj with doctor.n'],
    severity: 'high',
    remediation: 'Remove or move the invalid POS sense; only keep cross-POS senses that pass the same-situation test.',
  },
  {
    category: 'Coherence',
    label: 'Cause-Effect Cross-POS Mismatch',
    description:
      'One POS sense denotes causing an effect while another denotes the resulting state or property.',
    examples: ['heat.v with hot.adj'],
    severity: 'high',
    remediation: 'Separate the causing event from the resultant state/property unless the frame explicitly models a valid event-result pairing.',
  },
  {
    category: 'Coherence',
    label: 'Entity-Like Noun On Property Or Relation Frame',
    description:
      'A noun sense names an object class, artifact, product, or referent instead of the abstract property or relation shared by the other POS senses.',
    examples: ['A caliber property frame with a noun sense meaning a cartridge type.'],
    severity: 'high',
    remediation: 'Move the entity-like noun to an Entity frame or replace it with a true property/relation nominalization.',
  },
  {
    category: 'Coherence',
    label: 'Inconsistent Parallel POS Decisions',
    description:
      'The same semantic distinction is split for one POS but merged for another POS in the same frame.',
    examples: ['Speech vs vocal sound is split for adjectives but merged for nouns.'],
    remediation: 'Apply the same merge/split decision across parallel POS realizations unless a POS-specific exception applies.',
  },
  {
    category: 'Coherence',
    label: 'Referent Noun In Pertinence Frame',
    description:
      'A noun sense names the thing an adjective is about rather than the property of relating to that thing.',
    examples: ['fiduciary.adj with trustee-beneficiary relation.n'],
    severity: 'high',
    remediation: 'Move referent nouns out of pertinence frames; keep only property/quality nominalizations that abstract from the adjective.',
  },
  {
    category: 'Bundling',
    label: 'Disjunctive Multi-Concept Sense',
    description:
      'A single frame sense joins distinct semantic alternatives with disjunctive or conjunctive wording instead of naming one focused concept.',
    examples: ['"To create or destroy something"', '"Being happy or sad"'],
    severity: 'high',
    remediation: 'Split the disjunctive sense into focused senses, one per distinct semantic chunk.',
  },
  {
    category: 'Bundling',
    label: 'Abstract Physical Or Concrete Abstract Mix',
    description:
      'A sense combines physical/concrete manifestations with abstract concepts.',
    examples: ['"A physical container or a conceptual framework"', '"A physical gathering or the abstract concept of social interaction"'],
    severity: 'high',
    remediation: 'Split physical/concrete and abstract readings unless the definition names one unified concept.',
  },
  {
    category: 'Bundling',
    label: 'Literal Metaphorical Mix',
    description:
      'A sense bundles literal uses with metaphorical or figurative extensions.',
    examples: ['"To build a physical structure or build an argument"'],
    severity: 'high',
    remediation: 'Split literal and metaphorical readings when they name different semantic situations.',
  },
  {
    category: 'Bundling',
    label: 'Spatial Temporal Mix',
    description:
      'A sense treats spatial and temporal dimensions as one meaning.',
    examples: ['"Distance in space or time"', '"Location or period"'],
    severity: 'high',
    remediation: 'Split spatial and temporal senses unless the frame is explicitly about a unified spacetime concept.',
  },
  {
    category: 'Bundling',
    label: 'Physical Mental Or Emotional Mix',
    description:
      'A sense bundles physical realizations with mental, cognitive, or emotional realizations when they differ semantically.',
    examples: ['"Lacking physical energy or mental focus"', '"Requiring physical or mental effort"'],
    severity: 'high',
    remediation: 'Split physical, mental, and emotional readings when they are different manifestations rather than synonyms.',
  },
  {
    category: 'Bundling',
    label: 'Cognitive Communicative Mix',
    description:
      'A sense bundles internal mental acts with external communicative speech acts.',
    examples: ['"To consider or declare something worthless"', '"Feel or express contempt"'],
    severity: 'high',
    remediation: 'Split cognitive/private judgment senses from communicative/public expression senses.',
  },
  {
    category: 'Bundling',
    label: 'Creation Joining Modification Mix',
    description:
      'A sense collapses creation, connection, repair, decoration, or modification into one semantic chunk.',
    examples: ['"To make or decorate garments"', '"To make or sew together fabric"'],
    severity: 'high',
    remediation: 'Split creation, joining, repair, decoration, and modification operations when each has distinct entailments.',
  },
  {
    category: 'Bundling',
    label: 'Manner Vs Activity Type Mix',
    description:
      'A sense bundles a manner of acting with a distinct activity type or with inactivity.',
    examples: ['"To act in a dull manner or spend time in monotonous activity or idleness"'],
    severity: 'high',
    remediation: 'Separate manner descriptions from activity-type or inactivity meanings.',
  },
  {
    category: 'Bundling',
    label: 'Activity Result Or Process Achievement Mix',
    description:
      'A sense bundles an ongoing activity or process with an achieved result, completion, or final form when entailments differ.',
    examples: ['"To work toward completion or complete"', '"An activity and its finished product"'],
    severity: 'high',
    remediation: 'Split process/activity senses from achievement/result senses unless they are a valid unified event reading.',
  },
  {
    category: 'Bundling',
    label: 'Achievement Vs Attempt',
    description:
      'A sense merges successful accomplishment with attempting, failing, or merely trying.',
    examples: ['"To solve a problem" vs "to try to solve a problem"'],
    severity: 'high',
    remediation: 'Keep attempt/effort senses separate from achievement/success senses.',
  },
  {
    category: 'Bundling',
    label: 'Cause Effect Or Mechanism Symptom Mix',
    description:
      'A sense treats an upstream cause or mechanism and a downstream effect, response, or symptom as one meaning.',
    examples: ['Neural excitation vs inflammatory irritation', 'Ignition vs scorch damage'],
    severity: 'high',
    remediation: 'Separate causal mechanisms from effects or symptoms unless the sense explicitly names the whole causal episode.',
  },
  {
    category: 'Bundling',
    label: 'Part Whole Or Material System Mix',
    description:
      'A component, material, tissue, or part is merged with an organized whole or system.',
    examples: ['Neural tissue vs nervous system', 'Wood vs tree', 'Neuron vs brain'],
    severity: 'high',
    remediation: 'Separate component/material senses from whole/system senses.',
  },
  {
    category: 'Bundling',
    label: 'Categorical Vs Relational Mix',
    description:
      'A sense treats being an instance of X as equivalent to relating to X.',
    examples: ['Being a bilabial sound vs pertaining to bilabial sounds'],
    severity: 'high',
    remediation: 'Split categorical membership senses from relational or pertinence senses.',
  },
  {
    category: 'Bundling',
    label: 'Purpose Function Vs Relational Mix',
    description:
      'A purpose or function predicate such as designed for X is treated as equivalent to topical relation to X.',
    examples: ['A surgical instrument designed for surgery vs an article relating to surgery'],
    severity: 'high',
    remediation: 'Separate purpose/function senses from general topical or pertinence senses.',
  },
  {
    category: 'Bundling',
    label: 'Relation Predicate Bundle',
    description:
      'A relation sense bundles different relational predicates that should be distinct.',
    examples: ['"Containing, composed of, or relating to X"'],
    severity: 'high',
    remediation: 'Split bundled relational predicates into focused relation senses.',
  },
  {
    category: 'Bundling',
    label: 'Membership Part Belonging Mix',
    description:
      'A sense treats membership, part-whole, and belonging predicates as interchangeable.',
    examples: ['"Part of or member of X"', '"Belonging to or contained in X"'],
    severity: 'high',
    remediation: 'Split membership, part-of, and belonging relations when they have different truth conditions.',
  },
  {
    category: 'Bundling',
    label: 'Origin Derivation Source Mix',
    description:
      'A sense bundles derived-from, originating-in, and based-on source relations despite their different meanings.',
    examples: ['"Derived from or originating in X"'],
    severity: 'high',
    remediation: 'Split distinct origin, derivation, and source predicates when the distinctions are semantically active.',
  },
  {
    category: 'Bundling',
    label: 'Characteristic Typical Indicative Mix',
    description:
      'A sense treats characteristic-of, typical-of, and indicative-of as a single relation when the distinction matters.',
    examples: ['"Characteristic of or typical of X"'],
    severity: 'high',
    remediation: 'Split attribution predicates that impose different semantic relations.',
  },
  {
    category: 'Bundling',
    label: 'State Vs Disposition Mix',
    description:
      'A stable tendency or disposition is bundled with a temporary occurrent state.',
    examples: ['"Being naturally curious or temporarily interested"'],
    severity: 'high',
    remediation: 'Split dispositional traits from temporary states or conditions.',
  },
  {
    category: 'Bundling',
    label: 'Intrinsic Vs Comparative Property Mix',
    description:
      'An absolute or intrinsic property is bundled with a comparison-class-relative property.',
    examples: ['"Being large in absolute size or large compared to others"'],
    severity: 'high',
    remediation: 'Split intrinsic property senses from comparative or relational property senses.',
  },
  {
    category: 'Bundling',
    label: 'Personal Vs Public Collective Scope Mix',
    description:
      'An individual experiential state is merged with a public, collective, or socially recognized status.',
    examples: ['Personally unaccustomed vs publicly unknown'],
    severity: 'high',
    remediation: 'Separate private/experiencer-scope senses from public or collective-scope senses.',
  },
  {
    category: 'Bundling',
    label: 'Instantiated State Vs Domain Supercategory',
    description:
      'A specific first-order state is merged with a broad status, category, condition, type, or domain label.',
    examples: ['Currently employed/on the job vs employment status', 'High tide vs tidal pertinence'],
    severity: 'high',
    remediation: 'Separate specific instantiated states from domain supercategories or status taxonomies.',
  },
  {
    category: 'Bundling',
    label: 'Domain Or Cultural Scope Mix',
    description:
      'Distinct technical, cultural, historical, geographical, or domain referents are merged.',
    examples: ['Latin American cultural vs classical Latin language', 'General Catholic vs Roman Catholic'],
    severity: 'high',
    remediation: 'Split domain-scoped or culturally distinct senses unless they are true paraphrases.',
  },
  {
    category: 'Bundling',
    label: 'Neutral Vs Pejorative Evaluative Mix',
    description:
      'A neutral descriptive sense is bundled with an evaluative, pejorative, or accusatory reading.',
    examples: ['Reveal true nature vs expose crimes', 'Report vs denounce'],
    severity: 'high',
    remediation: 'Separate neutral truth-conditional senses from evaluative or accusatory senses.',
  },
  {
    category: 'Bundling',
    label: 'General Vs Specific Scope Mix',
    description:
      'A broad category sense is merged with a stricter subtype, technique, manner, instrument, or domain-specific case.',
    examples: ['Cook vs saute', 'Chemical reaction vs oxidation', 'Tool use in general vs use of a specific instrument'],
    severity: 'high',
    remediation: 'Keep general and specific senses separate when the specific constraints are lexically meaningful.',
  },
  {
    category: 'Bundling',
    label: 'Parenthetical Or Domain Restriction Loss',
    description:
      'A domain, type, or parenthetical restriction changes meaning but is ignored during sense comparison or clustering.',
    examples: ['"(in contract law)"', '"(of radiate animals)"', '"(in chemistry)"'],
    severity: 'high',
    remediation: 'Preserve and respect domain restrictions; split or specialize senses when the restriction changes applicability.',
  },
  {
    category: 'Bundling',
    label: 'Scalar Degree Or Threshold Collapse',
    description:
      'Different points, thresholds, or intensity levels on a scale are merged.',
    examples: ['warm vs hot vs scorching', 'damp vs wet vs soaked'],
    severity: 'high',
    remediation: 'Separate degree and threshold senses when the distinction is part of the lexical meaning.',
  },
  {
    category: 'Bundling',
    label: 'Polarity Or Antonym Collapse',
    description:
      'Opposite poles or antonymic processes are merged as if they were one sense.',
    examples: ['hot vs cold', 'expand vs contract', 'positive vs negative'],
    severity: 'high',
    remediation: 'Keep antonyms and polarity opposites distinct.',
  },
  {
    category: 'Bundling',
    label: 'Directional Opposite Collapse',
    description:
      'Mutually exclusive directions are mistaken for perspectives on the same situation.',
    examples: ['inward vs outward', 'toward vs away', 'above vs below as relation senses'],
    severity: 'high',
    remediation: 'Separate directional opposites unless they are true reciprocal perspectives on a single Event occurrence.',
  },
  {
    category: 'Bundling',
    label: 'Agent Vs Patient Capability Mix',
    description:
      'A sense that causes a condition in others is merged with a sense describing susceptibility to undergoing that condition.',
    examples: ['mutagenic/mutagenesis vs mutability', 'carcinogenic vs cancer susceptibility'],
    severity: 'high',
    remediation: 'Separate causer/agent capability senses from patient/susceptibility senses.',
  },
  {
    category: 'Bundling',
    label: 'Directional POS Bias',
    description:
      'A neutral dimensional frame carries adjective or adverb senses whose lemmas lexicalize only one pole of the scale.',
    examples: ['temperature.n with hot.adj or hotly.adv', 'speed.n with fast.adj only'],
    severity: 'high',
    remediation: 'Move pole-selecting adj/adv senses to directional child frames while keeping the neutral noun in the dimension frame.',
  },
  {
    category: 'Redundancy',
    label: 'Duplicate Paraphrase Senses',
    description:
      'Two senses describe the same situation with only stylistic or wording differences.',
    examples: ['"To become liquid when heated" vs "To turn liquid through heat"'],
    remediation: 'Merge duplicate senses into one clear canonical definition.',
  },
  {
    category: 'Redundancy',
    label: 'Synonymous Elaboration Split',
    description:
      'Near-synonyms or tautological terms are split as if they were distinct meanings.',
    examples: ['"Amount, quantity, or magnitude"', '"Harm or injure"'],
    remediation: 'Collapse synonymous elaborations into a single sense.',
  },
  {
    category: 'Redundancy',
    label: 'Complementary Attribute Split',
    description:
      'Attributes that jointly define one quality are split into separate senses.',
    examples: ['"Unthinking and repetitive" as one machine-like quality'],
    remediation: 'Merge complementary attributes when they co-define a single property.',
  },
  {
    category: 'Redundancy',
    label: 'Exhaustive Coverage Split',
    description:
      'Alternatives that jointly exhaust one concept are split even though they do not create distinct meanings.',
    examples: ['"Light from natural or artificial sources"', '"Day or night" as all time'],
    remediation: 'Merge exhaustive coverage alternatives into one general sense.',
  },
  {
    category: 'Redundancy',
    label: 'With Or Without Modifier Split',
    description:
      'An optional modifier explicitly marked as with-or-without is treated as a semantic distinction.',
    examples: ['"With or without consent"', '"With or without assistance"'],
    remediation: 'Keep with-or-without variants in one modifier-agnostic sense unless another distinction is present.',
  },
  {
    category: 'Redundancy',
    label: 'Someone Or Something Split',
    description:
      'Entity type generality is mistaken for multiple senses.',
    examples: ['"To defeat someone or something"', '"To name someone or something"'],
    remediation: 'Keep filler-type generality in one sense unless the entity type changes the event or state itself.',
  },
  {
    category: 'Redundancy',
    label: 'False Pertinence Specificity',
    description:
      'Morphological pertinence adjectives are split by dictionary predicate phrasing instead of by referent.',
    examples: ['stellar "resembling a star" vs "relating to stars"', 'calcitic "composed of calcite" vs "relating to calcite"'],
    remediation: 'Collapse pertinence phrasing variants to a single relating-to sense when the referent is the same.',
  },
  {
    category: 'Redundancy',
    label: 'Unnecessary Causative Inchoative Split',
    description:
      'The same event is split only by whether a causer is expressed.',
    examples: ['"To open" vs "to cause to open"', '"The ice melted" vs "the heat melted the ice"'],
    remediation: 'Mark or merge causative/inchoative alternations according to the frame model rather than treating them as different events.',
  },
  {
    category: 'Redundancy',
    label: 'Unnecessary Event Perspective Split',
    description:
      'One Event occurrence is split by reciprocal participant viewpoint.',
    examples: ['buy/sell', 'lend/borrow', 'give/receive', 'import/export as one transfer event'],
    remediation: 'Mark perspectival alternants or merge them according to the frame model when they describe the same event.',
  },
  {
    category: 'Redundancy',
    label: 'Minor Filler Variation Split',
    description:
      'Only filler ownership or filler type changes, not the underlying situation.',
    examples: ['Gratifying one\'s own desires vs another person\'s desires'],
    remediation: 'Merge minor filler variations into a generalized sense when the core situation is unchanged.',
  },
  {
    category: 'Redundancy',
    label: 'Technical Non Lexical Split',
    description:
      'A specialist distinction is not lexically meaningful for the frame sense inventory.',
    examples: ['Radiation emitted from a surface vs incident at a surface when the lexical item does not encode that distinction.'],
    remediation: 'Merge technical distinctions that do not correspond to a lexical semantic contrast.',
  },
  {
    category: 'Redundancy',
    label: 'Over Specific Lemma Driven Split',
    description:
      'A single lemma or surface form is treated as proof of a separate sense not licensed by the definitions or glosses.',
    examples: ['One rare lemma implies an otherwise absent domain sense.'],
    remediation: 'Require definitional or multiple-lemma evidence before adding a new sense.',
  },
  {
    category: 'Register',
    label: 'Eventive Sense On Non Eventive Frame',
    description:
      'A sense describes an act or process while the frame is otherwise state, category, relation, or entity-like.',
    examples: ['A non-eventive frame has a verb sense "to perform X".'],
    severity: 'high',
    remediation: 'Rewrite only if the sense is genuinely stative/relational; otherwise move it to an Event frame.',
  },
  {
    category: 'Register',
    label: 'Non Eventive Sense On Event Frame',
    description:
      'A sense describes a state, property, category, relation, or result rather than an act/process event.',
    examples: ['An Event frame has a noun sense "the result of being absorbed".'],
    severity: 'high',
    remediation: 'Rewrite only if it is an eventive nominalization; otherwise move it to a non-eventive frame.',
  },
  {
    category: 'Register',
    label: 'Wrong Register Wording Only',
    description:
      'The sense belongs on the frame, but its definition uses the wrong eventive or non-eventive template.',
    examples: ['An event noun written as "the state caused by X" instead of "the process of X".'],
    remediation: 'Rewrite the sense into the correct register while preserving its POS and meaning.',
  },
  {
    category: 'Form',
    label: 'Non Canonical Sense Template',
    description:
      'A sense definition can be canonicalized without changing sense membership.',
    examples: ['Adjective should use "Relating to X"', 'Stative verb should use "To be X"'],
    severity: 'low',
    remediation: 'Rewrite the definition using the appropriate canonical POS/template pattern.',
  },
  {
    category: 'Form',
    label: 'Definition Uses Figurative Scaffolding',
    description:
      'A definition explains by simile or figurative scaffolding instead of direct semantic content.',
    examples: ['"Moving as if like a wave" instead of "moving in an undulating motion"'],
    severity: 'low',
    remediation: 'Rewrite the definition directly without "as if", "like", or similar scaffolding.',
  },
  {
    category: 'Form',
    label: 'Hedged Definition',
    description:
      'A definition uses may, can, often, usually, or similar hedges where it should state the core meaning.',
    examples: ['"May involve rapid movement"', '"Often used for X" when X is core'],
    severity: 'low',
    remediation: 'Replace hedged wording with a direct statement of the sense meaning.',
  },
  {
    category: 'Form',
    label: 'Elaborative Or Rephrasing Definition',
    description:
      'A definition contains semicolon restatement, explanatory examples, or rephrasing rather than one focused statement.',
    examples: ['"Being large; having enormous dimensions"', '"Being large, that is to say, of great size"'],
    severity: 'low',
    remediation: 'Rewrite as one concise, non-redundant definition.',
  },
  {
    category: 'Scalar',
    label: 'Biased Property Noun In Wrong Frame',
    description:
      'A pole-selecting property noun lives separately from the neutral dimensional property frame it should share.',
    examples: ['hotness should live with temperature', 'loudness should live with sound volume', 'heaviness should live with weight'],
    severity: 'high',
    remediation:
      'Merge or move biased property noun senses into the neutral dimension frame when they denote the same underlying scalar property.',
  },
  {
    category: 'Alternation',
    label: 'Mis Tagged Alternation',
    description:
      'Causative-inchoative or perspectival senses are present but missing, wrong, or inconsistently assigned alternation flags.',
    examples: ['A causative open sense and inchoative open sense exist but neither is flagged', 'buy/sell senses are marked distinct instead of perspectival'],
    remediation:
      'Set causative, inchoative, or perspectival metadata consistently, or merge/split the senses if the alternation analysis is wrong.',
  },
  {
    category: 'Coherence',
    label: 'Converse Relation Mistaken For Perspective',
    description:
      'Asymmetric relation senses are treated like event perspectives even though they profile mutually distinct relation directions.',
    examples: ['above vs below', 'parent_of vs child_of', 'lender relation vs borrower relation as relation senses'],
    severity: 'high',
    remediation:
      'Keep converse relation senses separate unless the frame is an Event frame describing one shared occurrence from reciprocal participant views.',
  },
  {
    category: 'Merge Safety',
    label: 'Subset Or Partial Overlap Mistaken For Duplicate',
    description:
      'Two senses overlap or stand in a genus-species relation, but are not true duplicates with the same scope.',
    examples: ['A broad chemical reaction sense compared with oxidation', 'A target sense with "X or Y" where the candidate only matches X'],
    severity: 'high',
    remediation:
      'Do not merge; split, whittle, or keep separate depending on whether the broader sense is disjunctive, elaborated, or genuinely superordinate.',
  },
  {
    category: 'Granularity',
    label: 'Post Split Cluster Still Incoherent',
    description:
      'Senses already classified as distinct are regrouped into proposed containers that still mix multiple semantic concepts.',
    examples: ['A DISTINCT_ERROR set is split once but the new cluster still mixes physical and mental readings'],
    severity: 'high',
    remediation:
      'Recluster the distinct senses into smaller coherent containers before creating or updating frames.',
  },
  {
    category: 'Bundling',
    label: 'Dynamic Process Vs Static Measure Mix',
    description:
      'A dynamic process, event, or operation is conflated with a static measurement, amount, or scalar property.',
    examples: ['rate of movement vs the act of accelerating', 'measurement of pressure vs applying pressure'],
    severity: 'high',
    remediation:
      'Separate dynamic process/event senses from static measurement or property senses.',
  },
  {
    category: 'Granularity',
    label: 'Hidden Polysemy After Merge',
    description:
      'A merged or consolidated frame still contains dictionary-distinct senses that should remain separate.',
    examples: ['poleaxe with a poleax vs poleaxe meaning stun with any heavy blow', 'bank as financial institution vs river edge'],
    severity: 'high',
    remediation:
      'Undo or revise the merge so each genuinely distinct lexicographic sense has its own coherent frame container.',
  },
];

function codeFor(index: number): string {
  return `FS-${String(index + 1).padStart(3, '0')}`;
}

async function main() {
  const plannedCodes = DIAGNOSES.map((diagnosis, index) => ({
    ...diagnosis,
    code: codeFor(index),
    severity: diagnosis.severity ?? 'medium',
  }));

  const uniqueCodes = new Set(plannedCodes.map((diagnosis) => diagnosis.code));
  if (uniqueCodes.size !== plannedCodes.length) {
    throw new Error('Duplicate diagnosis codes generated');
  }

  if (plannedCodes.some((diagnosis, index) => diagnosis.code !== codeFor(index))) {
    throw new Error('Diagnosis codes are not a contiguous FS-001 sequence');
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} frame sense health check seed`);
  console.log(`Definition: ${CHECK_DEFINITION.code} — ${CHECK_DEFINITION.label}`);
  console.log(`Diagnosis codes: ${plannedCodes[0]?.code}..${plannedCodes.at(-1)?.code} (${plannedCodes.length})`);

  try {
    await prisma.$transaction(async (tx) => {
      const existingDefinition = await tx.health_check_definitions.findUnique({
        where: { code: CHECK_DEFINITION.code },
        include: { diagnosis_codes: { orderBy: { code: 'asc' } } },
      });

      if (existingDefinition) {
        console.log(`Would update existing definition id=${existingDefinition.id.toString()}`);
      } else {
        console.log('Would create new definition');
      }

      const definition = await tx.health_check_definitions.upsert({
        where: { code: CHECK_DEFINITION.code },
        create: CHECK_DEFINITION,
        update: {
          label: CHECK_DEFINITION.label,
          description: CHECK_DEFINITION.description,
          target_types: CHECK_DEFINITION.target_types,
          rule_version: CHECK_DEFINITION.rule_version,
          enabled: CHECK_DEFINITION.enabled,
          config: CHECK_DEFINITION.config,
        },
      });

      const existingCodes = await tx.health_diagnosis_codes.findMany({
        where: { code: { in: plannedCodes.map((diagnosis) => diagnosis.code) } },
        select: { code: true, check_definition_id: true, label: true },
        orderBy: { code: 'asc' },
      });

      const foreignCodes = existingCodes.filter(
        (existingCode) =>
          existingCode.check_definition_id !== null &&
          existingCode.check_definition_id !== definition.id,
      );
      if (foreignCodes.length > 0) {
        throw new Error(
          `Refusing to reuse globally unique diagnosis codes owned by another check: ${foreignCodes
            .map((code) => code.code)
            .join(', ')}`,
        );
      }

      const existingCodeSet = new Set(existingCodes.map((code) => code.code));
      console.log(`Would create ${plannedCodes.filter((diagnosis) => !existingCodeSet.has(diagnosis.code)).length} diagnosis codes`);
      console.log(`Would update ${plannedCodes.filter((diagnosis) => existingCodeSet.has(diagnosis.code)).length} diagnosis codes`);

      for (const diagnosis of plannedCodes) {
        await tx.health_diagnosis_codes.upsert({
          where: { code: diagnosis.code },
          create: {
            check_definition_id: definition.id,
            code: diagnosis.code,
            label: diagnosis.label,
            description: diagnosis.description,
            examples: diagnosis.examples,
            severity: diagnosis.severity,
            category: diagnosis.category,
            remediation: diagnosis.remediation,
            enabled: true,
          },
          update: {
            check_definition_id: definition.id,
            label: diagnosis.label,
            description: diagnosis.description,
            examples: diagnosis.examples,
            severity: diagnosis.severity,
            category: diagnosis.category,
            remediation: diagnosis.remediation,
            enabled: true,
          },
        });
      }

      const categoryCounts = plannedCodes.reduce<Record<string, number>>((acc, diagnosis) => {
        acc[diagnosis.category] = (acc[diagnosis.category] ?? 0) + 1;
        return acc;
      }, {});

      console.log('Category counts:');
      for (const [category, count] of Object.entries(categoryCounts)) {
        console.log(`  ${category}: ${count}`);
      }

      console.log('First five diagnosis codes:');
      for (const diagnosis of plannedCodes.slice(0, 5)) {
        console.log(`  ${diagnosis.code} ${diagnosis.label}`);
      }
      console.log('Last five diagnosis codes:');
      for (const diagnosis of plannedCodes.slice(-5)) {
        console.log(`  ${diagnosis.code} ${diagnosis.label}`);
      }

      if (!APPLY) {
        throw new Error('DRY_RUN_ROLLBACK');
      }
    });

    console.log('Seed applied successfully.');
  } catch (error) {
    if (error instanceof Error && error.message === 'DRY_RUN_ROLLBACK') {
      console.log('Dry run complete. No changes were committed. Re-run with --apply to write.');
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
