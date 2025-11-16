import React from 'react';
import { FieldEditorProps, Mode } from './types';

interface LexfileSelectorProps extends FieldEditorProps {
  value: string;
  onChange: (value: string) => void;
  mode: Mode;
}

const LEXFILE_OPTIONS: Record<Mode, string[]> = {
  verbs: [
    'verb.body', 'verb.change', 'verb.cognition', 'verb.communication', 
    'verb.competition', 'verb.consumption', 'verb.contact', 'verb.creation', 
    'verb.emotion', 'verb.motion', 'verb.perception', 'verb.possession', 
    'verb.social', 'verb.stative', 'verb.weather'
  ],
  nouns: [
    'noun.Tops', 'noun.act', 'noun.animal', 'noun.artifact', 'noun.attribute', 
    'noun.body', 'noun.cognition', 'noun.communication', 'noun.event', 
    'noun.feeling', 'noun.food', 'noun.group', 'noun.location', 'noun.motive', 
    'noun.object', 'noun.person', 'noun.phenomenon', 'noun.plant', 
    'noun.possession', 'noun.process', 'noun.quantity', 'noun.relation', 
    'noun.shape', 'noun.state', 'noun.substance', 'noun.time'
  ],
  adjectives: ['adj.all', 'adj.pert', 'adj.ppl'],
  adverbs: ['adv.all']
};

export function LexfileSelector({ value, onChange, mode, onSave, onCancel, isSaving }: LexfileSelectorProps) {
  const options = LEXFILE_OPTIONS[mode] || [];

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      >
        {options.map(lf => (
          <option key={lf} value={lf}>{lf}</option>
        ))}
      </select>
      <div className="flex space-x-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

