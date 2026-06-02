'use client';

import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ClassifierGuidanceModalProps {
  label: string;
  guidance: string;
  onClose: () => void;
}

export default function ClassifierGuidanceModal({
  label,
  guidance,
  onClose,
}: ClassifierGuidanceModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={onClose}
      />

      <div
        className="bg-white rounded-xl w-[90vw] max-w-2xl mx-4 max-h-[80vh] overflow-hidden relative z-10 flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Classifier Guidance</h2>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            title="Close (Esc)"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <main className="flex-1 overflow-y-auto p-5">
          <div className="chat-markdown prose prose-sm max-w-none text-sm text-gray-700 leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {guidance}
            </ReactMarkdown>
          </div>
        </main>
      </div>
    </div>
  );
}
