/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BooksDbUserBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import { bookmarkMatchKey } from '$lib/data/user-bookmark-ids';

/**
 * Legacy identity match for pre-migration rows without `syncId`: local
 * auto-increment `id`s are never stable across devices, so two rows are the
 * same bookmark if they share `exploredCharCount` and either `createdAt` or
 * `label`. Kept as the fallback until backfill completes fleet-wide.
 */
export function isSameBookmark(a: BooksDbUserBookmarkData, b: BooksDbUserBookmarkData): boolean {
  if (a.syncId && b.syncId) return a.syncId === b.syncId;
  return (
    a.exploredCharCount === b.exploredCharCount &&
    (a.createdAt === b.createdAt || a.label === b.label)
  );
}

/**
 * Adopt a single `syncId` for two rows that matched only on the legacy fuzzy
 * identity (same position, different `createdAt`, so each side derived a
 * different deterministic ID). Both sides take the lexicographically-smaller
 * ID and republish once; afterwards the rows match by `syncId` directly and
 * the duplication converges instead of oscillating.
 */
export function adoptConvergentSyncId(
  a: BooksDbUserBookmarkData,
  b: BooksDbUserBookmarkData
): string | undefined {
  if (!a.syncId || !b.syncId || a.syncId === b.syncId) return a.syncId || b.syncId;
  return a.syncId < b.syncId ? a.syncId : b.syncId;
}

/**
 * Union two bookmark arrays for the same book, per-`syncId`
 * last-write-wins over the *whole* row — including `deleted`/`deletedAt`,
 * which are ordinary fields, not a special tombstone branch. Used on publish
 * (`ApiStorageHandler.saveUserBookmarks`) so a device can never overwrite
 * remote rows (or deletions) it simply hasn't downloaded yet.
 */
export function mergeUserBookmarkArrays(
  local: BooksDbUserBookmarkData[],
  remote: BooksDbUserBookmarkData[]
): BooksDbUserBookmarkData[] {
  const merged = [...local];

  for (const remoteRow of remote) {
    const matchIndex = merged.findIndex((row) => isSameBookmark(row, remoteRow));

    if (matchIndex === -1) {
      merged.push(remoteRow);
    } else {
      const current = merged[matchIndex];
      const convergent = adoptConvergentSyncId(current, remoteRow);
      const winner =
        (remoteRow.lastModified || 0) > (current.lastModified || 0) ? remoteRow : current;
      merged[matchIndex] =
        convergent && convergent !== winner.syncId ? { ...winner, syncId: convergent } : winner;
    }
  }

  return merged;
}

/**
 * Canonical form for no-op comparison: order-independent JSON over transport
 * identity only. Local `id` and `dataId` are deliberately excluded — they are
 * per-device auto-increment values, so comparing them would make every
 * cross-device sync look "changed" and defeat the write-skip.
 */
export function canonicalizeUserBookmarks(rows: BooksDbUserBookmarkData[]): string {
  const stripped = rows.map((row) => {
    const { id: _id, dataId: _dataId, ...rest } = row;
    return rest;
  });
  return JSON.stringify(
    stripped.sort((a, b) => (bookmarkMatchKey(a) < bookmarkMatchKey(b) ? -1 : 1))
  );
}

/** True when two bookmark arrays hold the same rows regardless of order. */
export function areUserBookmarkArraysEqual(
  a: BooksDbUserBookmarkData[],
  b: BooksDbUserBookmarkData[]
): boolean {
  if (a.length !== b.length) return false;
  return canonicalizeUserBookmarks(a) === canonicalizeUserBookmarks(b);
}
