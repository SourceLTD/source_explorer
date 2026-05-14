'use client';

import React, { useState } from 'react';
import { Frame } from '@/lib/types';
import {
  HEALTH_REMEDIATION_STRATEGY_LABELS,
  type HealthRemediationStrategy,
} from '@/lib/health-checks/types';
import LoadingSpinner from '@/components/LoadingSpinner';

interface AIRemediationPanelProps {
  frame: Frame;
  onUpdate: () => Promise<void>;
}

type ClassificationResult = {
  strategy: HealthRemediationStrategy;
  label: string;
  confidence: string;
};

export function AIRemediationPanel({ frame, onUpdate }: AIRemediationPanelProps) {
  const [description, setDescription] = useState('');
  const [justification, setJustification] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClassify = async () => {
    if (!description.trim()) return;
    setClassifying(true);
    setError(null);
    setClassification(null);
    try {
      const response = await fetch(`/api/frames/${frame.id}/classify-remediation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Classification failed (${response.status})`);
      }
      const data: ClassificationResult = await response.json();
      setClassification(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to classify');
    } finally {
      setClassifying(false);
    }
  };

  const handleSchedule = async () => {
    if (!classification) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/frames/${frame.id}/trigger-remediation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: classification.strategy,
          description: description.trim(),
          justification: justification.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setResult(data);
      await onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule remediation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setDescription('');
    setJustification('');
    setClassification(null);
    setResult(null);
    setError(null);
  };

  if (result) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Remediation Scheduled</h3>
        <p className="text-sm text-gray-600 mb-6">{result.message}</p>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Schedule Another
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          What do you want to do?
        </label>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (classification) setClassification(null);
          }}
          placeholder={`e.g. "Move this frame under MOTION", "Split into separate verb and noun frames", "Update the definition to be more specific"...`}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Justification <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder="Why should this change be made? This context will inform the AI remediation..."
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {!classification && (
        <button
          onClick={handleClassify}
          disabled={!description.trim() || classifying}
          className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
            description.trim() && !classifying
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {classifying ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size="sm" noPadding />
              Classifying...
            </span>
          ) : (
            'Next'
          )}
        </button>
      )}

      {classification && (
        <div className="space-y-3">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                Classified Strategy
              </span>
              {classification.confidence === 'low' && (
                <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                  Low confidence
                </span>
              )}
            </div>
            <p className="text-base font-semibold text-gray-900">
              {classification.label}
            </p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {classification.strategy}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Start Over
            </button>
            <button
              onClick={handleSchedule}
              disabled={submitting}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                !submitting
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-300 text-white cursor-not-allowed'
              }`}
            >
              {submitting ? 'Scheduling...' : 'Confirm & Schedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
