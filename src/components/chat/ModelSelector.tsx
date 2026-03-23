'use client';

import { useState } from 'react';
import { chatModels } from '@/lib/chat/models';
import { saveChatModelAsCookie } from '@/lib/chat/actions';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface ModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
}

export default function ModelSelector({ selectedModelId, onModelChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const current = chatModels.find((m) => m.id === selectedModelId) || chatModels[0];

  const handleSelect = (modelId: string) => {
    onModelChange(modelId);
    saveChatModelAsCookie(modelId);
    setIsOpen(false);
  };

  return (
    <div className="relative" data-testid="model-selector">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
      >
        {current.name}
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1">
            {chatModels.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => handleSelect(model.id)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors ${
                  model.id === current.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="text-sm font-medium text-gray-900">{model.name}</div>
                <div className="text-xs text-gray-500">{model.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
