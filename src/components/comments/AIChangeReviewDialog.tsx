'use client';

import React from 'react';
import { CheckIcon, XMarkIcon, PencilIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Modal } from '@/components/ui';
import type { AIReviewSuggestion } from './ChangeCommentsBoard';

interface AIChangeReviewDialogProps {
  suggestion: AIReviewSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}

const ACTION_CONFIG = {
  approve: {
    icon: CheckIcon,
    label: 'Approve Changes',
    description: 'The AI recommends approving all pending changes as-is.',
    color: 'green',
    buttonText: 'Approve All',
  },
  reject: {
    icon: XMarkIcon,
    label: 'Reject Changes',
    description: 'The AI recommends rejecting all pending changes.',
    color: 'red',
    buttonText: 'Reject All',
  },
  modify: {
    icon: PencilIcon,
    label: 'Modify Changes',
    description: 'The AI suggests modifications to the pending changes.',
    color: 'amber',
    buttonText: 'Apply Modifications',
  },
  keep_as_is: {
    icon: ArrowPathIcon,
    label: 'Keep As-Is',
    description: 'The AI recommends leaving the pending changes unchanged for further review.',
    color: 'gray',
    buttonText: 'Keep Unchanged',
  },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string') return value || '(empty string)';
  if (Array.isArray(value)) return value.join(', ') || '(empty array)';
  return JSON.stringify(value);
}

const colorMap = {
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-600',
    badge: 'bg-green-100 text-green-800',
    button: 'bg-green-600 hover:bg-green-700',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-600',
    badge: 'bg-red-100 text-red-800',
    button: 'bg-red-600 hover:bg-red-700',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-800',
    button: 'bg-amber-600 hover:bg-amber-700',
  },
  gray: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: 'text-gray-600',
    badge: 'bg-gray-100 text-gray-800',
    button: 'bg-gray-600 hover:bg-gray-700',
  },
};

export default function AIChangeReviewDialog({
  suggestion,
  onApply,
  onDismiss,
}: AIChangeReviewDialogProps) {
  const config = ACTION_CONFIG[suggestion.action as keyof typeof ACTION_CONFIG];
  
  // Fallback if action is not recognized
  if (!config) {
    console.error('Unknown action type:', suggestion.action);
    return (
      <Modal isOpen={true} onClose={onDismiss} maxWidth="md">
        <div className="p-6 text-center">
          <p className="text-red-600 font-medium">Error: Unknown action type &quot;{suggestion.action}&quot;</p>
          <p className="text-sm text-gray-500 mt-2">The AI returned an unexpected response format.</p>
          <button
            onClick={onDismiss}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Dismiss
          </button>
        </div>
      </Modal>
    );
  }
  
  const Icon = config.icon;
  const colorClasses = colorMap[config.color as keyof typeof colorMap];

  const customHeader = (
    <div className={`flex items-center gap-3 w-full -mx-6 -my-4 px-6 py-4 ${colorClasses.bg} border-b ${colorClasses.border}`}>
      <div className={`p-2 rounded-lg ${colorClasses.badge}`}>
        <Icon className={`w-5 h-5 ${colorClasses.icon}`} />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{config.label}</h3>
        <p className="text-sm text-gray-600">{config.description}</p>
      </div>
      <div className="ml-auto">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClasses.badge}`}>
          {Math.round(suggestion.confidence * 100)}% confident
        </span>
      </div>
    </div>
  );

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        onClick={onDismiss}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
      >
        Dismiss
      </button>
      <button
        onClick={onApply}
        className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors cursor-pointer ${colorClasses.button}`}
      >
        {config.buttonText}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onDismiss}
      maxWidth="2xl"
      customHeader={customHeader}
      showCloseButton={false}
      footer={footer}
      className="shadow-2xl"
    >
      <div className="p-6 space-y-4">
        {/* Justification */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">AI Justification</h4>
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{suggestion.justification}</p>
          </div>
        </div>

        {/* Modifications Preview (if action is modify) */}
        {suggestion.action === 'modify' && suggestion.modifications && Object.keys(suggestion.modifications).length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Suggested Modifications</h4>
            <div className="space-y-2">
              {Object.entries(suggestion.modifications).map(([fieldName, newValue]) => {
                const currentField = suggestion.currentFieldChanges.find(fc => fc.field_name === fieldName);
                const currentNewValue = currentField?.new_value;
                
                return (
                  <div key={fieldName} className="p-3 bg-white rounded-lg border border-gray-200">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      {fieldName}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-gray-400 block mb-1">Current pending value:</span>
                        <code className="block p-2 bg-red-50 text-red-800 rounded text-xs break-all">
                          {formatValue(currentNewValue)}
                        </code>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400 block mb-1">AI suggested value:</span>
                        <code className="block p-2 bg-green-50 text-green-800 rounded text-xs break-all">
                          {formatValue(newValue)}
                        </code>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current Changes Summary (for approve/reject) */}
        {(suggestion.action === 'approve' || suggestion.action === 'reject') && suggestion.currentFieldChanges.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Current Pending Changes</h4>
            <div className="space-y-2">
              {suggestion.currentFieldChanges.map((fc, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border border-gray-200">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    {fc.field_name}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-gray-400 block mb-1">Original:</span>
                      <code className="block p-2 bg-gray-50 text-gray-700 rounded text-xs break-all">
                        {formatValue(fc.old_value)}
                      </code>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block mb-1">Pending:</span>
                      <code className="block p-2 bg-blue-50 text-blue-800 rounded text-xs break-all">
                        {formatValue(fc.new_value)}
                      </code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
