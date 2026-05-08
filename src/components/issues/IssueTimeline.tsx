'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  LinkIcon,
  XCircleIcon,
  TagIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowPathRoundedSquareIcon,
  FlagIcon,
  UserIcon,
  DocumentTextIcon,
  LockClosedIcon,
  LockOpenIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '../LoadingSpinner';
import type {
  IssueComment,
  IssueEvent,
  IssueEventType,
  IssueTimelineEntry,
} from '@/lib/issues/types';
import {
  SYSTEM_USER_ID,
  SYSTEM_USER_DISPLAY_NAME,
} from '@/lib/users/displayName';

interface IssueTimelineProps {
  issueId: string;
  issueTitle: string;
  /**
   * Invalidate signal — whenever this changes, refetch the timeline.
   * Used by parent to poke the timeline after an external mutation
   * (e.g. status change from the header selects).
   */
  refreshKey?: number;
}

interface TimelineResponse {
  entries: IssueTimelineEntry[];
  current_user: string;
}

function formatUserName(user: string): string {
  if (!user) return 'Unknown';
  if (user === 'current-user') return 'You';
  if (user === SYSTEM_USER_ID) return SYSTEM_USER_DISPLAY_NAME;
  if (user === 'system:llm-agent') return 'LLM Agent';
  if (user.includes('@')) {
    const name = user.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return user.charAt(0).toUpperCase() + user.slice(1);
}

function getInitials(user: string): string {
  const formatted = formatUserName(user);
  if (formatted === 'You' || formatted === 'Unknown') return formatted[0];
  return formatted.slice(0, 2).toUpperCase();
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.round((now - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Avatar({ user, size = 'md' }: { user: string; size?: 'sm' | 'md' }) {
  const cls =
    size === 'sm'
      ? 'w-6 h-6 text-[10px]'
      : 'w-8 h-8 text-xs';
  return (
    <div
      className={`${cls} shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm`}
      title={formatUserName(user)}
    >
      {getInitials(user)}
    </div>
  );
}

function EventIcon({ type }: { type: IssueEventType }) {
  const className = 'w-4 h-4';
  switch (type) {
    case 'opened':
      return <FlagIcon className={`${className} text-emerald-600`} />;
    case 'closed':
      return <LockClosedIcon className={`${className} text-purple-600`} />;
    case 'reopened':
      return <LockOpenIcon className={`${className} text-emerald-600`} />;
    case 'status_changed':
      return <ArrowPathRoundedSquareIcon className={`${className} text-blue-600`} />;
    case 'priority_changed':
      return <SparklesIcon className={`${className} text-amber-600`} />;
    case 'title_changed':
    case 'description_changed':
      return <DocumentTextIcon className={`${className} text-gray-600`} />;
    case 'labels_changed':
      return <TagIcon className={`${className} text-gray-600`} />;
    case 'assignee_changed':
      return <UserIcon className={`${className} text-gray-600`} />;
    case 'changeset_linked':
      return <LinkIcon className={`${className} text-blue-600`} />;
    case 'changeset_unlinked':
      return <LinkIcon className={`${className} text-gray-400`} />;
    case 'changeset_committed':
      return <CheckCircleIcon className={`${className} text-green-600`} />;
    case 'changeset_discarded':
      return <XCircleIcon className={`${className} text-red-600`} />;
    default:
      return <ChatBubbleLeftIcon className={`${className} text-gray-600`} />;
  }
}

function formatEnumValue(v: unknown): string {
  if (typeof v !== 'string') return String(v ?? '—');
  return v.replace(/_/g, ' ');
}

function ChangesetRef({
  meta,
}: {
  meta: Record<string, unknown> | null;
}) {
  if (!meta) return null;
  const csId = String(meta.changeset_id ?? '?');
  const entity = meta.entity_type ? String(meta.entity_type) : '';
  const entityId = meta.entity_id ? `#${meta.entity_id}` : '';
  const op = meta.operation ? String(meta.operation) : '';
  return (
    <span className="font-mono text-xs text-gray-700">
      changeset #{csId}
      {entity ? ` (${op} ${entity}${entityId ? ` ${entityId}` : ''})` : ''}
    </span>
  );
}

function EventDescription({ event }: { event: IssueEvent }) {
  const meta = event.metadata;
  const actor = <span className="font-medium text-gray-900">{formatUserName(event.actor)}</span>;
  switch (event.event_type) {
    case 'opened':
      return <span>{actor} opened this issue</span>;
    case 'closed': {
      const to = meta?.to ? String(meta.to) : 'closed';
      return (
        <span>
          {actor} closed this issue as{' '}
          <span className="font-mono text-xs text-gray-700">{formatEnumValue(to)}</span>
        </span>
      );
    }
    case 'reopened':
      return <span>{actor} reopened this issue</span>;
    case 'status_changed':
      return (
        <span>
          {actor} changed status from{' '}
          <span className="font-mono text-xs text-gray-700">
            {formatEnumValue(meta?.from)}
          </span>{' '}
          to{' '}
          <span className="font-mono text-xs text-gray-700">
            {formatEnumValue(meta?.to)}
          </span>
        </span>
      );
    case 'priority_changed':
      return (
        <span>
          {actor} changed priority from{' '}
          <span className="font-mono text-xs text-gray-700">
            {formatEnumValue(meta?.from)}
          </span>{' '}
          to{' '}
          <span className="font-mono text-xs text-gray-700">
            {formatEnumValue(meta?.to)}
          </span>
        </span>
      );
    case 'title_changed': {
      const fromTitle = meta?.from != null ? String(meta.from) : null;
      const toTitle = meta?.to != null ? String(meta.to) : null;
      return (
        <span>
          {actor} changed the title
          {fromTitle && toTitle && (
            <>
              {' '}from <span className="italic text-gray-700">“{fromTitle}”</span> to{' '}
              <span className="italic text-gray-700">“{toTitle}”</span>
            </>
          )}
        </span>
      );
    }
    case 'description_changed':
      return <span>{actor} updated the description</span>;
    case 'labels_changed': {
      const added = Array.isArray(meta?.added) ? (meta!.added as string[]) : [];
      const removed = Array.isArray(meta?.removed) ? (meta!.removed as string[]) : [];
      return (
        <span>
          {actor}{' '}
          {added.length > 0 && (
            <>
              added{' '}
              {added.map((l, i) => (
                <span key={l}>
                  <span className="inline-flex px-1.5 py-0.5 rounded-full border text-[10px] bg-gray-100 text-gray-700 border-gray-200">
                    {l}
                  </span>
                  {i < added.length - 1 ? ' ' : ''}
                </span>
              ))}
            </>
          )}
          {added.length > 0 && removed.length > 0 && <> and </>}
          {removed.length > 0 && (
            <>
              removed{' '}
              {removed.map((l, i) => (
                <span key={l}>
                  <span className="inline-flex px-1.5 py-0.5 rounded-full border text-[10px] bg-gray-100 text-gray-700 border-gray-200 line-through">
                    {l}
                  </span>
                  {i < removed.length - 1 ? ' ' : ''}
                </span>
              ))}
            </>
          )}
        </span>
      );
    }
    case 'assignee_changed':
      return (
        <span>
          {actor} changed the assignee from{' '}
          <span className="text-gray-700">
            {meta?.from ? formatUserName(String(meta.from)) : 'nobody'}
          </span>{' '}
          to{' '}
          <span className="text-gray-700">
            {meta?.to ? formatUserName(String(meta.to)) : 'nobody'}
          </span>
        </span>
      );
    case 'changeset_linked':
      return (
        <span>
          {actor} linked <ChangesetRef meta={meta} />
        </span>
      );
    case 'changeset_unlinked':
      return (
        <span>
          {actor} unlinked <ChangesetRef meta={meta} />
        </span>
      );
    case 'changeset_committed':
      return (
        <span>
          {actor} committed <ChangesetRef meta={meta} />
        </span>
      );
    case 'changeset_discarded':
      return (
        <span>
          {actor} discarded <ChangesetRef meta={meta} />
        </span>
      );
    default:
      return <span>{actor} did something</span>;
  }
}

// --- Comment card --------------------------------------------------------

function CommentCard({
  comment,
  canMutate,
  onEdit,
  onDelete,
}: {
  comment: IssueComment;
  canMutate: boolean;
  onEdit: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setDraft(comment.content);
  }, [comment.content]);

  const handleSave = async () => {
    const text = draft.trim();
    if (!text) {
      setError('Comment cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onEdit(text);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      await onDelete();
      setConfirmingDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-3">
      <Avatar user={comment.author} />
      <div className="flex-1 min-w-0 border border-gray-200 rounded-lg bg-white overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">
              {formatUserName(comment.author)}
            </span>{' '}
            commented
            <span className="text-gray-500">
              {' '}· {formatRelative(comment.created_at)}
            </span>
            {comment.edited && !comment.deleted && (
              <span className="text-gray-400 text-xs ml-1">(edited)</span>
            )}
          </div>
          {canMutate && !comment.deleted && !editing && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                title="Edit"
              >
                <PencilSquareIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                title="Delete"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="p-3">
          {comment.deleted ? (
            <div className="text-sm italic text-gray-400">
              This comment was deleted.
            </div>
          ) : editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                disabled={saving}
              />
              {error && (
                <div className="text-xs text-red-600">{error}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(comment.content);
                    setError(null);
                  }}
                  disabled={saving}
                  className="px-3 py-1 rounded-md border border-gray-300 text-xs text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : confirmingDelete ? (
            <div className="space-y-2">
              <div className="text-sm text-gray-700">Delete this comment?</div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                  className="px-3 py-1 rounded-md border border-gray-300 text-xs text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-3 py-1 rounded-md bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Deleting…' : 'Delete'}
                </button>
              </div>
              {error && (
                <div className="text-xs text-red-600">{error}</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
              {comment.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Event row -----------------------------------------------------------

function EventRow({ event }: { event: IssueEvent }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-white border border-gray-200">
        <EventIcon type={event.event_type} />
      </div>
      <div className="flex-1 text-gray-700 leading-tight">
        <EventDescription event={event} />
        <span className="text-gray-400 text-xs"> · {formatRelative(event.created_at)}</span>
      </div>
    </div>
  );
}

// --- Main component ------------------------------------------------------

export default function IssueTimeline({
  issueId,
  issueTitle,
  refreshKey = 0,
}: IssueTimelineProps) {
  const [entries, setEntries] = useState<IssueTimelineEntry[] | null>(null);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/issues/${issueId}/timeline`);
        if (!res.ok) throw new Error('Failed to load timeline');
        const data = (await res.json()) as TimelineResponse;
        setEntries(data.entries);
        setCurrentUser(data.current_user);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load timeline');
      } finally {
        setLoading(false);
      }
    },
    [issueId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handlePost = async () => {
    const text = composerValue.trim();
    if (!text) {
      setComposerError('Write something first');
      return;
    }
    setPosting(true);
    setComposerError(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to post');
      }
      setComposerValue('');
      await load({ silent: true });
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const handleEditComment = async (id: string, content: string) => {
    const res = await fetch(`/api/issue-comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to edit');
    }
    await load({ silent: true });
  };

  const handleDeleteComment = async (id: string) => {
    const res = await fetch(`/api/issue-comments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete');
    }
    await load({ silent: true });
  };

  // We render events as thin rows and comments as cards. The visual "track"
  // (vertical line) stays consistent between the two so the timeline reads
  // naturally top-to-bottom.

  const list = useMemo(() => entries ?? [], [entries]);

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <ChatBubbleLeftIcon className="w-4 h-4" />
        Activity
        {list.length > 0 && (
          <span className="text-xs text-gray-500 font-normal">
            ({list.length})
          </span>
        )}
      </h3>

      {loading && !entries ? (
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md p-3">
          {error}
        </div>
      ) : list.length === 0 ? (
        <div className="text-sm text-gray-400 italic border border-dashed border-gray-200 rounded-md p-6 text-center">
          No activity yet. Be the first to comment on “{issueTitle}”.
        </div>
      ) : (
        <div className="relative">
          {/* Vertical track behind the icons/avatars */}
          <div
            className="absolute left-4 top-0 bottom-0 w-px bg-gray-200"
            aria-hidden="true"
          />
          <ul className="relative space-y-4">
            {list.map((entry) => (
              <li key={`${entry.kind}-${entry.id}`} className="pl-0">
                {entry.kind === 'comment' ? (
                  <CommentCard
                    comment={entry}
                    canMutate={
                      !!currentUser &&
                      entry.author === currentUser &&
                      !entry.deleted
                    }
                    onEdit={(content) => handleEditComment(entry.id, content)}
                    onDelete={() => handleDeleteComment(entry.id)}
                  />
                ) : (
                  <EventRow event={entry} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div ref={bottomRef} />

      <div className="mt-6 flex gap-3">
        <Avatar user={currentUser || 'current-user'} />
        <div className="flex-1 min-w-0 border border-gray-200 rounded-lg bg-white overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm text-gray-700">
            Write a comment
          </div>
          <div className="p-3 space-y-2">
            <textarea
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              placeholder="Leave a comment…"
              rows={3}
              disabled={posting}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y disabled:opacity-50"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handlePost();
                }
              }}
            />
            {composerError && (
              <div className="text-xs text-red-600">{composerError}</div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                ⌘/Ctrl + Enter to send
              </span>
              <button
                onClick={handlePost}
                disabled={posting || !composerValue.trim()}
                className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {posting ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
