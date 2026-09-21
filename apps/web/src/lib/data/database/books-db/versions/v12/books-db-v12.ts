/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV11 from '$lib/data/database/books-db/versions/v11/books-db-v11';
import type { BooksDbStatisticContribution } from '$lib/data/database/books-db/versions/v11/books-db-v11';

/**
 * Cached contributions downloaded from other devices, keyed
 * `(deviceId, title, dateKey)`. Written only by sync pulls — never by the
 * local tracker — so the folded display row can be recomputed from local +
 * remote stores at any time without double-counting.
 *
 * The local device's own rows live in `statisticContribution`; the fold
 * always prefers that store for the local deviceId and ignores any cached
 * remote rows stamped with it.
 */
export interface BooksDbRemoteStatisticContribution extends BooksDbStatisticContribution {
  cachedAt: number;
}

export default interface BooksDbV12 extends BooksDbV11 {
  statisticRemoteContribution: {
    key: string[];
    value: BooksDbRemoteStatisticContribution;
    indexes: {
      byDevice: string;
      byBook: string[];
    };
  };
}
