'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  type IssuePriority,
} from '@/lib/issues/types';
import type {
  HealthCheckExecutionKind,
  HealthDiagnosisCode,
  HealthDiagnosisCodeGroup,
  HealthRemediationStrategy,
} from '@/lib/health-checks/types';
import {
  HEALTH_REMEDIATION_STRATEGIES,
  HEALTH_REMEDIATION_STRATEGY_LABELS,
} from '@/lib/health-checks/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (code: HealthDiagnosisCode) => void;
  /** When creating a new code, prefill the parent definition link. */
  defaultDefinitionId?: string | null;
  /**
   * Execution kind of the parent definition. Used to tailor copy
   * (e.g. avoid implying examples go into an LLM prompt for
   * programmatic checks).
   */
  parentExecutionKind?: HealthCheckExecutionKind;
  /**
   * All available diagnosis-code groups. Used to populate the "group"
   * picker so the user can attach this code to an existing family
   * (e.g. `fs_001`). Groups have no leader code; the picker shows the
   * group's own label/key.
   */
  availableGroups?: HealthDiagnosisCodeGroup[];
  diagnosisCode?: HealthDiagnosisCode | null;
}

export default function DiagnosisCodeFormModal({
  isOpen,
  onClose,
  onSaved,
  defaultDefinitionId = null,
  parentExecutionKind = 'llm_batch',
  availableGroups = [],
  diagnosisCode,
}: Props) {
  const isProgrammatic = parentExecutionKind === 'programmatic';
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [examplesText, setExamplesText] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState<IssuePriority>('medium');
  const [enabled, setEnabled] = useState(true);
  const [appliesToFrameTypes, setAppliesToFrameTypes] = useState<string[]>([]);
  const [appliesToFrameSubtypes, setAppliesToFrameSubtypes] = useState<string[]>([]);
  const [matchNullSubtype, setMatchNullSubtype] = useState(false);
  const [remediationStrategy, setRemediationStrategy] =
    useState<HealthRemediationStrategy | null>(null);
  const [remediationNotes, setRemediationNotes] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!diagnosisCode;

  useEffect(() => {
    if (!isOpen) return;
    setCode(diagnosisCode?.code ?? '');
    setTitle(diagnosisCode?.label ?? '');
    setDescription(diagnosisCode?.description ?? '');
    setExamplesText((diagnosisCode?.examples ?? []).join('\n'));
    setCategory(diagnosisCode?.category ?? '');
    setSeverity(diagnosisCode?.severity ?? 'medium');
    setEnabled(diagnosisCode?.enabled ?? true);
    setAppliesToFrameTypes(diagnosisCode?.applies_to_frame_types ?? []);
    setAppliesToFrameSubtypes(diagnosisCode?.applies_to_frame_subtypes ?? []);
    setMatchNullSubtype(diagnosisCode?.match_null_subtype ?? false);
    setRemediationStrategy(diagnosisCode?.remediation_strategy ?? null);
    setRemediationNotes(diagnosisCode?.remediation_notes ?? '');
    setGroupId(diagnosisCode?.group_id ?? null);
    setError(null);
  }, [isOpen, diagnosisCode]);

  const handleSave = async () => {
    setError(null);
    if (!code.trim()) return setError('Code is required');
    if (!title.trim()) return setError('Title is required');

    const examples = examplesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/health-checks/diagnosis-codes/${diagnosisCode!.id}`
        : '/api/health-checks/diagnosis-codes';
      const method = isEdit ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = {
        code: code.trim(),
        label: title.trim(),
        description: description.trim() || null,
        examples,
        category: category.trim() || null,
        severity,
        enabled,
        applies_to_frame_types: appliesToFrameTypes,
        applies_to_frame_subtypes: appliesToFrameSubtypes,
        match_null_subtype: matchNullSubtype,
        remediation_strategy: remediationStrategy,
        remediation_notes: remediationNotes.trim() || null,
        group_id: groupId,
      };
      if (!isEdit && defaultDefinitionId) {
        body.check_definition_id = defaultDefinitionId;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save diagnosis code');
      }
      const saved = (await res.json()) as HealthDiagnosisCode;
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
      title={isEdit ? 'Edit Diagnosis Code' : 'New Diagnosis Code'}
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
              placeholder="e.g. MISSING_CORE_ROLE"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Severity
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IssuePriority)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {ISSUE_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Human-friendly name shown to reviewers"
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
            rows={4}
            placeholder={
              isProgrammatic
                ? 'What does this code mean? What rule violation does it represent?'
                : 'What does this code mean? What does the LLM look for?'
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Examples (one per line)
          </label>
          <textarea
            value={examplesText}
            onChange={(e) => setExamplesText(e.target.value)}
            rows={6}
            placeholder={
              isProgrammatic
                ? 'Concrete examples that should trigger this code.\nUseful as documentation for reviewers and rule authors.'
                : 'Concrete examples that should trigger this code.\nThese are concatenated into the LLM prompt.'
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <p className="mt-1 text-xs text-gray-500">
            Each non-empty line becomes one example. These are loaded into the
            check prompt automatically.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Group (optional)
          </label>
          <select
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value || null)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— None (standalone code) —</option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label} ({g.key})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Cluster this code under a family of related variants (e.g.
            <code className="font-mono"> fs_001</code> for the &ldquo;Wrong
            Frame Sense&rdquo; family). Groups have no leader code; severity,
            examples, and frame targeting are per-code, not inherited from
            the group. Leave empty for codes that have no related variants.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category (optional)
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. semantics, structure"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <div className="flex items-center gap-2">
              <input
                id="diag-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="diag-enabled" className="text-sm text-gray-700">
                Enabled
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Remediation (optional)
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strategy
              </label>
              <select
                value={remediationStrategy ?? ''}
                onChange={(e) =>
                  setRemediationStrategy(
                    e.target.value
                      ? (e.target.value as HealthRemediationStrategy)
                      : null,
                  )
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No strategy yet —</option>
                {HEALTH_REMEDIATION_STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {HEALTH_REMEDIATION_STRATEGY_LABELS[strategy]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Stable action category using DB entity language. This is a
                routing hint only; it does not execute changes.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={remediationNotes}
                onChange={(e) => setRemediationNotes(e.target.value)}
                rows={3}
                placeholder="Optional local guidance for how to apply this strategy."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Frame Targeting (optional)
          </h4>
          <p className="text-xs text-gray-500 mb-3">
            Restrict when this diagnosis code applies. Leave both lists empty to
            apply to every frame.
          </p>
          <div className="space-y-3">
            <ChipInput
              label="Applies to frame types"
              values={appliesToFrameTypes}
              onChange={setAppliesToFrameTypes}
              placeholder="e.g. State (press Enter)"
              hint="Empty = any frame_type."
            />
            <ChipInput
              label="Applies to frame subtypes"
              values={appliesToFrameSubtypes}
              onChange={setAppliesToFrameSubtypes}
              placeholder="e.g. relation (press Enter)"
              hint={
                matchNullSubtype && appliesToFrameSubtypes.length === 0
                  ? 'Currently: only frames whose subtype IS NULL.'
                  : matchNullSubtype
                    ? 'Listed values OR frames whose subtype IS NULL.'
                    : appliesToFrameSubtypes.length === 0
                      ? 'Empty = any subtype (including NULL).'
                      : 'Only frames whose subtype is one of the listed values.'
              }
            />
            <div className="flex items-center gap-2">
              <input
                id="diag-match-null-subtype"
                type="checkbox"
                checked={matchNullSubtype}
                onChange={(e) => setMatchNullSubtype(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label
                htmlFor="diag-match-null-subtype"
                className="text-sm text-gray-700"
              >
                Also match frames whose subtype is NULL
              </label>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface ChipInputProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
}

function ChipInput({ label, values, onChange, placeholder, hint }: ChipInputProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  };

  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 border border-gray-300 rounded-md px-2 py-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500">
        {values.map((v, idx) => (
          <span
            key={`${v}-${idx}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 text-xs"
          >
            {v}
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="text-blue-500 hover:text-blue-800"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
              e.preventDefault();
              removeAt(values.length - 1);
            }
          }}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] text-sm focus:outline-none"
        />
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
