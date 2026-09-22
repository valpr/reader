/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV13 from '$lib/data/database/books-db/versions/v13/books-db-v13';

/**
 * v14: `lastModified` rows carry the authoring `deviceId` (optional, so
 * pre-v14 rows keep working). Tag attribution (`[title, 'bookTags']` keys
 * written by `updateBookTags`) publishes it as `entries[key].deviceId`, and
 * the per-title last-write-wins merge uses the pair
 * `(modifiedAt, deviceId)` as its deterministic tie-break — the same pattern
 * v13 established for reading positions. No data migration: the field is
 * additive and absent on older rows.
 */
export type BooksDbV14LastModified = BooksDbV13['lastModified']['value'] & {
  deviceId?: string;
};

export default interface BooksDbV14 extends BooksDbV13 {
  lastModified: {
    key: string[];
    value: BooksDbV14LastModified;
  };
}
