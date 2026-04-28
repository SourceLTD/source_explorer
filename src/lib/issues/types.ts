export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const ISSUE_PRIORITIES: IssuePriority[] = ['low', 'medium', 'high', 'critical'];

export interface Issue {
  id: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];
  created_by: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  changesets_count?: number;
}

export interface IssueChangesetSummary {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: string;
  status: string;
  created_by: string;
  created_at: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
}

export interface IssueWithChangesets extends Omit<Issue, 'changesets_count'> {
  changesets: IssueChangesetSummary[];
}

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const ISSUE_STATUS_STYLES: Record<IssueStatus, string> = {
  open: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-purple-100 text-purple-800 border-purple-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
};

export const ISSUE_PRIORITY_STYLES: Record<IssuePriority, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};
