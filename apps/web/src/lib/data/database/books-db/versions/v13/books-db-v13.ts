/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV12 from '$lib/data/database/books-db/versions/v12/books-db-v12';

/**
 * v13: reading-position records carry the authoring `deviceId` (optional, so
 * pre-v13 records keep working). The pair `(lastBookmarkModified, deviceId)`
 * is the deterministic last-write-wins key for positions (P6): both sides of
 * a sync compare the same two records and reach the same winner, regardless
 * of arrival order. Records without a deviceId sort before any stamped one.
 */
export type BooksDbV13BookmarkData = BooksDbV12['bookmark']['value'] & {
  deviceId?: string;
};

export default interface BooksDbV13 extends BooksDbV12 {
  bookmark: {
    key: number;
    value: BooksDbV13BookmarkData;
    indexes: {
      dataId: number;
    };
  };
}
