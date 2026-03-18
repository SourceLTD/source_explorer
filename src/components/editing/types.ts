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
  | 'label'
  | 'definition'
  | 'short_definition'
  | 'frame_roles'
  | 'super_frame_id';

export interface EditableFrameRole {
  id: string;
  clientId: string;
  label: string;
  description: string;
  notes: string;
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
  codeValidationMessage: string;
  selectedHyponymsToMove: Set<string>;
  isSaving: boolean;
}

export interface OverlaySectionsState {
  basicInfo: boolean;
  lexicalProperties: boolean;
  relations: boolean;
  frameProperties: boolean;
  frameRoles: boolean;
}

export interface FrameOption {
  id: string;
  label: string;
  code?: string | null;
}
