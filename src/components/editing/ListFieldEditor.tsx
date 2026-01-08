import React from 'react';
import { FieldEditorProps } from './types';

interface ListFieldEditorProps extends FieldEditorProps {
  items: string[];
  onItemChange: (index: number, value: string) => void;
  onItemAdd: () => void;
  onItemRemove: (index: number) => void;
  itemType: 'text' | 'textarea';
  placeholder: string;
  addButtonText: string;
}

export function ListFieldEditor({ 
  items,
  onItemChange,
  onItemAdd,
  onItemRemove,
  itemType,
  placeholder,
  addButtonText,
  onSave, 
  onCancel, 
  isSaving 
}: ListFieldEditorProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className={`flex items-${itemType === 'textarea' ? 'start' : 'center'} space-x-2`}>
            {itemType === 'textarea' ? (
              <textarea
                value={item}
                onChange={(e) => onItemChange(index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
                rows={2}
                placeholder={placeholder}
              />
            ) : (
              <input
                type="text"
                value={item}
                onChange={(e) => onItemChange(index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder={placeholder}
              />
            )}
            <button
              onClick={() => onItemRemove(index)}
              className="p-2 text-red-500 hover:bg-red-50 rounded cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onItemAdd}
        className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
      >
        {addButtonText}
      </button>
      <div className="flex space-x-2 pt-2">
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

