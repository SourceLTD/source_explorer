/**
 * Version Control Comments Module
 * 
 * Provides functions for managing comments on changesets and field changes,
 * as well as unread tracking per user.
 */

import { prisma } from '@/lib/prisma';
import type { ChangeComment, CreateCommentInput, UnreadChangesetInfo, EntityType } from './types';

// ============================================
// Comment CRUD Operations
// ============================================

/**
 * Get comments for a changeset or field change.
 */
export async function getComments(filters: {
  changeset_id?: bigint;
  field_change_id?: bigint;
}): Promise<ChangeComment[]> {
  const where: Record<string, unknown> = {};
  
  if (filters.changeset_id !== undefined) {
    where.changeset_id = filters.changeset_id;
  }
  if (filters.field_change_id !== undefined) {
    where.field_change_id = filters.field_change_id;
  }
  
  const comments = await prisma.change_comments.findMany({
    where,
    orderBy: { created_at: 'asc' },
  });
  
  return comments.map(c => ({
    id: c.id,
    changeset_id: c.changeset_id,
    field_change_id: c.field_change_id,
    author: c.author,
    content: c.content,
    created_at: c.created_at,
  }));
}

/**
 * Add a new comment to a changeset or field change.
 * Automatically marks the changeset as read for the author so their own
 * comments don't show up as unread for them.
 */
export async function addComment(input: CreateCommentInput): Promise<ChangeComment> {
  const comment = await prisma.change_comments.create({
    data: {
      changeset_id: input.changeset_id ?? null,
      field_change_id: input.field_change_id ?? null,
      author: input.author,
      content: input.content,
    },
  });
  
  // Auto-mark as read for the author so their own comments don't appear unread
  if (input.changeset_id) {
    await markAsRead(input.author, input.changeset_id);
  }
  
  return {
    id: comment.id,
    changeset_id: comment.changeset_id,
    field_change_id: comment.field_change_id,
    author: comment.author,
    content: comment.content,
    created_at: comment.created_at,
  };
}

/**
 * Get the count of comments for multiple changesets.
 * Returns a map of changeset_id -> count.
 */
export async function getCommentCounts(changesetIds: bigint[]): Promise<Map<string, number>> {
  if (changesetIds.length === 0) {
    return new Map();
  }
  
  const counts = await prisma.change_comments.groupBy({
    by: ['changeset_id'],
    where: {
      changeset_id: { in: changesetIds },
    },
    _count: {
      id: true,
    },
  });
  
  const result = new Map<string, number>();
  for (const row of counts) {
    if (row.changeset_id) {
      result.set(row.changeset_id.toString(), row._count.id);
    }
  }
  return result;
}

// ============================================
// Unread Tracking Operations
// ============================================

/**
 * Mark a changeset's comments as read for a user.
 * Uses upsert to create or update the record.
 */
export async function markAsRead(userId: string, changesetId: bigint): Promise<void> {
  await prisma.comment_reads.upsert({
    where: {
      user_id_changeset_id: {
        user_id: userId,
        changeset_id: changesetId,
      },
    },
    update: {
      last_read_at: new Date(),
    },
    create: {
      user_id: userId,
      changeset_id: changesetId,
      last_read_at: new Date(),
    },
  });
}

/**
 * Get unread comment info for a user.
 * Returns changesets that have comments newer than the user's last read time.
 */
export async function getUnreadComments(userId: string): Promise<UnreadChangesetInfo[]> {
  // Get all pending changesets that have comments
  const changesetsWithComments = await prisma.changesets.findMany({
    where: {
      status: 'pending',
      change_comments: {
        some: {},
      },
    },
    include: {
      change_comments: {
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  });
  
  if (changesetsWithComments.length === 0) {
    return [];
  }
  
  // Get user's read records for these changesets
  const changesetIds = changesetsWithComments.map(c => c.id);
  const readRecords = await prisma.comment_reads.findMany({
    where: {
      user_id: userId,
      changeset_id: { in: changesetIds },
    },
  });
  
  const readMap = new Map(readRecords.map(r => [r.changeset_id.toString(), r.last_read_at]));
  
  // Filter to changesets with unread comments
  const unreadChangesets: UnreadChangesetInfo[] = [];
  
  for (const cs of changesetsWithComments) {
    const latestComment = cs.change_comments[0];
    if (!latestComment) continue;
    
    const lastReadAt = readMap.get(cs.id.toString());
    
    // If never read, or latest comment is newer than last read
    if (!lastReadAt || latestComment.created_at > lastReadAt) {
      // Get total comment count for this changeset
      const commentCount = await prisma.change_comments.count({
        where: { changeset_id: cs.id },
      });
      
      // Get display name from snapshots
      const snapshot = cs.before_snapshot || cs.after_snapshot;
      let entityDisplay = cs.entity_id ? `#${cs.entity_id}` : 'New';
      if (snapshot && typeof snapshot === 'object') {
        const s = snapshot as Record<string, unknown>;
        const name = s.word || s.name || s.code || s.gloss || s.label;
        if (name) {
          const nameStr = String(name);
          entityDisplay = `"${nameStr.substring(0, 30)}${nameStr.length > 30 ? '...' : ''}"`;
        }
      }
      
      unreadChangesets.push({
        changeset_id: cs.id.toString(),
        entity_type: cs.entity_type as EntityType,
        entity_display: entityDisplay,
        comment_count: commentCount,
        latest_comment: {
          author: latestComment.author,
          content: latestComment.content,
          created_at: latestComment.created_at.toISOString(),
        },
      });
    }
  }
  
  // Sort by latest comment time (most recent first)
  unreadChangesets.sort((a, b) => 
    new Date(b.latest_comment.created_at).getTime() - new Date(a.latest_comment.created_at).getTime()
  );
  
  return unreadChangesets;
}

/**
 * Get unread status for specific changesets for a user.
 * Returns a Set of changeset IDs that have unread comments.
 */
export async function getUnreadStatusForChangesets(
  userId: string,
  changesetIds: bigint[]
): Promise<Set<string>> {
  if (changesetIds.length === 0) {
    return new Set();
  }
  
  // Get latest comment time for each changeset
  const latestComments = await prisma.change_comments.groupBy({
    by: ['changeset_id'],
    where: {
      changeset_id: { in: changesetIds },
    },
    _max: {
      created_at: true,
    },
  });
  
  if (latestComments.length === 0) {
    return new Set();
  }
  
  // Get read records for the user
  const readRecords = await prisma.comment_reads.findMany({
    where: {
      user_id: userId,
      changeset_id: { in: changesetIds },
    },
  });
  
  const readMap = new Map(readRecords.map(r => [r.changeset_id.toString(), r.last_read_at]));
  
  const unreadIds = new Set<string>();
  
  for (const row of latestComments) {
    if (!row.changeset_id || !row._max.created_at) continue;
    
    const csId = row.changeset_id.toString();
    const lastReadAt = readMap.get(csId);
    
    if (!lastReadAt || row._max.created_at > lastReadAt) {
      unreadIds.add(csId);
    }
  }
  
  return unreadIds;
}

