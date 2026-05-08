import 'dotenv/config';
import dotenv from 'dotenv';
import { Prisma, PrismaClient, issue_priority } from '@prisma/client';

dotenv.config({ path: '.env.local', override: false });

const prisma = new PrismaClient();

const CHECK_DEFINITION = {
  code: 'FRAME_DEF_ROLES_MAPPING_AUDIT',
  label: 'Frame Definition, Roles, and Role Mapping Audit',
  description:
    'Audits a frame definition, role inventory, role descriptions/examples, and parent-to-child role mappings for schema, style, semantic, and cross-field consistency problems.',
  target_types: ['frame', 'frame_role', 'frame_role_mapping'],
  rule_version: 1,
  enabled: true,
  config: {
    diagnosis_code_prefix: 'DR',
    diagnosis_code_version: 1,
    scope: [
      'frame.definition',
      'frame.roles',
      'frame.role_mapping',
    ],
  },
} as const;

type Diagnosis = {
  label: string;
  description: string;
  examples: string[];
  category: string;
  severity: issue_priority;
  remediation: string;
};

const DIAGNOSES: Diagnosis[] = [
  {
    label: 'Missing Required Health Check Field',
    description:
      'The audited payload is missing a required structural field needed to evaluate the frame, such as definition, roles, role descriptions, examples, or role mapping entries.',
    examples: ['A frame has no definition field.', 'A role object lacks is_core.', 'A non-root frame has no role_mapping array.'],
    category: 'structural_schema',
    severity: 'high',
    remediation: 'Populate the missing field before running semantic review.',
  },
  {
    label: 'Invalid Field Type',
    description:
      'A structural field has the wrong data type for the health-check contract or database schema.',
    examples: ['roles is an object instead of an array.', 'is_core is the string "true" instead of a boolean.', 'examples is a string instead of a text array.'],
    category: 'structural_schema',
    severity: 'high',
    remediation: 'Normalize the payload to the expected schema types.',
  },
  {
    label: 'Invalid Or Empty Identifier',
    description:
      'A frame, role, or mapping identifier needed for stable diagnosis is missing, empty, malformed, or not referentially usable.',
    examples: ['frame_id is null.', 'A role has an empty name.', 'A role_mapping entry has no parent_role.'],
    category: 'structural_schema',
    severity: 'high',
    remediation: 'Ensure every audited entity has a stable identifier or role name.',
  },
  {
    label: 'Duplicate Role Name',
    description:
      'The same role name appears more than once in the frame role list, making references from definitions and mappings ambiguous.',
    examples: ['Two roles both named Place.', 'Two roles both named Degree, one core and one peripheral.'],
    category: 'structural_schema',
    severity: 'high',
    remediation: 'Merge duplicate roles or rename genuinely distinct roles with precise bespoke names.',
  },
  {
    label: 'Malformed Role Name',
    description:
      'A role name does not follow the expected Capitalised_Underscore_Separated format.',
    examples: ['cut item', 'cutItem', 'cut-item', 'cut_item'],
    category: 'structural_schema',
    severity: 'medium',
    remediation: 'Rename the role using project role-name style, for example Cut_item.',
  },
  {
    label: 'Invalid Mapping Type',
    description:
      'A role mapping uses a mapping_type outside the supported set: identical, renamed, specialized, merged, incorporated, absorbed, or dropped.',
    examples: ['mapping_type is "same".', 'mapping_type is "narrowed".', 'mapping_type is "deleted".'],
    category: 'structural_schema',
    severity: 'high',
    remediation: 'Replace the value with the correct supported mapping_type.',
  },
  {
    label: 'Unknown Child Role Reference',
    description:
      'A role mapping or definition references a child role name that is not present in the frame role list.',
    examples: ['Mapping points to Buyer, but the child roles contain Purchaser only.', 'Definition mentions Weapon, but no Weapon role exists.'],
    category: 'structural_schema',
    severity: 'high',
    remediation: 'Add the missing role, rename the reference, or correct the mapping.',
  },
  {
    label: 'Unknown Parent Role Reference',
    description:
      'A role mapping references a parent_role that is not present in the supplied parent role list.',
    examples: ['Mapping includes parent_role Agent, but the parent roles are Cutter and Cut_item.', 'A stale parent role name remains after parent roles were regenerated.'],
    category: 'structural_schema',
    severity: 'high',
    remediation: 'Update the mapping to use the current parent role inventory.',
  },
  {
    label: 'Missing Or Empty Definition',
    description:
      'The frame has no usable prose definition.',
    examples: ['definition is null.', 'definition is an empty string.', 'definition is "TBD".'],
    category: 'definition_style',
    severity: 'high',
    remediation: 'Write one concise frame definition based on the frame senses and role inventory.',
  },
  {
    label: 'Definition Has Multiple Sentences',
    description:
      'The definition is not the expected single short sentence, which makes it harder to audit role coverage and semantic scope.',
    examples: ['"A Cutter separates a Cut_item. This usually uses a knife."', '"An Entity is cold. It may be very cold."'],
    category: 'definition_style',
    severity: 'medium',
    remediation: 'Collapse the definition into one direct sentence.',
  },
  {
    label: 'Definition Uses Preamble Wording',
    description:
      'The definition starts with low-information framing instead of directly stating the frame semantics.',
    examples: ['"A situation where an Agent acts..."', '"An action in which a person..."', '"A frame that describes..."'],
    category: 'definition_style',
    severity: 'medium',
    remediation: 'Rewrite the definition as a direct FrameNet-style sentence.',
  },
  {
    label: 'Definition Contains Formulaic Filler',
    description:
      'The definition uses vague filler phrases that do not add semantic content.',
    examples: ['"through various means"', '"in a manner of"', '"characterized by" when a direct predicate would be clearer.'],
    category: 'definition_style',
    severity: 'medium',
    remediation: 'Remove filler and state the semantic relation or event directly.',
  },
  {
    label: 'Definition Too Vague Or Tautological',
    description:
      'The definition is so general that it does not identify the frame’s actual semantic content.',
    examples: ['"A thing that happens."', '"A kind of state."', '"An entity has a property."'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Rewrite the definition to name the specific event, state, relation, category, or measure.',
  },
  {
    label: 'Definition Not Specific To Child Frame',
    description:
      'A child frame definition merely restates the parent instead of identifying what the child adds.',
    examples: ['ASSASSINATION defined only as "A Killer kills a Victim."', 'JOGGING defined only as "A Runner runs." without moderate pace or exercise context.'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Add the child’s distinctive constraint while preserving the parent semantics.',
  },
  {
    label: 'Definition Adds Unsupported Constraint',
    description:
      'The definition includes a restriction or incidental detail not supported by the frame senses or lexical units.',
    examples: ['CUT defined as always using a knife.', 'BUYING defined as always using cash.', 'COMMUNICATION defined as always spoken aloud.'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Remove unsupported constraints or verify they are entailed by all senses.',
  },
  {
    label: 'Definition Uses Generic Role Labels',
    description:
      'The definition uses generic linguistic role labels where bespoke role names are expected.',
    examples: ['"An Agent affects a Patient."', '"A Cause changes a Theme."', '"An Actor does something to an Entity."'],
    category: 'definition_style',
    severity: 'medium',
    remediation: 'Replace generic labels with frame-specific role names.',
  },
  {
    label: 'Role Names Not Capitalised In Definition',
    description:
      'A participant role is mentioned in the definition but not capitalised as a role name.',
    examples: ['"a cutter separates a cut item"', '"the buyer obtains goods from a seller"'],
    category: 'definition_style',
    severity: 'low',
    remediation: 'Capitalise role mentions exactly as they appear in the role list.',
  },
  {
    label: 'Definition Mentions Absent Role',
    description:
      'The definition includes a capitalised role name that does not exist in the frame role list.',
    examples: ['Definition mentions Weapon, but roles include only Disarmer and Disarmed_party.', 'Definition mentions Seller, but no Seller role exists.'],
    category: 'cross_field_consistency',
    severity: 'high',
    remediation: 'Add the missing role or rewrite the definition to use an existing role.',
  },
  {
    label: 'Core Role Missing From Definition',
    description:
      'A core role exists in the role inventory but is not reflected in the frame definition.',
    examples: ['BUYING has Buyer, Seller, and Goods roles, but the definition omits Seller.', 'CUTTING has Cutting_instrument marked core but no instrument appears in the definition.'],
    category: 'cross_field_consistency',
    severity: 'high',
    remediation: 'Mention all semantically essential core roles in the definition.',
  },
  {
    label: 'Definition Contradicts Role Inventory',
    description:
      'The definition and roles imply incompatible participant structures or truth conditions.',
    examples: ['Definition treats two participants as symmetric while roles split Winner and Loser.', 'Definition says an Entity possesses a property while roles define an Agent causing a change.'],
    category: 'cross_field_consistency',
    severity: 'high',
    remediation: 'Align the definition and role inventory around one coherent frame analysis.',
  },
  {
    label: 'Event Definition Is Non-Causative',
    description:
      'An Event definition is framed only from the undergoer/patient perspective or lacks the expected causer/performer when causative framing is required.',
    examples: ['"A Victim undergoes injury."', '"An Object becomes broken."', '"An Experiencer experiences pain."'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Rewrite the event definition to include the causer or performer when the event analysis requires it.',
  },
  {
    label: 'Event Defined As Result State',
    description:
      'An Event frame definition describes the resulting state rather than the happening, action, process, or occurrence.',
    examples: ['BREAKING defined as "The state of being broken."', 'ABSORPTION defined as "The condition of having been absorbed."'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Rewrite as an act, process, occurrence, or causative event.',
  },
  {
    label: 'State Defined As Event',
    description:
      'A State frame definition describes an action or causing event rather than a condition, property, disposition, or state that holds.',
    examples: ['COLDNESS defined as "A Chiller makes an Entity cold."', 'BEAUTY defined as "An Evaluator admires an Entity."'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Rewrite the definition as a state/property borne by an entity.',
  },
  {
    label: 'Relation Defined As Event',
    description:
      'A Relation frame definition describes an act of connecting, changing, or causing rather than a stable structured link between relata.',
    examples: ['ADJACENCY defined as "A Connector places one thing near another."', 'KINSHIP defined as "A Family creates a relation."'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Rewrite as a relation holding between the appropriate relata.',
  },
  {
    label: 'Category Defined As Free Relation',
    description:
      'A Category frame is defined as a relation to an unrestricted second participant rather than as an entity’s pertinence to a fixed category/domain.',
    examples: ['LUNAR defined as "An Entity is related to another Entity."', 'CARDIAC defined with a free Heart role instead of fixed reference to the heart.'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Rewrite as "An Entity is of or relating to <fixed referent/domain>" or use incorporated Reference if the slot is recorded.',
  },
  {
    label: 'Measure Defined As Entity',
    description:
      'A Measure frame definition treats a unit or dimension as an ordinary entity rather than a quantification concept.',
    examples: ['"An entity is a meter."', '"A kilogram is an object used for mass."', '"A second is a thing."'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Rewrite as a unit or dimension used to quantify an attribute of an entity.',
  },
  {
    label: 'Definition Bundles Distinct Concepts',
    description:
      'The definition combines multiple semantic situations, domains, or readings that should be separate frames or senses.',
    examples: ['"A physical location or a point in time."', '"To cut a physical object or reduce a budget."', '"A legal right or a physical object."'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Split the concepts or narrow the definition to the single frame meaning.',
  },
  {
    label: 'Definition Conflates Literal And Metaphorical Uses',
    description:
      'The definition treats literal and metaphorical extensions as one meaning when the ontology rules require separation.',
    examples: ['Physical cutting and budget cutting in one definition.', 'Physical running and running a company in one definition.'],
    category: 'definition_semantics',
    severity: 'high',
    remediation: 'Separate literal and metaphorical readings unless the frame is explicitly defined at the abstract level.',
  },
  {
    label: 'Missing Core Role',
    description:
      'The role inventory omits a participant that is essential to the frame’s meaning.',
    examples: ['BUYING lacks Seller.', 'CUTTING lacks Cut_item.', 'A spatial relation lacks Figure or Ground.'],
    category: 'role_inventory',
    severity: 'high',
    remediation: 'Add the missing core role with a bespoke name, description, and example.',
  },
  {
    label: 'Spurious Core Role',
    description:
      'A role is marked core even though it is incidental, optional, or not entailed by the frame.',
    examples: ['Knife is core for all CUTTING.', 'Place is core for an ordinary non-locative event.', 'Evaluator is core for a non-evaluative property.'],
    category: 'role_inventory',
    severity: 'high',
    remediation: 'Demote the role to peripheral or remove it if it is not part of the frame semantics.',
  },
  {
    label: 'Core Peripheral Status Reversed',
    description:
      'A genuine core role is marked peripheral, or an ordinary peripheral role is marked core.',
    examples: ['Buyer marked peripheral in BUYING.', 'Time marked core for an ordinary event.', 'Degree marked core where it is merely an optional modifier.'],
    category: 'role_inventory',
    severity: 'medium',
    remediation: 'Correct is_core according to whether the role is semantically essential.',
  },
  {
    label: 'Wrong Role Family For Frame Type',
    description:
      'The role inventory contains roles that are characteristic of a different frame type and inappropriate for the current type.',
    examples: ['State frame with Agent or Instrument.', 'Relation frame with Patient or Purpose.', 'Category frame with event-doer roles.'],
    category: 'role_inventory',
    severity: 'high',
    remediation: 'Remove or replace roles that impose the wrong event/state/relation/category analysis.',
  },
  {
    label: 'Missing Mandatory Event Peripheral',
    description:
      'An Event frame lacks one of the standard event peripheral roles expected by the project’s role-generation rules.',
    examples: ['No Time role.', 'No Manner role.', 'No Containing_event role.'],
    category: 'role_inventory',
    severity: 'medium',
    remediation: 'Add the missing standard event peripheral unless there is a documented exception.',
  },
  {
    label: 'Scalar Role Duplication',
    description:
      'Two or more roles encode the same scalar "how much/how intense/how different" slot.',
    examples: ['Degree plus Amount.', 'Degree plus Reduction_amount.', 'Quantity plus Measure.', 'Qualitative_degree plus Quantitative_amount.'],
    category: 'role_inventory',
    severity: 'medium',
    remediation: 'Keep exactly one scalar role and make its description cover qualitative and quantitative fillers.',
  },
  {
    label: 'Missing Scalar Degree Role',
    description:
      'A gradable State, Relation, or Event lacks a role for degree, extent, intensity, quantity, or scalar change where one is semantically expected.',
    examples: ['COLDNESS without Degree or Coldness_degree.', 'REDUCTION without Reduction_amount or Degree.', 'SIMILARITY without Degree.'],
    category: 'role_inventory',
    severity: 'medium',
    remediation: 'Add one appropriate scalar role.',
  },
  {
    label: 'Relation Symmetry Misanalysed',
    description:
      'A symmetric relation is represented with asymmetric roles, or an asymmetric relation is collapsed into a collective role.',
    examples: ['SIMILARITY with Figure and Ground.', 'ABOVE with collective Entities.', 'KINSHIP with Entity_1 and Entity_2 where a collective role would be better.'],
    category: 'role_inventory',
    severity: 'high',
    remediation: 'Use collective roles for true symmetry and distinct roles for asymmetric relations.',
  },
  {
    label: 'Category Has Free Reference Participant',
    description:
      'A Category frame invents a free participant for the fixed referent/domain rather than treating it as incorporated or leaving it implicit.',
    examples: ['LUNAR has a freely fillable Moon role.', 'CARDIAC has a free Heart role that can vary.'],
    category: 'role_inventory',
    severity: 'high',
    remediation: 'Use only the categorized Entity plus optional incorporated Reference when recording the fixed referent explicitly.',
  },
  {
    label: 'Generic Core Role Name',
    description:
      'A core role uses a generic linguistic label rather than a role name grounded in this frame’s semantics.',
    examples: ['Agent', 'Cause', 'Causer', 'Actor', 'Doer', 'Patient', 'Theme'],
    category: 'role_naming',
    severity: 'medium',
    remediation: 'Rename the role with a bespoke frame-specific name.',
  },
  {
    label: 'Non-Bespoke Core Role Name',
    description:
      'A core role is not forbidden outright, but it is still too generic for the specific frame.',
    examples: ['Entity where Cold_entity would fit.', 'Person where Buyer would fit.', 'Object where Cut_item would fit.'],
    category: 'role_naming',
    severity: 'low',
    remediation: 'Prefer a more specific role name derived from the frame senses or lexical units.',
  },
  {
    label: 'Inconsistent Role Naming Within Frame',
    description:
      'Role names mix incompatible naming perspectives or levels of specificity.',
    examples: ['Buyer paired with Entity instead of Seller.', 'Cutter paired with Patient.', 'Figure paired with Related_entity.'],
    category: 'role_naming',
    severity: 'medium',
    remediation: 'Rename roles so the inventory uses a consistent semantic analysis.',
  },
  {
    label: 'Duplicate Semantic Role Slot',
    description:
      'Two differently named roles describe the same semantic slot.',
    examples: ['Recipient and Receiver.', 'Place and Location.', 'Evaluator and Judge with the same description.'],
    category: 'role_inventory',
    severity: 'medium',
    remediation: 'Merge duplicate slots and update definitions/mappings accordingly.',
  },
  {
    label: 'Role Description Missing Or Empty',
    description:
      'A role has no usable one-sentence description.',
    examples: ['description is null.', 'description is "".', 'description is "N/A".'],
    category: 'role_description_example',
    severity: 'medium',
    remediation: 'Add a concise description of what fills the role.',
  },
  {
    label: 'Role Description Too Vague',
    description:
      'A role description does not identify the role’s filler type or semantic function.',
    examples: ['"The participant."', '"The thing involved."', '"Something related to the frame."'],
    category: 'role_description_example',
    severity: 'medium',
    remediation: 'Rewrite the description to state the role’s function in this frame.',
  },
  {
    label: 'Role Description Filler Type Mismatch',
    description:
      'The role name and description imply incompatible ontological filler types.',
    examples: ['Weapon described as a person.', 'Believer described as a proposition.', 'Speed described as the moving entity.'],
    category: 'role_description_example',
    severity: 'high',
    remediation: 'Align the role name, description, and intended filler type.',
  },
  {
    label: 'Role Example Missing',
    description:
      'A role lacks an example sentence.',
    examples: ['example is null.', 'example is empty.', 'examples array is empty.'],
    category: 'role_description_example',
    severity: 'medium',
    remediation: 'Add a short example sentence showing the role in context.',
  },
  {
    label: 'Role Example Missing Chevrons',
    description:
      'A role example does not mark the role filler with << >> chevrons.',
    examples: ['"She cut the rope."', '"The buyer purchased the goods."'],
    category: 'role_description_example',
    severity: 'low',
    remediation: 'Mark the filler for the role being illustrated with chevrons.',
  },
  {
    label: 'Role Example Highlights Wrong Filler',
    description:
      'The example sentence marks a filler that does not correspond to the role.',
    examples: ['Cut_item example highlights <<She>> in "She cut the rope."', 'Seller example highlights <<goods>>.'],
    category: 'role_description_example',
    severity: 'medium',
    remediation: 'Move the chevrons to the correct role filler or change the example.',
  },
  {
    label: 'Role Example Does Not Evoke Frame',
    description:
      'The role example is grammatical but does not clearly instantiate the frame being audited.',
    examples: ['A BUYING role example about borrowing.', 'A CUTTING role example about tearing without cutting.'],
    category: 'role_description_example',
    severity: 'medium',
    remediation: 'Replace the example with one that evokes the frame and shows the target role.',
  },
  {
    label: 'Missing Parent Role Mapping',
    description:
      'A non-root frame does not provide exactly one mapping entry for every parent role.',
    examples: ['Parent has Cutter, Cut_item, and Cutting_instrument, but mapping only covers Cutter.', 'Parent Time role has no mapping row.'],
    category: 'role_mapping_coverage',
    severity: 'high',
    remediation: 'Add a mapping row for every parent role.',
  },
  {
    label: 'Duplicate Parent Role Mapping',
    description:
      'The same parent_role appears in multiple mapping entries when it should have one authoritative mapping.',
    examples: ['Two rows for parent_role Cutter.', 'Parent role Degree mapped once to Degree and once to Amount.'],
    category: 'role_mapping_coverage',
    severity: 'high',
    remediation: 'Keep one mapping entry per parent role; use merged only when multiple parent roles point to one child role.',
  },
  {
    label: 'Root Frame Has Role Mapping',
    description:
      'A root frame or parentless frame includes role_mapping even though there are no parent roles to map.',
    examples: ['is_root is true but role_mapping contains entries.', 'Parent is null but mapping rows are present.'],
    category: 'role_mapping_coverage',
    severity: 'medium',
    remediation: 'Remove role_mapping for root frames.',
  },
  {
    label: 'Non-Root Frame Missing Role Mapping',
    description:
      'A frame with a parent has no role_mapping section at all.',
    examples: ['Parent roles are supplied but role_mapping is absent.', 'Child frame generated definition and roles only.'],
    category: 'role_mapping_coverage',
    severity: 'high',
    remediation: 'Generate mapping entries for all parent roles.',
  },
  {
    label: 'Dropped Mapping Has Child Role',
    description:
      'A dropped mapping incorrectly retains a non-null child_role.',
    examples: ['{ parent_role: "Time", child_role: "Time", mapping_type: "dropped" }'],
    category: 'role_mapping_type',
    severity: 'high',
    remediation: 'Set child_role to null or choose a non-dropped mapping type.',
  },
  {
    label: 'Absorbed Mapping Has Child Role',
    description:
      'An absorbed mapping incorrectly retains a non-null child_role even though absorbed means the slot no longer survives.',
    examples: ['{ parent_role: "Act", child_role: "Walking", mapping_type: "absorbed" }'],
    category: 'role_mapping_type',
    severity: 'high',
    remediation: 'Set child_role to null for absorbed mappings.',
  },
  {
    label: 'Live Mapping Missing Child Role',
    description:
      'A mapping type that requires a surviving child role has child_role set to null.',
    examples: ['renamed with child_role null.', 'specialized with child_role null.', 'identical with child_role null.'],
    category: 'role_mapping_type',
    severity: 'high',
    remediation: 'Provide the child role name or change the mapping type to dropped/absorbed.',
  },
  {
    label: 'Incorporated Mapping Missing Incorporated Value',
    description:
      'A mapping is marked incorporated, but the corresponding child role does not carry incorporated_value.',
    examples: ['Reference mapped as incorporated for LUNAR without incorporated_value "moon".', 'Severed_body_part incorporated for DECAPITATE without "head".'],
    category: 'role_mapping_type',
    severity: 'high',
    remediation: 'Add incorporated_value to the child role or change the mapping type.',
  },
  {
    label: 'Incorporated Value Used On Non-Incorporated Role',
    description:
      'A child role has incorporated_value even though no parent mapping marks that role as incorporated, or the role is not lexically fixed.',
    examples: ['Place has incorporated_value "London" for an ordinary location role.', 'Instrument has incorporated_value "knife" for generic CUTTING.'],
    category: 'role_mapping_type',
    severity: 'medium',
    remediation: 'Remove incorporated_value unless the lexical unit fixes the filler and the mapping is incorporated.',
  },
  {
    label: 'Incorporated Role Missing From Child Roles',
    description:
      'An incorporated mapping points to a slot that should survive, but the child role list does not include that role.',
    examples: ['Reference mapped as incorporated for LUNAR but no Reference role exists.', 'Severed_body_part incorporated for DECAPITATE but absent from roles.'],
    category: 'role_mapping_type',
    severity: 'high',
    remediation: 'Add the incorporated role to the child role list with incorporated_value.',
  },
  {
    label: 'Absorbed Role Still Present',
    description:
      'A parent role marked absorbed still appears as a meaningful role in the child inventory.',
    examples: ['Parent Act absorbed by WALKING, but child still has Act.', 'Parent Motion_type absorbed by SWIMMING, but child keeps Motion_type as a free role.'],
    category: 'role_mapping_type',
    severity: 'medium',
    remediation: 'Remove the child role or change the mapping type if the slot truly survives.',
  },
  {
    label: 'Merged Mapping Not Represented For All Parent Roles',
    description:
      'Several parent roles collapse to one child role, but not every merged parent role has its own mapping row.',
    examples: ['Addressee and Evaluee merge into Audience, but only Addressee has a mapping row.', 'Source and Sender merge into Originator, but Source is missing.'],
    category: 'role_mapping_type',
    severity: 'medium',
    remediation: 'Create one merged mapping row for each parent role involved.',
  },
  {
    label: 'Identical Mapping Used With Different Names',
    description:
      'A mapping is labelled identical even though parent_role and child_role names differ.',
    examples: ['Cutter -> Disarmer with mapping_type identical.', 'Recipient -> Buyer with mapping_type identical.'],
    category: 'role_mapping_type',
    severity: 'medium',
    remediation: 'Use renamed or specialized if the semantic relation is valid.',
  },
  {
    label: 'Renamed Mapping Used For Same Name',
    description:
      'A mapping is labelled renamed even though the parent and child role names are identical.',
    examples: ['Cutting_instrument -> Cutting_instrument with mapping_type renamed.', 'Time -> Time with mapping_type renamed.'],
    category: 'role_mapping_type',
    severity: 'low',
    remediation: 'Use identical unless the role should actually be renamed.',
  },
  {
    label: 'Ontologically Incompatible Role Mapping',
    description:
      'A parent role is mapped to a child role whose fillers are a different kind of thing; the mapping should be dropped instead of coerced.',
    examples: ['Attacker -> Used_weapon.', 'Message -> Package.', 'Speed -> Runner.', 'Friendship -> Friend.'],
    category: 'role_mapping_semantics',
    severity: 'high',
    remediation: 'Set the mapping to dropped or map to a compatible child role.',
  },
  {
    label: 'False Renamed Mapping',
    description:
      'A mapping claims the parent and child roles are the same participant under different names, but their semantic functions differ.',
    examples: ['Victim -> Weapon.', 'Buyer -> Goods.', 'Speaker -> Message.'],
    category: 'role_mapping_semantics',
    severity: 'high',
    remediation: 'Use a compatible mapping type or drop the parent role.',
  },
  {
    label: 'False Specialized Mapping',
    description:
      'A mapping claims the child role is a constrained subtype of the parent role, but no subtype relation holds.',
    examples: ['Person -> Knife.', 'Location -> Time.', 'Event -> Artifact.'],
    category: 'role_mapping_semantics',
    severity: 'high',
    remediation: 'Only use specialized when the child filler is a narrower type of the parent filler.',
  },
  {
    label: 'Forced Mapping To Avoid Dropping',
    description:
      'A child-specific role is mapped to an unrelated parent role merely to avoid a null child_role.',
    examples: ['Child Cutting_instrument forced to parent Manner.', 'Child Speed forced to parent Purpose.'],
    category: 'role_mapping_semantics',
    severity: 'high',
    remediation: 'Drop parent roles with no real counterpart; child-specific roles do not need parent mappings.',
  },
  {
    label: 'Core Parent Role Dropped Without Justification',
    description:
      'A parent core role is dropped even though the child frame appears to preserve that participant structure.',
    examples: ['Buyer dropped for a PURCHASING child.', 'Cut_item dropped for a CUTTING subtype.', 'Speaker dropped for a communication subtype.'],
    category: 'role_mapping_semantics',
    severity: 'high',
    remediation: 'Map the role to the appropriate child counterpart or explain why the inheritance edge is suspect.',
  },
  {
    label: 'Peripheral Role Mapped As Core-Semantic Participant',
    description:
      'A generic peripheral parent role is mapped to a child core participant with a different semantic function.',
    examples: ['Parent Time mapped to child Buyer.', 'Parent Place mapped to child Weapon.', 'Parent Manner mapped to child Message.'],
    category: 'role_mapping_semantics',
    severity: 'high',
    remediation: 'Drop the peripheral role or map it to a genuine peripheral counterpart.',
  },
  {
    label: 'Role Mapping Contradicts Definition',
    description:
      'The mapping says a parent role survives as a child role, but the child definition assigns that role a different function.',
    examples: ['Cutter -> Disarmer, but the definition makes Disarmer the entity being disarmed.', 'Seller -> Buyer, but the definition treats Buyer as the recipient of payment.'],
    category: 'cross_field_consistency',
    severity: 'high',
    remediation: 'Revise the mapping, role definitions, or frame definition so they agree.',
  },
  {
    label: 'Role Mapping Contradicts Role Description',
    description:
      'The parent-child mapping is plausible by name, but the child role description gives it an incompatible function or filler type.',
    examples: ['Parent Message mapped to child Message, but child Message is described as a physical package.', 'Parent Victim mapped to Injured_body_part described as an anatomical region.'],
    category: 'cross_field_consistency',
    severity: 'high',
    remediation: 'Align the child role description with the mapping or change the mapping.',
  },
  {
    label: 'Definition Role And Mapping Name Drift',
    description:
      'The definition, role list, and role mapping use different names for what appears to be the same child participant.',
    examples: ['Definition says Buyer, role list has Purchaser, mapping uses Recipient.', 'Definition says Cut_item, roles use Patient, mapping uses Object.'],
    category: 'cross_field_consistency',
    severity: 'medium',
    remediation: 'Choose one child role name and update all references.',
  },
  {
    label: 'Role Inventory Suggests Wrong Frame Type',
    description:
      'The combined role inventory strongly implies a different frame type than the frame is assigned.',
    examples: ['A State frame has Agent, Patient, Instrument, Purpose, and Result.', 'A Relation frame has only a single state-bearer role.', 'A Category frame has multiple free relata.'],
    category: 'cross_field_consistency',
    severity: 'high',
    remediation: 'Review the frame type or regenerate definition and roles under the fixed type rules.',
  },
  {
    label: 'Definition And Roles Suggest Invalid Parent Edge',
    description:
      'The role mapping drops or mismatches so much of the parent’s core structure that the parent-child inheritance edge may be wrong.',
    examples: ['A communication parent’s Speaker, Message, and Addressee all drop for a physical-contact child.', 'A transfer parent’s Donor, Recipient, and Goods do not map to a supposed child.'],
    category: 'cross_field_consistency',
    severity: 'high',
    remediation: 'Flag the parent-child edge for hierarchy audit; do not hide the mismatch with coerced mappings.',
  },
];

function diagnosisCode(index: number): string {
  return `DR-${String(index + 1).padStart(3, '0')}`;
}

function assertSequentialCodes() {
  if (DIAGNOSES.length > 999) {
    throw new Error('DR code space only supports 999 diagnoses.');
  }
}

async function findConflicts(codes: string[]) {
  const [existingDefinition, existingCodes] = await Promise.all([
    prisma.health_check_definitions.findUnique({
      where: { code: CHECK_DEFINITION.code },
      select: { id: true, code: true, label: true },
    }),
    prisma.health_diagnosis_codes.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, label: true, check_definition_id: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  return { existingDefinition, existingCodes };
}

function printPlan() {
  console.log(`Health check definition: ${CHECK_DEFINITION.code}`);
  console.log(`Label: ${CHECK_DEFINITION.label}`);
  console.log(`Target types: ${CHECK_DEFINITION.target_types.join(', ')}`);
  console.log(`Diagnosis codes: ${DIAGNOSES.length}`);
  console.log('');

  for (const [index, diagnosis] of DIAGNOSES.entries()) {
    console.log(`${diagnosisCode(index)} [${diagnosis.category}/${diagnosis.severity}] ${diagnosis.label}`);
  }
}

async function applySeed() {
  const codes = DIAGNOSES.map((_, index) => diagnosisCode(index));
  const { existingDefinition, existingCodes } = await findConflicts(codes);

  if (existingDefinition) {
    throw new Error(
      `Health check definition ${CHECK_DEFINITION.code} already exists with id ${existingDefinition.id.toString()}.`,
    );
  }

  if (existingCodes.length > 0) {
    throw new Error(
      `Diagnosis code conflicts: ${existingCodes.map((code) => `${code.code} (${code.label})`).join(', ')}`,
    );
  }

  const definition = await prisma.health_check_definitions.create({
    data: {
      code: CHECK_DEFINITION.code,
      label: CHECK_DEFINITION.label,
      description: CHECK_DEFINITION.description,
      target_types: CHECK_DEFINITION.target_types,
      rule_version: CHECK_DEFINITION.rule_version,
      enabled: CHECK_DEFINITION.enabled,
      config: CHECK_DEFINITION.config as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  await prisma.health_diagnosis_codes.createMany({
    data: DIAGNOSES.map((diagnosis, index) => ({
      check_definition_id: definition.id,
      code: diagnosisCode(index),
      label: diagnosis.label,
      description: diagnosis.description,
      examples: diagnosis.examples,
      severity: diagnosis.severity,
      category: diagnosis.category,
      remediation: diagnosis.remediation,
      enabled: true,
    })),
  });

  console.log(`Inserted ${CHECK_DEFINITION.code} as id ${definition.id.toString()}.`);
  console.log(`Inserted ${DIAGNOSES.length} diagnosis codes (${codes[0]}..${codes[codes.length - 1]}).`);
}

async function dryRun() {
  const codes = DIAGNOSES.map((_, index) => diagnosisCode(index));
  const { existingDefinition, existingCodes } = await findConflicts(codes);

  printPlan();
  console.log('');
  console.log('Dry run checks:');
  console.log(`- Definition conflict: ${existingDefinition ? `YES (${existingDefinition.id.toString()})` : 'no'}`);
  console.log(`- Diagnosis code conflicts: ${existingCodes.length}`);

  if (existingCodes.length > 0) {
    for (const code of existingCodes) {
      console.log(`  - ${code.code}: ${code.label} (id ${code.id.toString()})`);
    }
  }

  if (existingDefinition || existingCodes.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('- No writes performed. Re-run with --apply to insert.');
}

async function main() {
  assertSequentialCodes();

  const apply = process.argv.includes('--apply');
  const dry = process.argv.includes('--dry-run') || !apply;

  if (apply && process.argv.includes('--dry-run')) {
    throw new Error('Use either --dry-run or --apply, not both.');
  }

  if (dry) {
    await dryRun();
  } else {
    await applySeed();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
