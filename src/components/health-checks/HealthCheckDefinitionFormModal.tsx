'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import {
  HEALTH_CHECK_ENTITY_TYPES,
  HEALTH_CHECK_EXECUTION_KIND_LABELS,
  type HealthCheckDefinition,
  type HealthCheckEntityType,
  type HealthCheckExecutionKind,
} from '@/lib/health-checks/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (def: HealthCheckDefinition) => void;
  definition?: HealthCheckDefinition | null;
}

export default function HealthCheckDefinitionFormModal({
  isOpen,
  onClose,
  onSaved,
  definition,
}: Props) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [ruleVersion, setRuleVersion] = useState(1);
  const [enabled, setEnabled] = useState(true);
  const [executionKind, setExecutionKind] = useState<HealthCheckExecutionKind>('llm_batch');
  const [targetTypes, setTargetTypes] = useState<HealthCheckEntityType[]>([]);
  const [configText, setConfigText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!definition;

  useEffect(() => {
    if (!isOpen) return;
    setCode(definition?.code ?? '');
    setLabel(definition?.label ?? '');
    setDescription(definition?.description ?? '');
    setRuleVersion(definition?.rule_version ?? 1);
    setEnabled(definition?.enabled ?? true);
    setExecutionKind(definition?.execution_kind ?? 'llm_batch');
    setTargetTypes(definition?.target_types ?? []);
    setConfigText(
      definition?.config ? JSON.stringify(definition.config, null, 2) : '',
    );
    setError(null);
  }, [isOpen, definition]);

  const toggleTargetType = (t: HealthCheckEntityType) => {
    setTargetTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const handleSave = async () => {
    setError(null);
    if (!code.trim()) return setError('Code is required');
    if (!label.trim()) return setError('Label is required');

    let config: unknown = null;
    if (configText.trim()) {
      try {
        config = JSON.parse(configText);
      } catch {
        return setError('Config must be valid JSON (or empty)');
      }
    }

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/health-checks/definitions/${definition!.id}`
        : '/api/health-checks/definitions';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          label: label.trim(),
          description: description.trim() || null,
          rule_version: ruleVersion,
          enabled,
          execution_kind: isEdit ? executionKind : 'llm_batch',
          target_types: targetTypes,
          config,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save definition');
      }
      const saved = (await res.json()) as HealthCheckDefinition;
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Health Check' : 'New LLM Health Check'}
      maxWidth="2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <span className="mr-auto text-sm text-red-600">{error}</span>}
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. FRAME_DEFINITION_QUALITY"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rule version
            </label>
            <input
              type="number"
              min={1}
              value={ruleVersion}
              onChange={(e) => setRuleVersion(Number(e.target.value) || 1)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Human-friendly name"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Execution kind
          </label>
          <div className="inline-flex px-3 py-1.5 rounded-md border border-violet-300 bg-violet-100 text-violet-800 text-xs font-medium">
            {HEALTH_CHECK_EXECUTION_KIND_LABELS[executionKind]}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            New health checks created here are LLM-bound. Programmatic definitions are
            managed by code and are not editable in this UI.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target entity types
          </label>
          <div className="flex flex-wrap gap-2">
            {HEALTH_CHECK_ENTITY_TYPES.map((t) => {
              const active = targetTypes.includes(t);
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggleTargetType(t)}
                  className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Config (JSON, optional)
          </label>
          <textarea
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            rows={6}
            placeholder='{"prompt_template": "..."}'
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="hcdef-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="hcdef-enabled" className="text-sm text-gray-700">
            Enabled
          </label>
        </div>
      </div>
    </Modal>
  );
}
