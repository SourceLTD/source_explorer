export type Mode = 'lexical_units' | 'frames' | 'verbs' | 'nouns' | 'adjectives' | 'adverbs';

export type EditableField =
  | 'code'
  | 'hypernym'
  | 'src_lemmas'
  | 'gloss'
  | 'examples'
  | 'lexfile'
  | 'vendler_class'
  | 'frame'
  | 'roles'
  | 'label'
  | 'definition'
  | 'short_definition'
  | 'frame_roles'
  | 'super_frame_id';

export interface EditableRole {
  id: string;
  clientId: string;
  description: string;
  roleType: string;
  exampleSentence: string;
  main: boolean;
}

export interface EditableRoleGroup {
  id: string;
  description: string;
  role_ids: string[];
}

export interface EditableFrameRole {
  id: string;
  clientId: string;
  description: string;
  notes: string;
  roleType: string;
  main: boolean;
  examples: string[];
}

export interface FieldEditorProps {
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export interface EditingState {
  editingField: EditableField | null;
  editValue: string;
  editListItems: string[];
  editRoles: EditableRole[];
  editRoleGroups: EditableRoleGroup[];
  codeValidationMessage: string;
  selectedHyponymsToMove: Set<string>;
  isSaving: boolean;
}

export interface OverlaySectionsState {
  basicInfo: boolean;
  lexicalProperties: boolean;
  roles: boolean;
  relations: boolean;
  frameProperties: boolean;
  frameRoles: boolean;
}

export interface FrameOption {
  id: string;
  label: string;
}
