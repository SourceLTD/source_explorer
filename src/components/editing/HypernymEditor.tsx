import React from 'react';
import { GraphNode } from '@/lib/types';
import { FieldEditorProps, Mode } from './types';
import SearchBox from '@/components/SearchBox';

interface HypernymEditorProps extends FieldEditorProps {
  currentNode: GraphNode;
  value: string;
  onChange: (value: string) => void;
  selectedHyponymsToMove: Set<string>;
  onHyponymToggle: (hyponymId: string) => void;
  validationMessage: string;
  mode: Mode;
}

export function HypernymEditor({ 
  currentNode,
  value, 
  onChange, 
  selectedHyponymsToMove,
  onHyponymToggle,
  validationMessage,
  mode,
  onSave, 
  onCancel, 
  isSaving 
}: HypernymEditorProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {/* Current Hypernym */}
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800 font-medium mb-1">Current Hypernym:</p>
          <p className="text-sm text-gray-900">
            {currentNode.parents[0]?.id || <span className="text-gray-500 italic">None</span>}
          </p>
        </div>

        {/* Search for New Hypernym */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Search for New Hypernym:
          </label>
          <SearchBox
            onSelectResult={(result) => {
              onChange(result.id);
            }}
            placeholder="Search entries..."
            mode={mode}
          />
        </div>

        {/* Selected New Hypernym */}
        {value && value !== currentNode.parents[0]?.id && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs text-green-800 font-medium mb-1">New Hypernym:</p>
            <p className="text-sm text-gray-900">{value}</p>
          </div>
        )}

        {/* Hyponyms to Move */}
        {currentNode.children.length > 0 && value && value !== currentNode.parents[0]?.id && (
          <div className="border-t pt-3">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Manage Hyponyms ({currentNode.children.length} total)
            </h4>
            <p className="text-xs text-gray-600 mb-3">
              Select which hyponyms should move with this entry to the new hypernym.
              Unchecked hyponyms will stay and become children of the old hypernym.
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {currentNode.children.map((child) => (
                <label 
                  key={child.id}
                  className="flex items-start gap-2 p-2 hover:bg-white rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedHyponymsToMove.has(child.id)}
                    onChange={(e) => {
                      onHyponymToggle(child.id);
                    }}
                    className="mt-0.5 rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{child.id}</p>
                    <p className="text-xs text-gray-600">{child.gloss}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <p className="text-blue-900">
                <strong>{selectedHyponymsToMove.size}</strong> will move with this entry
              </p>
              <p className="text-blue-900">
                <strong>{currentNode.children.length - selectedHyponymsToMove.size}</strong> will stay with old hypernym
              </p>
            </div>
          </div>
        )}

        {validationMessage && (
          <p className="text-xs text-blue-600 font-medium">
            {validationMessage}
          </p>
        )}
      </div>

      <div className="flex space-x-2 pt-2">
        <button
          onClick={onSave}
          disabled={isSaving || !value}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Updating Relations...' : 'Save Changes'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

