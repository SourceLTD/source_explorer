'use client';

import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  type Issue,
  type IssueStatus,
  type IssuePriority,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_STYLES,
  ISSUE_PRIORITY_STYLES,
} from '@/lib/issues/types';

export interface IssueContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  issueId: string | null;
}

export type IssuePatch = Partial<
  Pick<Issue, 'status' | 'priority' | 'assignee'>
>;

interface IssueContextMenuProps {
  contextMenu: IssueContextMenuState;
  issue: Issue | null;
  onClose: () => void;
  onOpen: (issue: Issue) => void;
  onPatch: (issue: Issue, patch: IssuePatch) => void;
}

/**
 * Right-click context menu for issue rows. Visually mirrors the
 * `DataTable/ContextMenu.tsx` used in tabular mode (rounded-xl card,
 * gray-50 header, blue hover on items, thin gray dividers between
 * sections) so the two feel like the same component family.
 */
export default function IssueContextMenu({
  contextMenu,
  issue,
  onClose,
  onOpen,
  onPatch,
}: IssueContextMenuProps) {
  if (!contextMenu.isOpen || !issue) return null;

  const handlePromptAssignee = () => {
    // Assignee is free-form text in the schema, so a native prompt is
    // the lightest-weight UX that doesn't require its own popover.
    const next = window.prompt('Assignee:', issue.assignee ?? '');
    if (next === null) return;
    const trimmed = next.trim();
    onPatch(issue, { assignee: trimmed.length === 0 ? null : trimmed });
  };

  return (
    <div
      className="fixed bg-white rounded-xl border border-gray-200 py-1 z-50 min-w-56 shadow-lg"
      style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="text-xs font-mono text-blue-600">#{issue.id}</div>
        <div className="text-xs text-gray-600 mt-1 truncate max-w-xs">
          {issue.title}
        </div>
      </div>

      <div className="py-1">
        <button
          onClick={() => {
            onClose();
            onOpen(issue);
          }}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          Open issue
        </button>
      </div>

      <div className="border-t border-gray-200 my-1" />

      <SectionLabel>Status</SectionLabel>
      {ISSUE_STATUSES.map((status) => {
        const isCurrent = issue.status === status;
        return (
          <OptionButton
            key={status}
            isCurrent={isCurrent}
            onClick={() => {
              onClose();
              if (!isCurrent) onPatch(issue, { status });
            }}
          >
            <span
              className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${ISSUE_STATUS_STYLES[status]}`}
            >
              {ISSUE_STATUS_LABELS[status]}
            </span>
          </OptionButton>
        );
      })}

      <div className="border-t border-gray-200 my-1" />

      <SectionLabel>Priority</SectionLabel>
      {ISSUE_PRIORITIES.map((priority) => {
        const isCurrent = issue.priority === priority;
        return (
          <OptionButton
            key={priority}
            isCurrent={isCurrent}
            onClick={() => {
              onClose();
              if (!isCurrent) onPatch(issue, { priority });
            }}
          >
            <span
              className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${ISSUE_PRIORITY_STYLES[priority]}`}
            >
              {ISSUE_PRIORITY_LABELS[priority]}
            </span>
          </OptionButton>
        );
      })}

      <div className="border-t border-gray-200 my-1" />

      <SectionLabel
        right={
          issue.assignee ? (
            <span className="text-gray-700 normal-case font-normal truncate ml-2 max-w-[10rem]">
              {issue.assignee}
            </span>
          ) : (
            <span className="text-gray-400 italic normal-case font-normal">
              unassigned
            </span>
          )
        }
      >
        Assignee
      </SectionLabel>
      <button
        onClick={() => {
          onClose();
          handlePromptAssignee();
        }}
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
      >
        <UserIcon className="w-4 h-4" />
        Set assignee…
      </button>
      {issue.assignee && (
        <button
          onClick={() => {
            onClose();
            onPatch(issue, { assignee: null });
          }}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
        >
          <XMarkIcon className="w-4 h-4" />
          Unassign
        </button>
      )}
    </div>
  );
}

function SectionLabel({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-gray-500 font-semibold flex items-center justify-between">
      <span>{children}</span>
      {right}
    </div>
  );
}

function OptionButton({
  isCurrent,
  onClick,
  children,
}: {
  isCurrent: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isCurrent}
      onClick={onClick}
      className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 ${
        isCurrent
          ? 'text-gray-900 bg-gray-50 cursor-default'
          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      <span className="inline-flex items-center justify-center w-4 shrink-0">
        {isCurrent ? (
          <CheckIcon className="w-4 h-4 text-emerald-600" />
        ) : null}
      </span>
      {children}
    </button>
  );
}
