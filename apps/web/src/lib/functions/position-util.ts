/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';

/**
 * Reading-position conflict resolution (P6): last-write-wins on
 * `lastBookmarkModified`, with a deterministic `(modifiedAt, deviceId)`
 * tie-break. Both sides of a sync compare the same two records, so they
 * elect the same winner regardless of arrival order. Records without a
 * deviceId (pre-v13) sort before any stamped record.
 *
 * An explicit restore (checkpoint click, resume) must be a durable write of
 * a *newer* record — stamping `Date.now()` — so the restored position wins
 * the next comparison instead of flip-flopping. A toast that expires without
 * writing anything is not conflict resolution.
 */
export function isPositionNewerThan(
  incoming: BooksDbBookmarkData | undefined,
  existing: BooksDbBookmarkData | undefined
): boolean {
  if (!incoming) return false;
  if (!existing) return true;
  const incomingModified = incoming.lastBookmarkModified || 0;
  const existingModified = existing.lastBookmarkModified || 0;
  if (incomingModified !== existingModified) {
    return incomingModified > existingModified;
  }
  return (incoming.deviceId || '') >= (existing.deviceId || '');
}
