/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV10 from '$lib/data/database/books-db/versions/v10/books-db-v10';
import type { BooksDbV9StatisticData } from '$lib/data/database/books-db/versions/v9/books-db-v9';

/**
 * This device's own raw cumulative reading, keyed `(title, dateKey)`.
 * Written only by the local reading tracker in the same IndexedDB
 * transaction as the folded display row. Never written by sync pulls —
 * a pull recomputes `statistic` from whatever contributions are on hand.
 */
export interface BooksDbStatisticContribution extends BooksDbV9StatisticData {
  title: string;
  dateKey: string;
  charactersRead: number;
  readingTime: number;
  minReadingSpeed: number;
  altMinReadingSpeed: number;
  lastReadingSpeed: number;
  maxReadingSpeed: number;
  lastStatisticModified: number;
  completedBook?: number;
  completedData?: Omit<
    BooksDbStatisticContribution,
    'title' | 'lastStatisticModified' | 'deviceId' | 'year' | 'revision'
  >;
  /** Authoring device. Local writes always stamp the local deviceId. */
  deviceId: string;
  /** Calendar year derived from `dateKey` (`YYYY-MM-DD`). One stable cloud file per device/year. */
  year: number;
  /** Monotonic local revision for diagnostics and dominance checks. */
  revision: number;
}

/**
 * Local sync bookkeeping for statistics v2 (migration marker, per-file
 * revisions). Keyed by string id so future markers don't need new stores.
 */
export interface BooksDbStatisticSyncState {
  id: string;
  updatedAt: number;
  legacyMigrationCompletedAt?: number;
  legacyBaselineDeviceId?: string;
  revisionByFile?: Record<string, number>;
}

export default interface BooksDbV11 extends BooksDbV10 {
  statisticContribution: {
    key: string[];
    value: BooksDbStatisticContribution;
    indexes: {
      dateKey: string;
      year: number;
    };
  };
  statisticSyncState: {
    key: string;
    value: BooksDbStatisticSyncState;
  };
}
