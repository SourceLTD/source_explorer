'use client';

import { useState } from 'react';
import {
  HashtagIcon,
  ArrowsRightLeftIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import {
  FilterPanelShell,
  FilterSection,
  useFilterSections,
  ToggleChipGroup,
  SearchableMultiSelect,
  DateRangeField,
  type ChipOption,
  type SelectOption,
} from '@/components/filters';
import {
  type PendingFilter,
  type PlanState,
  type SubjectState,
  type PendingFilterSections,
  defaultPendingFilter,
  toggleInArray,
  countActiveFacets,
} from './pendingFilter';

export interface PendingFilterOptions {
  entityTypes: ChipOption[];
  operations: ChipOption[];
  sources?: ChipOption[];
  jobs?: SelectOption[];
  severities?: ChipOption[];
  diagnoses?: SelectOption[];
  archetypes?: ChipOption[];
}

export type { PendingFilterSections };

interface PendingFilterPanelProps {
  filter: PendingFilter;
  onFilterChange: (filter: PendingFilter) => void;
  isOpen: boolean;
  onToggle: () => void;
  options: PendingFilterOptions;
  show?: PendingFilterSections;
}

const PLAN_STATE_OPTIONS: ChipOption[] = [
  { value: 'plan', label: 'Part of a plan' },
  { value: 'loose', label: 'Loose change' },
];

const SUBJECT_STATE_OPTIONS: ChipOption[] = [
  { value: 'new', label: 'New concept' },
  { value: 'existing', label: 'Existing concept' },
];

/**
 * Faceted filter dropdown for the pending-changes surfaces, built from the
 * shared filter primitives. Free-text search lives in the toolbar `SearchInput`
 * alongside the toggle button — this panel owns the categorical facets.
 */
export default function PendingFilterPanel({
  filter,
  onFilterChange,
  isOpen,
  onToggle,
  options,
  show = {},
}: PendingFilterPanelProps) {
  const { openSections, toggleSection } = useFilterSections(['categories']);
  const [jobQuery, setJobQuery] = useState('');
  const [diagnosisQuery, setDiagnosisQuery] = useState('');

  const set = (patch: Partial<PendingFilter>) => onFilterChange({ ...filter, ...patch });

  const clearFacets = () =>
    onFilterChange({ ...defaultPendingFilter, search: filter.search });

  const jobs = options.jobs ?? [];
  const diagnoses = options.diagnoses ?? [];

  const filteredJobs = jobQuery
    ? jobs.filter((j) => optionMatches(j, jobQuery) || filter.jobIds.includes(j.id))
    : jobs;
  const filteredDiagnoses = diagnosisQuery
    ? diagnoses.filter((d) => optionMatches(d, diagnosisQuery) || filter.diagnosisCodes.includes(d.id))
    : diagnoses;

  return (
    <FilterPanelShell
      isOpen={isOpen}
      onToggle={onToggle}
      activeFilterCount={countActiveFacets(filter)}
      onClearAll={clearFacets}
      bodyMaxHeightClass="max-h-[28rem]"
    >
      {/* Categories: entity type + operation */}
      <FilterSection
        title="Categories"
        icon={<HashtagIcon className="w-4 h-4 text-gray-600" />}
        isOpen={openSections.has('categories')}
        onToggle={() => toggleSection('categories')}
      >
        <ToggleChipGroup
          label="Entity Type"
          options={options.entityTypes}
          selected={filter.entityTypes}
          onToggle={(v) => set({ entityTypes: toggleInArray(filter.entityTypes, v) })}
        />
        <ToggleChipGroup
          label="Operation"
          options={options.operations}
          selected={filter.operations}
          onToggle={(v) => set({ operations: toggleInArray(filter.operations, v) })}
        />
        {show.planState && (
          <ToggleChipGroup
            label="Plan"
            options={PLAN_STATE_OPTIONS}
            selected={filter.planState}
            onToggle={(v) => set({ planState: toggleInArray(filter.planState, v as PlanState) })}
          />
        )}
      </FilterSection>

      {/* Concept — subject archetype + new/existing (concept views) */}
      {(show.archetype || show.subjectState) && (
        <FilterSection
          title="Concept"
          icon={<TagIcon className="w-4 h-4 text-gray-600" />}
          isOpen={openSections.has('concept')}
          onToggle={() => toggleSection('concept')}
        >
          {show.subjectState && (
            <ToggleChipGroup
              label="State"
              options={SUBJECT_STATE_OPTIONS}
              selected={filter.subjectStates}
              onToggle={(v) =>
                set({ subjectStates: toggleInArray(filter.subjectStates, v as SubjectState) })
              }
            />
          )}
          {show.archetype && options.archetypes && options.archetypes.length > 0 && (
            <ToggleChipGroup
              label="Concept type"
              options={options.archetypes}
              selected={filter.archetypes}
              onToggle={(v) => set({ archetypes: toggleInArray(filter.archetypes, v) })}
            />
          )}
        </FilterSection>
      )}

      {/* Source / origin */}
      {show.source && options.sources && options.sources.length > 0 && (
        <FilterSection
          title="Source"
          icon={<ArrowsRightLeftIcon className="w-4 h-4 text-gray-600" />}
          isOpen={openSections.has('source')}
          onToggle={() => toggleSection('source')}
        >
          <ToggleChipGroup
            label="Origin"
            options={options.sources}
            selected={filter.sources}
            onToggle={(v) => set({ sources: toggleInArray(filter.sources, v) })}
          />
        </FilterSection>
      )}

      {/* AI jobs */}
      {show.jobs && jobs.length > 0 && (
        <FilterSection
          title="AI Jobs"
          icon={<SparklesIcon className="w-4 h-4 shrink-0 text-gray-600" />}
          isOpen={openSections.has('jobs')}
          onToggle={() => toggleSection('jobs')}
        >
          <SearchableMultiSelect
            label="Produced by job"
            options={filteredJobs}
            selected={filter.jobIds}
            onToggle={(id) => set({ jobIds: toggleInArray(filter.jobIds, id) })}
            searchQuery={jobQuery}
            onSearchQueryChange={setJobQuery}
            placeholder="Search jobs..."
            emptyText="No jobs found"
            noun="job"
          />
        </FilterSection>
      )}

      {/* Health-check severity + diagnosis */}
      {(show.severity || show.diagnosis) && (
        <FilterSection
          title="Health checks"
          icon={<ExclamationTriangleIcon className="w-4 h-4 text-gray-600" />}
          isOpen={openSections.has('health')}
          onToggle={() => toggleSection('health')}
        >
          {show.severity && options.severities && options.severities.length > 0 && (
            <ToggleChipGroup
              label="Severity"
              options={options.severities}
              selected={filter.severities}
              onToggle={(v) => set({ severities: toggleInArray(filter.severities, v) })}
            />
          )}
          {show.diagnosis && diagnoses.length > 0 && (
            <SearchableMultiSelect
              label="Diagnosis"
              options={filteredDiagnoses}
              selected={filter.diagnosisCodes}
              onToggle={(id) => set({ diagnosisCodes: toggleInArray(filter.diagnosisCodes, id) })}
              searchQuery={diagnosisQuery}
              onSearchQueryChange={setDiagnosisQuery}
              placeholder="Search diagnoses..."
              emptyText="No diagnoses found"
              noun="diagnosis"
            />
          )}
        </FilterSection>
      )}

      {/* Dates */}
      {show.dates && (
        <FilterSection
          title="Dates"
          icon={<CalendarIcon className="w-4 h-4 text-gray-600" />}
          isOpen={openSections.has('dates')}
          onToggle={() => toggleSection('dates')}
        >
          <DateRangeField
            label="Created"
            after={filter.createdAfter}
            before={filter.createdBefore}
            onAfterChange={(v) => set({ createdAfter: v })}
            onBeforeChange={(v) => set({ createdBefore: v })}
          />
        </FilterSection>
      )}
    </FilterPanelShell>
  );
}

function optionMatches(opt: SelectOption, query: string): boolean {
  const q = query.toLowerCase();
  if (opt.id.toLowerCase().includes(q)) return true;
  if (typeof opt.label === 'string' && opt.label.toLowerCase().includes(q)) return true;
  if (typeof opt.sublabel === 'string' && opt.sublabel.toLowerCase().includes(q)) return true;
  return false;
}
