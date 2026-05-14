'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowPathIcon,
  PlusIcon,
  PlayIcon,
  PencilSquareIcon,
  TrashIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../LoadingSpinner';
import HealthCheckDefinitionFormModal from './HealthCheckDefinitionFormModal';
import DiagnosisCodeFormModal from './DiagnosisCodeFormModal';
import {
  HEALTH_CHECK_EXECUTION_KIND_LABELS,
  HEALTH_CHECK_EXECUTION_KIND_STYLES,
  HEALTH_CHECK_RUN_STATUS_LABELS,
  HEALTH_CHECK_RUN_STATUS_STYLES,
  HEALTH_REMEDIATION_STRATEGY_LABELS,
  type HealthCheckDefinition,
  type HealthCheckExecutionKind,
  type HealthCheckRunSummary,
  type HealthDiagnosisCode,
  type HealthDiagnosisCodeGroup,
} from '@/lib/health-checks/types';

function ExecutionKindBadge({ kind }: { kind: HealthCheckExecutionKind | null }) {
  if (!kind) return null;
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${HEALTH_CHECK_EXECUTION_KIND_STYLES[kind]}`}
      title={
        kind === 'programmatic'
          ? 'Runs are produced by an in-process programmatic worker (no LLM).'
          : 'Runs are produced by the source-llm batch worker.'
      }
    >
      {HEALTH_CHECK_EXECUTION_KIND_LABELS[kind]}
    </span>
  );
}

interface DefinitionWithCodes extends HealthCheckDefinition {
  diagnosis_codes: HealthDiagnosisCode[];
}

type DiagnosisCodeFilter = 'all' | 'scoped' | 'standalone' | 'disabled';

export default function HealthChecksBoard() {
  const [definitions, setDefinitions] = useState<HealthCheckDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [defFormOpen, setDefFormOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<HealthCheckDefinition | null>(null);

  const llmDefinitions = definitions.filter(
    (def) => (def.execution_kind ?? 'llm_batch') === 'llm_batch',
  );
  const programmaticDefinitions = definitions.filter(
    (def) => def.execution_kind === 'programmatic',
  );

  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health-checks/definitions');
      if (!res.ok) throw new Error('Failed to load definitions');
      const data = (await res.json()) as { definitions: HealthCheckDefinition[] };
      setDefinitions(data.definitions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  const handleToggleEnabled = async (def: HealthCheckDefinition) => {
    const res = await fetch(`/api/health-checks/definitions/${def.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !def.enabled }),
    });
    if (res.ok) {
      const updated = (await res.json()) as HealthCheckDefinition;
      setDefinitions((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    }
  };

  const handleDelete = async (def: HealthCheckDefinition) => {
    if (
      !confirm(
        `Delete health check "${def.label}"? This will also delete its runs and state.`,
      )
    )
      return;
    const res = await fetch(`/api/health-checks/definitions/${def.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setDefinitions((prev) => prev.filter((d) => d.id !== def.id));
      if (selectedId === def.id) setSelectedId(null);
    }
  };

  if (selectedId) {
    return (
      <DefinitionDetail
        definitionId={selectedId}
        onBack={() => setSelectedId(null)}
        onUpdated={(updated) => {
          setDefinitions((prev) =>
            prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)),
          );
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2 shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">Health Checks</h2>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={loadDefinitions}
            className="p-1.5 rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            title="Refresh"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : (
          <div className="p-4 space-y-6">
            <DefinitionsSection
              title="Programmatic Health Checks"
              description="Managed by source code / runner jobs. These definitions are immutable here."
              definitions={programmaticDefinitions}
              immutable
              onSelect={setSelectedId}
            />
            <DefinitionsSection
              title="LLM-bound Health Checks"
              description="User-managed checks queued for the LLM batch worker."
              definitions={llmDefinitions}
              onSelect={setSelectedId}
              onToggleEnabled={handleToggleEnabled}
              onEdit={(def) => {
                setEditingDef(def);
                setDefFormOpen(true);
              }}
              onDelete={handleDelete}
              onCreate={() => {
                setEditingDef(null);
                setDefFormOpen(true);
              }}
            />
          </div>
        )}
      </div>

      <HealthCheckDefinitionFormModal
        isOpen={defFormOpen}
        onClose={() => setDefFormOpen(false)}
        definition={editingDef}
        onSaved={(saved) => {
          setDefinitions((prev) => {
            const existing = prev.find((d) => d.id === saved.id);
            return existing
              ? prev.map((d) => (d.id === saved.id ? saved : d))
              : [saved, ...prev];
          });
        }}
      />
    </div>
  );
}

interface DefinitionsSectionProps {
  title: string;
  description: string;
  definitions: HealthCheckDefinition[];
  immutable?: boolean;
  onSelect: (id: string) => void;
  onToggleEnabled?: (def: HealthCheckDefinition) => void;
  onEdit?: (def: HealthCheckDefinition) => void;
  onDelete?: (def: HealthCheckDefinition) => void;
  onCreate?: () => void;
}

function DefinitionsSection({
  title,
  description,
  definitions,
  immutable = false,
  onSelect,
  onToggleEnabled,
  onEdit,
  onDelete,
  onCreate,
}: DefinitionsSectionProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">{definitions.length}</span>
          {onCreate && (
            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New LLM Health Check
            </button>
          )}
        </div>
      </div>
      {definitions.length === 0 ? (
        <div className="px-4 py-6 text-sm text-gray-500 italic">
          No health checks in this category.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-4 py-2 text-left w-16">ID</th>
              <th className="px-4 py-2 text-left">Label</th>
              <th className="px-4 py-2 text-left w-28">Kind</th>
              <th className="px-4 py-2 text-left w-40">Targets</th>
              <th className="px-4 py-2 text-left w-24">Version</th>
              <th className="px-4 py-2 text-left w-24">Enabled</th>
              <th className="px-4 py-2 text-right w-32">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {definitions.map((def) => (
              <tr
                key={def.id}
                onClick={() => onSelect(def.id)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-2 font-mono text-xs text-gray-500">
                  #{def.id}
                </td>
                <td className="px-4 py-2 text-gray-900">{def.label}</td>
                <td className="px-4 py-2">
                  <ExecutionKindBadge kind={def.execution_kind ?? 'llm_batch'} />
                </td>
                <td className="px-4 py-2 text-gray-700 text-xs">
                  {def.target_types.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    def.target_types.join(', ')
                  )}
                </td>
                <td className="px-4 py-2 text-gray-700">v{def.rule_version}</td>
                <td className="px-4 py-2">
                  {immutable ? (
                    <span className="text-xs text-gray-600">
                      {def.enabled ? 'On' : 'Off'}
                    </span>
                  ) : (
                    <label
                      className="inline-flex items-center cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={def.enabled}
                        onChange={() => onToggleEnabled?.(def)}
                        className="rounded border-gray-300"
                      />
                      <span className="ml-2 text-xs text-gray-600">
                        {def.enabled ? 'On' : 'Off'}
                      </span>
                    </label>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {immutable ? (
                    <span className="text-xs text-gray-400">Managed</span>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit?.(def);
                        }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-500"
                        title="Edit"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete?.(def);
                        }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-500 ml-1"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface DefinitionDetailProps {
  definitionId: string;
  onBack: () => void;
  onUpdated: (def: HealthCheckDefinition) => void;
}

function DefinitionDetail({ definitionId, onBack, onUpdated }: DefinitionDetailProps) {
  const [def, setDef] = useState<DefinitionWithCodes | null>(null);
  const [runs, setRuns] = useState<HealthCheckRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defFormOpen, setDefFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'codes' | 'runs'>('codes');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [defRes, runsRes] = await Promise.all([
        fetch(`/api/health-checks/definitions/${definitionId}`),
        fetch(`/api/health-checks/runs?definition_id=${definitionId}&limit=20`),
      ]);
      if (!defRes.ok) throw new Error('Failed to load definition');
      const defData = (await defRes.json()) as DefinitionWithCodes;
      setDef(defData);
      if (runsRes.ok) {
        const runsData = (await runsRes.json()) as { runs: HealthCheckRunSummary[] };
        setRuns(runsData.runs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [definitionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const queueRun = async () => {
    if (!def) return;
    const res = await fetch('/api/health-checks/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ check_definition_id: def.id }),
    });
    if (res.ok) {
      const run = (await res.json()) as HealthCheckRunSummary;
      setRuns((prev) => [run, ...prev]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !def) {
    return (
      <div className="p-6">
        <button
          onClick={onBack}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <ChevronLeftIcon className="w-4 h-4" /> Back
        </button>
        <div className="mt-4 text-red-600 text-sm">{error ?? 'Not found'}</div>
      </div>
    );
  }

  const definitionIsImmutable = def.execution_kind === 'programmatic';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-2 shrink-0">
        <button
          onClick={onBack}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          <ChevronLeftIcon className="w-4 h-4" /> Back
        </button>
        <div className="ml-2">
          <div className="font-mono text-xs text-gray-500">{def.code}</div>
          <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            {def.label}
            <ExecutionKindBadge kind={def.execution_kind ?? 'llm_batch'} />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void queueRun()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
            title={
              def.execution_kind === 'programmatic'
                ? 'Queue a programmatic run (picked up by the rule worker)'
                : 'Queue an LLM batch run (picked up by the source-llm worker)'
            }
          >
            <PlayIcon className="w-4 h-4" />
            Queue Run
          </button>
          {definitionIsImmutable ? (
            <span className="px-3 py-1.5 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500">
              Managed by code
            </span>
          ) : (
            <button
              onClick={() => setDefFormOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50"
            >
              <PencilSquareIcon className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 overflow-hidden">
        <section className="rounded-lg border border-gray-200 bg-white px-3 py-2 shrink-0">
          <div className="grid grid-cols-[minmax(120px,220px)_80px_minmax(0,1fr)] gap-4 text-sm items-start">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mr-2">
                Targets
              </span>
              <span className="text-gray-800 text-xs">
                {def.target_types.length === 0 ? '—' : def.target_types.join(', ')}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mr-2">
                Version
              </span>
              <span className="text-gray-800 text-xs">v{def.rule_version}</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mr-2">
                Description
              </span>
              <span className="text-gray-700 text-xs">
                {def.description ?? <span className="text-gray-400">—</span>}
              </span>
            </div>
          </div>
        </section>

        <div className="shrink-0 border-b border-gray-200 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('codes')}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              activeTab === 'codes'
                ? 'border-blue-600 text-blue-700 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Diagnosis Codes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('runs')}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              activeTab === 'runs'
                ? 'border-blue-600 text-blue-700 font-medium'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Recent Runs ({runs.length})
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className={activeTab === 'codes' ? 'h-full min-h-0' : 'hidden'}>
            <DiagnosisCodesPanel
              codes={def.diagnosis_codes}
              definitionId={def.id}
              parentExecutionKind={def.execution_kind ?? 'llm_batch'}
              readonly={definitionIsImmutable}
              onCodesChange={(diagnosis_codes) => {
                setDef((prev) => (prev ? { ...prev, diagnosis_codes } : prev));
              }}
            />
          </div>
          <div className={activeTab === 'runs' ? 'h-full min-h-0' : 'hidden'}>
            <RecentRunsPanel
              runs={runs}
              fallbackKind={def.execution_kind ?? 'llm_batch'}
            />
          </div>
        </div>
      </div>

      <HealthCheckDefinitionFormModal
        isOpen={defFormOpen}
        onClose={() => setDefFormOpen(false)}
        definition={def}
        onSaved={(saved) => {
          setDef({ ...def, ...saved });
          onUpdated(saved);
        }}
      />

    </div>
  );
}

function RecentRunsPanel({
  runs,
  fallbackKind,
}: {
  runs: HealthCheckRunSummary[];
  fallbackKind: HealthCheckExecutionKind;
}) {
  return (
    <section className="h-full min-h-0 rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-gray-100 shrink-0">
        <h3 className="text-sm font-semibold text-gray-700">Recent Runs</h3>
      </div>
      {runs.length === 0 ? (
        <div className="p-4 text-sm text-gray-500 italic">No runs yet.</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left w-16">ID</th>
                <th className="px-3 py-2 text-left w-28">Status</th>
                <th className="px-3 py-2 text-left w-28">Kind</th>
                <th className="px-3 py-2 text-left w-40">Model</th>
                <th className="px-3 py-2 text-left">Processed / Total</th>
                <th className="px-3 py-2 text-left">Pass / Warn / Fail</th>
                <th className="px-3 py-2 text-left w-44">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {runs.map((r) => {
                const runKind: HealthCheckExecutionKind =
                  r.check_definition_execution_kind ?? fallbackKind;
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">
                      #{r.id}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${HEALTH_CHECK_RUN_STATUS_STYLES[r.status]}`}
                      >
                        {HEALTH_CHECK_RUN_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <ExecutionKindBadge kind={runKind} />
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-xs font-mono">
                      {runKind === 'programmatic' ? (
                        <span className="text-gray-400 italic">n/a</span>
                      ) : (
                        (r.model ?? <span className="text-gray-400">—</span>)
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-xs">
                      {r.processed_items} / {r.total_items}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-xs">
                      <span className="text-emerald-700">{r.passed_items}</span> /{' '}
                      <span className="text-amber-700">{r.warning_items}</span> /{' '}
                      <span className="text-red-700">{r.failed_items}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface DiagnosisCodesPanelProps {
  codes: HealthDiagnosisCode[];
  definitionId: string;
  parentExecutionKind: HealthCheckExecutionKind;
  readonly?: boolean;
  onCodesChange: (codes: HealthDiagnosisCode[]) => void;
}

function DiagnosisCodesPanel({
  codes,
  definitionId,
  parentExecutionKind,
  readonly = false,
  onCodesChange,
}: DiagnosisCodesPanelProps) {
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const seenGroupIdsRef = useRef<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DiagnosisCodeFilter>('all');
  const [codeFormOpen, setCodeFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<HealthDiagnosisCode | null>(null);
  const [availableGroups, setAvailableGroups] = useState<HealthDiagnosisCodeGroup[]>([]);

  // Fetch the catalogue of groups once for the form's group picker.
  // Groups are cross-definition, so this is a global list.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/health-checks/diagnosis-code-groups')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { groups: HealthDiagnosisCodeGroup[] } | null) => {
        if (cancelled || !data) return;
        setAvailableGroups(data.groups);
      })
      .catch(() => {
        // Form will still work, just without an existing-groups dropdown.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);
  const codesByGroup = useMemo(() => buildCodesByGroup(codes), [codes]);
  const selectedCode = selectedCodeId ? codeById.get(selectedCodeId) ?? null : null;
  const visibleIds = useMemo(
    () => buildVisibleCodeIds(codes, query, filter),
    [codes, query, filter],
  );
  const flatRows = useMemo(
    () => flattenCodesByGroup(codes, collapsedGroupIds, visibleIds),
    [codes, collapsedGroupIds, visibleIds],
  );
  const groupIds = useMemo(() => Array.from(codesByGroup.keys()), [codesByGroup]);
  const stats = useMemo(() => summarizeDiagnosisCodes(codes), [codes]);

  // Newly-seen groups start collapsed, matching the previous behaviour
  // for newly-seen families. Already-known groups keep whatever the
  // user toggled.
  useEffect(() => {
    const newlySeenGroupIds = groupIds.filter(
      (id) => !seenGroupIdsRef.current.has(id),
    );
    if (newlySeenGroupIds.length === 0) return;

    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      for (const id of newlySeenGroupIds) {
        seenGroupIdsRef.current.add(id);
        next.add(id);
      }
      return next;
    });
  }, [groupIds]);

  useEffect(() => {
    if (codes.length === 0) {
      setSelectedCodeId(null);
      return;
    }
    if (!selectedCodeId || !codeById.has(selectedCodeId)) {
      const firstCodeRow = flatRows.find(
        (r): r is Extract<CodeListRow, { kind: 'code' }> => r.kind === 'code',
      );
      setSelectedCodeId(firstCodeRow?.code.id ?? codes[0].id);
    }
  }, [codeById, codes, flatRows, selectedCodeId]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleToggleCodeEnabled = async (code: HealthDiagnosisCode) => {
    const res = await fetch(`/api/health-checks/diagnosis-codes/${code.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !code.enabled }),
    });
    if (res.ok) {
      const updated = (await res.json()) as HealthDiagnosisCode;
      onCodesChange(codes.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCodeId(updated.id);
    }
  };

  const handleDeleteCode = async (code: HealthDiagnosisCode) => {
    if (!confirm(`Delete diagnosis code "${code.code}"?`)) return;
    const res = await fetch(`/api/health-checks/diagnosis-codes/${code.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const remaining = codes.filter((c) => c.id !== code.id);
      onCodesChange(remaining);
      // Prefer to land on a sibling in the same group; otherwise the
      // first remaining code. There is no parent code to fall back to.
      const siblings = code.group_id
        ? remaining.filter((c) => c.group_id === code.group_id)
        : [];
      setSelectedCodeId(
        siblings[0]?.id ?? remaining[0]?.id ?? null,
      );
    }
  };

  const handleSavedCode = (saved: HealthDiagnosisCode) => {
    const existing = codes.find((c) => c.id === saved.id);
    onCodesChange(
      existing
        ? codes.map((c) => (c.id === saved.id ? saved : c))
        : [...codes, saved].sort((a, b) => a.code.localeCompare(b.code)),
    );
    setSelectedCodeId(saved.id);
  };

  const allGroupsCollapsed =
    groupIds.length > 0 && groupIds.every((id) => collapsedGroupIds.has(id));

  return (
    <section className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-center mb-2 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Diagnosis Codes</h3>
          <div className="text-xs text-gray-500">
            {codes.length} code{codes.length === 1 ? '' : 's'} · {stats.groupCount}{' '}
            group{stats.groupCount === 1 ? '' : 's'} · {stats.standaloneCount}{' '}
            standalone
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {groupIds.length > 0 && (
            <button
              onClick={() => {
                setCollapsedGroupIds(
                  allGroupsCollapsed ? new Set() : new Set(groupIds),
                );
              }}
              className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50"
              title="Collapse or expand all groups"
            >
              {allGroupsCollapsed ? 'Expand groups' : 'Collapse groups'}
            </button>
          )}
          {readonly ? (
            <span className="px-2.5 py-1 rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-500">
              Managed
            </span>
          ) : (
            <button
              onClick={() => {
                setEditingCode(null);
                setCodeFormOpen(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Code
            </button>
          )}
        </div>
      </div>

      {codes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No diagnosis codes attached yet.
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(430px,520px)_minmax(0,1fr)] gap-4 flex-1 min-h-0">
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col min-h-0">
            <div className="p-3 border-b border-gray-100 space-y-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search code, title, or group..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'scoped', 'standalone', 'disabled'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded-full border text-xs font-medium capitalize ${
                      filter === f
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                    title={
                      f === 'standalone'
                        ? 'Codes with no group_id (no related variants)'
                        : f === 'scoped'
                          ? 'Codes targeted at specific frame_type / subtype values'
                          : f === 'disabled'
                            ? 'Codes that are currently disabled'
                            : 'All codes'
                    }
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
              {flatRows.length === 0 ? (
                <div className="p-6 text-sm text-gray-500 text-center">
                  No codes match this search/filter.
                </div>
              ) : (
                flatRows.map((row) => {
                  if (row.kind === 'group_header') {
                    const groupScope = getScopeUnion(
                      codesByGroup.get(row.groupId) ?? [],
                    );
                    const groupDescription = getGroupDescription(row.group);
                    return (
                      <button
                        key={`group:${row.groupId}`}
                        type="button"
                        onClick={() => toggleGroup(row.groupId)}
                        className="w-full text-left px-3 py-2 bg-slate-50 hover:bg-slate-100"
                        title={
                          row.collapsed
                            ? `Show ${row.memberCount} member${row.memberCount === 1 ? '' : 's'}`
                            : 'Collapse group'
                        }
                      >
                        <div className="flex gap-1.5">
                          <span className="shrink-0">
                            {row.collapsed ? (
                              <ChevronRightIcon className="w-3.5 h-3.5 text-gray-500" />
                            ) : (
                              <ChevronDownIcon className="w-3.5 h-3.5 text-gray-500" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-semibold text-gray-800 truncate">
                                {row.group?.label ?? 'Unnamed group'}
                              </span>
                              {row.group?.key && (
                                <span className="font-mono text-[10px] text-gray-500 shrink-0">
                                  {row.group.key}
                                </span>
                              )}
                              <span className="ml-auto text-[10px] text-gray-500 shrink-0">
                                {row.memberCount}
                              </span>
                            </div>
                            {groupDescription && (
                              <div className="mt-0.5 text-[11px] italic text-gray-500 line-clamp-2">
                                {groupDescription}
                              </div>
                            )}
                            <ScopeBadges scope={groupScope} />
                          </div>
                        </div>
                      </button>
                    );
                  }

                  const { code, insideGroup } = row;
                  const selected = selectedCodeId === code.id;
                  if (!insideGroup) {
                    return (
                      <button
                        key={`code:${code.id}`}
                        type="button"
                        onClick={() => setSelectedCodeId(code.id)}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-100 ${
                          selected ? 'bg-blue-50' : 'bg-slate-50'
                        }`}
                        title={code.label}
                      >
                        <div className="flex gap-1.5">
                          <span className="inline-block w-3.5 shrink-0" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-xs font-semibold text-gray-800 truncate">
                                {code.label}
                              </span>
                              <span className="font-mono text-[10px] text-gray-500 shrink-0">
                                {code.code}
                              </span>
                              {!code.enabled && (
                                <span className="ml-auto text-[10px] text-gray-500 italic shrink-0">
                                  disabled
                                </span>
                              )}
                            </div>
                            {code.quick_summary && (
                              <div className="mt-0.5 text-[11px] italic text-gray-500 line-clamp-2">
                                {code.quick_summary}
                              </div>
                            )}
                            <ScopeBadges scope={getScopeUnion([code])} />
                          </div>
                        </div>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={`code:${code.id}`}
                      type="button"
                      onClick={() => setSelectedCodeId(code.id)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 ${
                        selected ? 'bg-blue-50' : insideGroup ? 'bg-white' : 'bg-white'
                      }`}
                    >
                      <div
                        className="flex gap-2"
                        style={{ paddingLeft: insideGroup ? 22 : 0 }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-xs text-gray-900 truncate">
                              {code.code}
                            </span>
                            {!code.enabled && (
                              <span className="text-[10px] text-gray-500 italic">
                                disabled
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-700 truncate">
                            {code.label}
                          </div>
                          {code.quick_summary && (
                            <div className="mt-0.5 text-[11px] italic text-gray-500 line-clamp-2">
                              {code.quick_summary}
                            </div>
                          )}
                          <ScopeBadges scope={getScopeUnion([code])} />
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <CodeDetailPanel
            code={selectedCode}
            codes={codes}
            stats={stats}
            onToggleEnabled={handleToggleCodeEnabled}
            onEdit={(code) => {
              setEditingCode(code);
              setCodeFormOpen(true);
            }}
            onDelete={handleDeleteCode}
            readonly={readonly}
          />
        </div>
      )}

      {!readonly && (
        <DiagnosisCodeFormModal
          isOpen={codeFormOpen}
          onClose={() => setCodeFormOpen(false)}
          defaultDefinitionId={definitionId}
          parentExecutionKind={parentExecutionKind}
          availableGroups={availableGroups}
          diagnosisCode={editingCode}
          onSaved={handleSavedCode}
        />
      )}
    </section>
  );
}

interface DiagnosisCodeStats {
  total: number;
  /** Distinct `group_id`s present in this view (groups with ≥1 member). */
  groupCount: number;
  /** Codes with `group_id IS NULL`. About 1 in 5 catalogue codes are standalone. */
  standaloneCount: number;
  disabledCount: number;
  scopedCount: number;
  severityCounts: Record<string, number>;
}

interface CodeDetailPanelProps {
  code: HealthDiagnosisCode | null;
  codes: HealthDiagnosisCode[];
  stats: DiagnosisCodeStats;
  onToggleEnabled: (code: HealthDiagnosisCode) => void;
  onEdit: (code: HealthDiagnosisCode) => void;
  onDelete: (code: HealthDiagnosisCode) => void;
  readonly?: boolean;
}

function CodeDetailPanel({
  code,
  stats,
  onToggleEnabled,
  onEdit,
  onDelete,
  readonly = false,
}: CodeDetailPanelProps) {
  if (!code) {
    return <DiagnosisCodeSummary stats={stats} />;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <span
            className={`mt-2 h-2.5 w-2.5 rounded-full shrink-0 ${severityDotClass(
              code.severity,
            )}`}
            title={`Severity: ${code.severity}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-gray-900">{code.code}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${severityPillClass(code.severity)}`}>
                {code.severity}
              </span>
              {isScopedDiagnosisCode(code) && (
                <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-200">
                  scoped
                </span>
              )}
              {!code.group_id && (
                <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-medium bg-gray-100 text-gray-600 border-gray-200">
                  standalone
                </span>
              )}
            </div>
            <h4 className="mt-1 text-lg font-semibold text-gray-900">{code.label}</h4>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {readonly ? (
              <span className="text-xs text-gray-500">
                {code.enabled ? 'Enabled' : 'Disabled'}
              </span>
            ) : (
              <>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={code.enabled}
                    onChange={() => void onToggleEnabled(code)}
                    className="rounded border-gray-300"
                  />
                  {code.enabled ? 'Enabled' : 'Disabled'}
                </label>
                <button
                  onClick={() => onEdit(code)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                  title="Edit"
                >
                  <PencilSquareIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => void onDelete(code)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                  title="Delete"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
        <DetailBlock title="Description">
          <div className="text-gray-700 whitespace-pre-wrap">
            {code.description ?? (
              <span className="text-gray-400 italic">No description</span>
            )}
          </div>
        </DetailBlock>

        <DetailBlock title={`Examples (${code.examples?.length ?? 0})`}>
          {code.examples && code.examples.length > 0 ? (
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              {code.examples.map((ex, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  {ex}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-gray-400 italic">No examples</span>
          )}
        </DetailBlock>

        <div className="grid grid-cols-3 gap-4">
          <DetailBlock title="Frame Targeting">
            <ScopeSummary code={code} />
          </DetailBlock>

          <DetailBlock title="Remediation">
            {code.remediation_strategy ? (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
                {HEALTH_REMEDIATION_STRATEGY_LABELS[code.remediation_strategy]}
              </span>
            ) : (
              <span className="text-gray-400 italic">
                No remediation strategy set
              </span>
            )}
          </DetailBlock>

          <DetailBlock title="Category">
            {code.category ? (
              <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 text-xs">
                {code.category}
              </span>
            ) : (
              <span className="text-gray-400 italic">None</span>
            )}
          </DetailBlock>

        </div>
      </div>

      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex items-center gap-4">
        <span>
          ID: <span className="font-mono">#{code.id}</span>
        </span>
        <span>Created: {new Date(code.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

function DiagnosisCodeSummary({ stats }: { stats: DiagnosisCodeStats }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h4 className="text-sm font-semibold text-gray-900">Diagnosis Code Summary</h4>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <SummaryStat label="Total codes" value={stats.total} />
        <SummaryStat label="Groups" value={stats.groupCount} />
        <SummaryStat label="Standalone" value={stats.standaloneCount} />
        <SummaryStat label="Disabled" value={stats.disabledCount} />
        <SummaryStat label="Scoped" value={stats.scopedCount} />
      </div>
      <div className="mt-5">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Severity Breakdown
        </div>
        <div className="space-y-2">
          {(['critical', 'high', 'medium', 'low'] as const).map((severity) => (
            <div key={severity} className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${severityDotClass(severity)}`} />
              <span className="capitalize text-gray-700 w-16">{severity}</span>
              <div className="h-1.5 bg-gray-100 rounded-full flex-1 overflow-hidden">
                <div
                  className={`h-full ${severityBarClass(severity)}`}
                  style={{
                    width:
                      stats.total === 0
                        ? '0%'
                        : `${Math.round(((stats.severityCounts[severity] ?? 0) / stats.total) * 100)}%`,
                  }}
                />
              </div>
              <span className="font-mono text-gray-500 w-8 text-right">
                {stats.severityCounts[severity] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

const DIAGNOSIS_CODE_GROUP_DESCRIPTIONS: Record<string, string> = {
  dr_011: 'Frame definitions that open with boilerplate instead of directly stating the frame meaning.',
  dr_012: 'Frame definitions padded with formulaic filler rather than substantive semantic content.',
  dr_015: 'Definitions that add required constraints not supported by the frame inventory.',
  dr_016: 'Definitions that use generic role names instead of the frame role labels.',
  dr_029: 'Frames missing a core participant or structural role implied by the definition.',
  dr_030: 'Core roles that are not entailed by the frame definition or role structure.',
  dr_031: 'Role inventories where core and peripheral status appears misassigned.',
  dr_032: 'Role families that look inconsistent with the frame type or subtype.',
  dr_034: 'Duplicate scalar, degree, extent, or strength roles in one frame.',
  dr_035: 'Gradable frames missing a degree, amount, value, or scale role.',
  dr_036: 'Symmetric or directional relations whose role inventory does not match the relation.',
  dr_038: 'Core role labels that are too generic for the frame-specific participant.',
  dr_040: 'Role labels that mix naming perspectives or duplicate the same participant view.',
  dr_043: 'Role descriptions too vague to identify filler type or semantic function.',
  dr_044: 'Role descriptions whose filler type conflicts with the role or frame.',
  dr_047: 'Role examples that highlight the wrong filler or span.',
  dr_048: 'Role examples that do not clearly evoke the target frame.',
  dr_057: 'Role mappings with inconsistent absorbed/incorporated value flags.',
  dr_063: 'Role mappings between ontologically incompatible parent and child roles.',
  dr_064: 'Role mappings that treat unrelated roles as renamed equivalents.',
  dr_066: 'Forced mappings used to avoid dropping a parent role despite poor alignment.',
  dr_067: 'Inherited parent core roles missing a corresponding child mapping.',
  dr_068: 'Peripheral or circumstantial roles incorrectly mapped to core semantic participants.',
  dr_072: 'Role inventory patterns suggesting the frame has the wrong frame_type.',
  dr_073: 'Definitions and roles that suggest the current parent edge is invalid.',
  fs_001: 'Frames missing a legitimate part-of-speech alternation sense.',
  fs_005: 'Frame senses whose meaning belongs in a different frame.',
  fs_007: 'Cross-POS derivations that combine incompatible concepts in one frame.',
  fs_008: 'Cause, event, result, or state readings bundled into one frame sense family.',
  fs_009: 'Entity-like noun senses attached to property, measure, or relation frames.',
  fs_011: 'Referent noun senses placed in frames for pertinence or relation meanings.',
  fs_013: 'Abstract and physical readings collapsed into one frame sense family.',
  fs_014: 'Literal and metaphorical readings mixed under one frame.',
  fs_015: 'Spatial and temporal readings treated as the same frame sense family.',
  fs_016: 'Physical, mental, or emotional readings bundled together.',
  fs_017: 'Private cognitive acts mixed with public communicative acts.',
  fs_018: 'Creation, joining, repair, or modification readings collapsed together.',
  fs_019: 'Manner readings mixed with distinct activity-type readings.',
  fs_020: 'Activity, process, achievement, and result readings bundled together.',
  fs_021: 'Attempt readings mixed with successful achievement readings.',
  fs_022: 'Cause, mechanism, symptom, and downstream effect readings collapsed together.',
  fs_023: 'Part, material component, and whole-system readings treated as one frame.',
  fs_024: 'Categorical type readings mixed with pertinence or relation readings.',
  fs_025: 'Purpose or function readings mixed with domain pertinence readings.',
  fs_026: 'Distinct relation predicates bundled into one relation frame.',
  fs_027: 'Membership, parthood, enclosure, ownership, or belonging readings collapsed together.',
  fs_030: 'Dispositional readings mixed with occurrent state readings.',
  fs_031: 'Intrinsic properties mixed with comparative or norm-relative properties.',
  fs_032: 'Personal stance readings mixed with public or collective status readings.',
  fs_033: 'Instantiated state readings mixed with broad domain supercategories.',
  fs_035: 'Neutral report readings mixed with pejorative or evaluative readings.',
  fs_036: 'Broad hypernym readings mixed with specialized subtype readings.',
  fs_038: 'Scalar thresholds, degree bands, or magnitude ranges collapsed together.',
  fs_040: 'Opposite directions, orientations, or converse relations treated as one frame.',
  fs_041: 'Agent capability readings mixed with patient susceptibility readings.',
  fs_042: 'Pole-specific or biased senses placed in a neutral dimensional frame.',
  fs_045: 'Complementary attribute facets split despite describing one trait bundle.',
  fs_048: 'Senses split only by someone/something or animacy distinctions.',
  fs_049: 'Pertinence senses duplicated through false specificity.',
  fs_050: 'Causative or inchoative variants split without a real frame distinction.',
  fs_051: 'Event senses split only by perspective or participant focus.',
  fs_052: 'Duplicate senses created from minor filler or reflexive variation.',
  fs_053: 'Technical or operational distinctions that are not separate lexical senses.',
  fs_055: 'Eventive senses attached to non-eventive frames.',
  fs_056: 'Non-eventive senses attached to event frames.',
  fs_057: 'Sense definitions whose wording is in the wrong frame register.',
  fs_058: 'Sense definitions that do not follow the expected template for their frame type.',
  fs_062: 'Biased property or endpoint noun senses placed outside the neutral scale.',
  fs_063: 'Paired senses with incorrect alternation metadata.',
  fs_064: 'Converse relation readings treated as mere perspective variants.',
  fs_067: 'Dynamic process readings mixed with static measure readings.',
  i_001: 'Parent-child hierarchy edges recorded in the wrong direction.',
  i_003: 'Child frames attached below an over-specific parent instead of the correct ancestor.',
  i_004: 'Sibling frames incorrectly connected as parent and child.',
  i_005: 'Hierarchy edges where the endpoints appear duplicate or near-synonymous.',
  i_007: 'Literal and metaphorical frames incorrectly linked by inheritance.',
  i_009: 'Frames in the same domain but with different mechanisms linked as IS-A.',
  i_012: 'Property frames attached to parents with the wrong bearer or measurand.',
  i_014: 'Polarity, opposite-pole, or converse relation errors in the hierarchy.',
  i_015: 'Associative, topical, or contextual links mistaken for IS-A inheritance.',
  i_020: 'Scalar or measure frames attached to the wrong scale parent.',
  i_022: 'Specialized parent edges where the child broadens outside the parent domain.',
  s_010: 'Action or process senses mixed with patient capability adjective readings.',
  s_028: 'Dynamic change readings mixed with static property readings.',
  s_045: 'Entity frames that collapse distinct entity kinds with different identity criteria.',
  s_073: 'Sense definitions that are circular rather than informative.',
  s_074: 'Sense definitions that rely on open-ended exemplar lists.',
  s_078: 'Sense definitions that include example clauses instead of only denotation.',
};

function getGroupDescription(group: HealthDiagnosisCodeGroup | null) {
  if (!group) return null;
  return DIAGNOSIS_CODE_GROUP_DESCRIPTIONS[group.key] ?? group.description ?? null;
}

/**
 * One rendered row in the diagnosis-code list. The list is a flat
 * sequence of group headers (with their member codes nested below) and
 * standalone code rows (codes whose `group_id` is null).
 *
 * Group headers are not selectable: clicking one toggles its expanded
 * state. Code rows are selectable and drive the right-hand detail panel.
 */
type CodeListRow =
  | {
      kind: 'group_header';
      groupId: string;
      group: HealthDiagnosisCodeGroup | null;
      memberCount: number;
      collapsed: boolean;
    }
  | {
      kind: 'code';
      code: HealthDiagnosisCode;
      /** True when the code is rendered under a group header (indented). */
      insideGroup: boolean;
    };

/**
 * Bucket codes by their `group_id`. Codes with `group_id === null` are
 * NOT included — they're rendered as standalone rows by the caller.
 *
 * Members within a group are sorted by `code` so families are stable.
 * The order of groups (when iterating the returned Map) is the order in
 * which their first member appears in `codes`, so the upstream sort
 * (enabled DESC, code ASC) is preserved at the family level.
 */
function buildCodesByGroup(codes: HealthDiagnosisCode[]) {
  const byGroup = new Map<string, HealthDiagnosisCode[]>();
  for (const c of codes) {
    if (!c.group_id) continue;
    const list = byGroup.get(c.group_id) ?? [];
    list.push(c);
    byGroup.set(c.group_id, list);
  }
  for (const members of byGroup.values()) {
    members.sort((a, b) => a.code.localeCompare(b.code));
  }
  return byGroup;
}

/**
 * Build a `groupId -> resolved group` lookup. Some members may have the
 * full group joined (`code.group`) and others may not, so we take the
 * first non-null group entry per group_id.
 */
function buildGroupLookup(codes: HealthDiagnosisCode[]) {
  const groups = new Map<string, HealthDiagnosisCodeGroup>();
  for (const c of codes) {
    if (c.group_id && c.group && !groups.has(c.group_id)) {
      groups.set(c.group_id, c.group);
    }
  }
  return groups;
}

function isScopedDiagnosisCode(code: HealthDiagnosisCode) {
  return (
    (code.applies_to_frame_types?.length ?? 0) > 0 ||
    (code.applies_to_frame_subtypes?.length ?? 0) > 0 ||
    code.match_null_subtype === true
  );
}

function matchesDiagnosisFilter(
  code: HealthDiagnosisCode,
  filter: DiagnosisCodeFilter,
) {
  if (filter === 'scoped') return isScopedDiagnosisCode(code);
  if (filter === 'standalone') return code.group_id == null;
  if (filter === 'disabled') return !code.enabled;
  return true;
}

function buildVisibleCodeIds(
  codes: HealthDiagnosisCode[],
  query: string,
  filter: DiagnosisCodeFilter,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const codesByGroup = buildCodesByGroup(codes);
  const visible = new Set<string>();

  for (const code of codes) {
    const textMatches =
      normalizedQuery.length === 0 ||
      code.code.toLowerCase().includes(normalizedQuery) ||
      code.label.toLowerCase().includes(normalizedQuery) ||
      (code.group?.label?.toLowerCase().includes(normalizedQuery) ?? false) ||
      (code.group?.key?.toLowerCase().includes(normalizedQuery) ?? false);
    if (!textMatches || !matchesDiagnosisFilter(code, filter)) continue;

    visible.add(code.id);

    // When a code matches, also surface its sibling group members so
    // the user sees the whole family context (matches the previous
    // tree behaviour where a hit would expose its parent + siblings).
    if (code.group_id) {
      for (const sibling of codesByGroup.get(code.group_id) ?? []) {
        visible.add(sibling.id);
      }
    }
  }

  return visible;
}

function summarizeDiagnosisCodes(codes: HealthDiagnosisCode[]): DiagnosisCodeStats {
  const codesByGroup = buildCodesByGroup(codes);
  const severityCounts: Record<string, number> = {};
  for (const code of codes) {
    severityCounts[code.severity] = (severityCounts[code.severity] ?? 0) + 1;
  }
  return {
    total: codes.length,
    groupCount: codesByGroup.size,
    standaloneCount: codes.filter((c) => c.group_id == null).length,
    disabledCount: codes.filter((c) => !c.enabled).length,
    scopedCount: codes.filter(isScopedDiagnosisCode).length,
    severityCounts,
  };
}

function severityDotClass(severity: string) {
  if (severity === 'critical') return 'bg-red-600';
  if (severity === 'high') return 'bg-orange-500';
  if (severity === 'medium') return 'bg-amber-500';
  return 'bg-slate-400';
}

function severityBarClass(severity: string) {
  if (severity === 'critical') return 'bg-red-500';
  if (severity === 'high') return 'bg-orange-500';
  if (severity === 'medium') return 'bg-amber-500';
  return 'bg-slate-400';
}

function severityPillClass(severity: string) {
  if (severity === 'critical') return 'bg-red-50 text-red-700 border-red-200';
  if (severity === 'high') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (severity === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

interface ScopeUnion {
  types: string[];
  subtypes: string[];
  matchNullSubtype: boolean;
}

function getScopeUnion(codes: HealthDiagnosisCode[]): ScopeUnion {
  return {
    types: Array.from(
      new Set(codes.flatMap((code) => code.applies_to_frame_types ?? [])),
    ).sort(),
    subtypes: Array.from(
      new Set(codes.flatMap((code) => code.applies_to_frame_subtypes ?? [])),
    ).sort(),
    matchNullSubtype: codes.some((code) => code.match_null_subtype),
  };
}

function ScopeBadges({ scope }: { scope: ScopeUnion }) {
  if (
    scope.types.length === 0 &&
    scope.subtypes.length === 0
  ) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 min-w-0 shrink-0">
      {scope.types.map((type) => (
        <span
          key={`type:${type}`}
          className="inline-flex px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium"
          title={`Applies to frame_type: ${type}`}
        >
          {type}
        </span>
      ))}
      {scope.subtypes.map((subtype) => (
        <span
          key={`subtype:${subtype}`}
          className="inline-flex px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-medium"
          title={`Applies to subtype: ${subtype}`}
        >
          {subtype}
        </span>
      ))}
    </span>
  );
}

/**
 * Build a flat list of rows for the diagnosis-code table, mixing group
 * headers with their member codes and standalone (un-grouped) codes.
 *
 * Layout:
 * - For each `group_id` present in `codes` we emit a header row,
 *   followed (when not collapsed) by the group's member codes sorted
 *   by `code`.
 * - Codes with `group_id IS NULL` are emitted as standalone rows in
 *   their original (already-sorted) order.
 *
 * Display rules from the catalogue brief:
 * - Groups have NO leader code; the header uses the group's own
 *   `label` / `key`. We never elevate a member code to act as the
 *   group's representative.
 * - Single-member groups still get a header (handled uniformly).
 * - Standalone codes never carry a group header.
 *
 * Group/standalone interleaving order follows each entity's first
 * appearance in `codes`, so the upstream sort (enabled DESC, code ASC)
 * controls the top-level row order.
 */
function flattenCodesByGroup(
  codes: HealthDiagnosisCode[],
  collapsedGroupIds: Set<string>,
  visibleIds?: Set<string>,
): CodeListRow[] {
  const codesByGroup = buildCodesByGroup(codes);
  const groupLookup = buildGroupLookup(codes);

  const out: CodeListRow[] = [];
  const emittedGroups = new Set<string>();

  for (const code of codes) {
    if (visibleIds && !visibleIds.has(code.id)) continue;

    if (!code.group_id) {
      out.push({ kind: 'code', code, insideGroup: false });
      continue;
    }

    if (emittedGroups.has(code.group_id)) continue;
    emittedGroups.add(code.group_id);

    const allMembers = codesByGroup.get(code.group_id) ?? [code];
    const visibleMembers = visibleIds
      ? allMembers.filter((m) => visibleIds.has(m.id))
      : allMembers;
    if (visibleMembers.length === 0) continue;

    const collapsed = collapsedGroupIds.has(code.group_id);
    out.push({
      kind: 'group_header',
      groupId: code.group_id,
      group: groupLookup.get(code.group_id) ?? code.group ?? null,
      memberCount: visibleMembers.length,
      collapsed,
    });

    if (!collapsed) {
      for (const member of visibleMembers) {
        out.push({ kind: 'code', code: member, insideGroup: true });
      }
    }
  }

  return out;
}

function ScopeSummary({ code }: { code: HealthDiagnosisCode }) {
  const types = code.applies_to_frame_types ?? [];
  const subtypes = code.applies_to_frame_subtypes ?? [];

  const noTypeFilter = types.length === 0;
  const noSubtypeFilter = subtypes.length === 0;
  if (noTypeFilter && noSubtypeFilter) {
    return (
      <span className="text-gray-700">
        Applies to <span className="font-medium">all frames</span>.
      </span>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500">frame_type:</span>
        {types.length === 0 ? (
          <span className="text-xs text-gray-500 italic">any</span>
        ) : (
          types.map((t) => (
            <span
              key={t}
              className="inline-flex px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 text-xs font-mono"
            >
              {t}
            </span>
          ))
        )}
      </div>
      {subtypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500">subtype:</span>
          {subtypes.map((s) => (
            <span
              key={s}
              className="inline-flex px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 text-xs font-mono"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
