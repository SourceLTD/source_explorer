export type Mode = 'lexical_units' | 'concepts' | 'verbs' | 'nouns' | 'adjectives' | 'adverbs';

export type EditableField =
  | 'code'
  | 'hypernym'
  | 'src_lemmas'
  | 'gloss'
  | 'examples'
  | 'lexfile'
  | 'vendler_class'
  | 'concept'
  | 'label'
  | 'definition'
  | 'short_definition'
  | 'subtype'
  | 'archetype'
  | 'state_kind'
  | 'properties'
  | 'parent_of';

export interface EditableConceptProperty {
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
  conceptProperties: boolean;
  properties: boolean;
  conceptRelations: boolean;
}

export interface ConceptOption {
  id: string;
  label: string;
  code?: string | null;
}

