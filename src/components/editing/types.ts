import { GraphNode, RoleType } from '@/lib/types';

export type Mode = 'verbs' | 'nouns' | 'adjectives' | 'adverbs';

export type EditableField =
  | 'code'
  | 'hypernym'
  | 'src_lemmas'
  | 'gloss'
  | 'examples'
  | 'legal_constraints'
  | 'lexfile'
  | 'roles'
  | 'vendler_class'
  | 'frame';

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
  verbProperties: boolean;
  roles: boolean;
  legalConstraints: boolean;
  relations: boolean;
}

export interface FrameOption {
  id: string;
  frame_name: string;
  code?: string | null;
}

