'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';
import {
  Issue,
  IssueStatus,
  IssuePriority,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_PRIORITY_LABELS,
} from '@/lib/issues/types';
import {
  HEALTH_REMEDIATION_STRATEGY_LABELS,
  type HealthDiagnosisCode,
  type HealthRemediationStrategy,
} from '@/lib/health-checks/types';

interface IssueFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (issue: Issue) => void;
  issue?: Issue | null;
}

/**
 * Render one diagnosis-code dropdown option as
 * `<code> · <label> → <strategy>`. The arrow + strategy suffix is
 * dropped when the code has no `remediation_strategy` set (rare —
 * catalogued codes almost always route somewhere, even if it's the
 * `manual_review` sentinel). Keeps the dropdown browsable without
 * forcing the reviewer to open each code to see how it'll be
 * remediated.
 */
function formatDiagnosisCodeOption(c: HealthDiagnosisCode): string {
  const head = `${c.code} · ${c.label}`;
  if (!c.remediation_strategy) return head;
  const label =
    HEALTH_REMEDIATION_STRATEGY_LABELS[
      c.remediation_strategy as HealthRemediationStrategy
    ] ?? c.remediation_strategy;
  return `${head} → ${label}`;
}

export default function IssueFormModal({
  isOpen,
  onClose,
  onSaved,
  issue,
}: IssueFormModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<IssueStatus>('open');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [labelsText, setLabelsText] = useState('');
  const [diagnosisCodeId, setDiagnosisCodeId] = useState<string>('');
  const [diagnosisCodes, setDiagnosisCodes] = useState<HealthDiagnosisCode[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!issue;

  useEffect(() => {
    if (isOpen) {
      setTitle(issue?.title ?? '');
      setDescription(issue?.description ?? '');
      setStatus(issue?.status ?? 'open');
      setPriority(issue?.priority ?? 'medium');
      setLabelsText((issue?.labels ?? []).join(', '));
      setDiagnosisCodeId(issue?.diagnosis_code_id ?? '');
      setError(null);
    }
  }, [isOpen, issue]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/health-checks/diagnosis-codes?enabled=true');
        if (!res.ok) return;
        const data = (await res.json()) as { diagnosis_codes: HealthDiagnosisCode[] };
        if (!cancelled) setDiagnosisCodes(data.diagnosis_codes);
      } catch {
        // Non-critical; the dropdown just stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError(null);

    const labels = labelsText
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      labels,
      diagnosis_code_id: diagnosisCodeId === '' ? null : diagnosisCodeId,
    };

    try {
      const url = isEdit ? `/api/issues/${issue!.id}` : '/api/issues';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save issue');
      }
      const saved = (await res.json()) as Issue;
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save issue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Issue' : 'New Issue'}
      maxWidth="4xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && (
            <span className="mr-auto text-sm text-red-600">{error}</span>
          )}
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Issue'}
          </button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary"
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
            rows={10}
            placeholder="What's the issue?"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IssueStatus)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as IssuePriority)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
            Labels (comma separated)
          </label>
          <input
            type="text"
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            placeholder="bug, docs"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Health Check Diagnosis (optional)
          </label>
          <select
            value={diagnosisCodeId}
            onChange={(e) => setDiagnosisCodeId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— None —</option>
            {diagnosisCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDiagnosisCodeOption(c)}
              </option>
            ))}
          </select>
          {/*
            * Help block. When the reviewer picks a diagnosis code we
            * surface the routed remediation strategy and any
            * catalogue-supplied notes so they know what the planner
            * will attempt before the issue lands. Mirrors the
            * "Strategy" select on IssueDetailPanel, but read-only —
            * after creation the per-issue strategy_override can be
            * flipped from there if needed.
            */}
          {diagnosisCodeId &&
            (() => {
              const selected = diagnosisCodes.find(
                (c) => c.id === diagnosisCodeId,
              );
              if (!selected) return null;
              const strategy = selected.remediation_strategy;
              const strategyLabel = strategy
                ? HEALTH_REMEDIATION_STRATEGY_LABELS[
                    strategy as HealthRemediationStrategy
                  ] ?? strategy
                : null;
              const notes = selected.remediation_notes?.trim() ?? '';
              return (
                <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 space-y-1">
                  <div>
                    <span className="font-semibold">Planner will route to:</span>{' '}
                    {strategyLabel ? (
                      <span className="font-mono">{strategyLabel}</span>
                    ) : (
                      <span className="italic text-blue-700">
                        no automated strategy (manual triage only)
                      </span>
                    )}
                  </div>
                  {notes && (
                    <div className="text-blue-800">
                      <span className="font-semibold">Notes:</span> {notes}
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    </Modal>
  );
}
