/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV14 from '$lib/data/database/books-db/versions/v14/books-db-v14';

/**
 * v15: user bookmarks carry a deterministic `syncId` (UUIDv5 over
 * `(normalizedTitle, exploredCharCount, createdAt)` — see
 * `user-bookmark-ids.ts`) plus soft-delete state (`deleted`/`deletedAt`).
 * Deletion becomes an ordinary field with its own timestamp, so plain
 * per-`syncId` last-write-wins propagates removals without a tombstone
 * store. All three fields are optional so pre-v15 rows keep working; rows
 * without `syncId` match on the legacy fuzzy identity until backfill
 * completes. Adds a `syncId` index for the merge lookup.
 */
export type BooksDbV15UserBookmarkData = BooksDbV14['userBookmark']['value'] & {
  syncId?: string;
  deleted?: boolean;
  deletedAt?: number;
};

export default interface BooksDbV15 extends BooksDbV14 {
  userBookmark: {
    key: number;
    value: BooksDbV15UserBookmarkData;
    indexes: {
      dataId: number;
      syncId: string;
    };
  };
}
