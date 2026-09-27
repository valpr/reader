/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { normalizeProgress, parseBookmarkProgress } from '$lib/data/library-filters';
import { StorageDataType } from '$lib/data/storage/storage-types';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';

/**
 * Books whose reading state is older than this are never priority, even when
 * in-progress. A title untouched for 30+ days is not what the reader reaches
 * for first; it still syncs, just in phase 2 with everything else.
 */
export const PRIORITY_RECENCY_DAYS = 30;

export const PRIORITY_RECENCY_MS = PRIORITY_RECENCY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Phase-1 payload: the reader's top priority before starting to read is
 * reading position first, manual bookmarks second. Everything else
 * (statistics, goals, profiles, tags, audio, subtitles) follows in phase 2.
 */
export const READ_READY_DATA_TYPES = [StorageDataType.PROGRESS, StorageDataType.USER_BOOKMARKS];

/** A sync context enriched with the signals used for priority ranking. */
export interface PrioritizableContext extends ReplicationContext {
  /**
   * Raw reading progress. Strings cover legacy percent bookmarks ('42%');
   * classification rescales via `parseBookmarkProgress`.
   */
  progress?: number | string;
  /** Local `lastBookOpen` timestamp (0 when unknown). */
  lastBookOpen?: number;
  /** Local `lastBookmarkModified` timestamp (0 when unknown). */
  lastBookmarkModified?: number;
}

export interface SplitSyncContexts<T extends PrioritizableContext> {
  /** Currently-reading books, most-recently-opened first. */
  priority: T[];
  /** Everything else, in the caller's original order. */
  deferred: T[];
}

/**
 * A book is priority when it is genuinely in progress (`0 < p < 1` after
 * legacy normalization) and was opened within the recency window. Finished
 * (`p >= 1`), unread (`p <= 0`), and long-untouched books are deferred —
 * never skipped — to phase 2.
 */
export function isPriorityCandidate(
  context: PrioritizableContext,
  now: number = Date.now()
): boolean {
  // Compose both normalizers: parse handles legacy percent strings
  // ('42%'), normalize rescales legacy numeric percents (50 -> 0.5) that
  // the numeric path deliberately leaves unclamped.
  const p = normalizeProgress(parseBookmarkProgress(context.progress));
  if (!(p > 0 && p < 1)) return false;
  const lastOpen = context.lastBookOpen || 0;
  // No open timestamp but real progress (e.g. cloud-only merge state):
  // still priority — progress alone proves the book is being read.
  if (!lastOpen) return true;
  return now - lastOpen <= PRIORITY_RECENCY_MS;
}

function comparePriority(a: PrioritizableContext, b: PrioritizableContext): number {
  const openDiff = (b.lastBookOpen || 0) - (a.lastBookOpen || 0);
  if (openDiff !== 0) return openDiff;
  const bookmarkDiff = (b.lastBookmarkModified || 0) - (a.lastBookmarkModified || 0);
  if (bookmarkDiff !== 0) return bookmarkDiff;
  return (a.title || '').localeCompare(b.title || '');
}

/**
 * Split sync contexts into priority (currently reading) and deferred sets.
 * Priority is sorted most-recently-opened first so the book on the
 * nightstand syncs before the one touched three weeks ago; deferred keeps
 * the caller's original order so full-sync behavior is otherwise unchanged.
 */
export function splitSyncContexts<T extends PrioritizableContext>(
  contexts: T[],
  now: number = Date.now()
): SplitSyncContexts<T> {
  const priority: T[] = [];
  const deferred: T[] = [];
  for (const context of contexts) {
    if (isPriorityCandidate(context, now)) priority.push(context);
    else deferred.push(context);
  }
  priority.sort(comparePriority);
  return { priority, deferred };
}

/**
 * A mid-read jump-offer lead must exceed autosave-granularity jitter by an
 * order of magnitude: about a page of text, so scrolling a few paragraphs
 * never nags. Scales with book length for very short books.
 */
export const JUMP_OFFER_MIN_CHARS = 1000;
export const JUMP_OFFER_MIN_FRACTION = 0.02;

export type JumpCandidateSource = 'cloud' | 'bookmark';

export interface JumpCandidate {
  exploredCharCount: number;
  progress?: number;
  label?: string;
  source: JumpCandidateSource;
}

export function jumpOfferThreshold(bookCharCount: number): number {
  const total = Number(bookCharCount) || 0;
  if (total <= 0) return JUMP_OFFER_MIN_CHARS;
  return Math.max(JUMP_OFFER_MIN_CHARS, total * JUMP_OFFER_MIN_FRACTION);
}

/**
 * Furthest candidate strictly more than the threshold ahead of the current
 * position, or null (stay silent). Behind/equal-ish candidates never
 * surface: the reader is already there. Statistics and autosaves are
 * deliberately not candidates — autosaves never sync, statistics carry
 * volume without position, so neither can supply a jump target.
 */
export function findJumpCandidate(
  currentCharCount: number,
  bookCharCount: number,
  candidates: JumpCandidate[] | undefined | null
): JumpCandidate | null {
  const current = Number(currentCharCount) || 0;
  const threshold = jumpOfferThreshold(bookCharCount);
  let best: JumpCandidate | null = null;
  for (const candidate of candidates || []) {
    const position = Number(candidate?.exploredCharCount) || 0;
    if (position <= 0 || position - current <= threshold) continue;
    if (!best || position > best.exploredCharCount) best = candidate;
  }
  return best;
}
