/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type BooksDbV8 from '$lib/data/database/books-db/versions/v8/books-db-v8';

export interface BooksDbV9StatisticData {
  /** Seconds spent reading during each hour of the day (0..23). Array length 24. */
  readingTimeByHour?: number[];
  /** Total dictionary/vocabulary lookups triggered during reading on this date. */
  lookupCount?: number;
  /** Number of discrete reading sessions on this date. */
  sessionCount?: number;
  /** Longest single unbroken reading session duration in seconds. */
  longestSessionSeconds?: number;
  /** Furthest reading progress reached (0.0 to 1.0) on this book. */
  maxProgress?: number;
}

export type BooksDbV9Statistic = BooksDbV8['statistic']['value'] & BooksDbV9StatisticData;

export default interface BooksDbV9 extends BooksDbV8 {
  statistic: {
    key: string[];
    value: BooksDbV9Statistic;
    indexes: {
      dateKey: string;
      completedBook: (string | number | [])[];
    };
  };
}
