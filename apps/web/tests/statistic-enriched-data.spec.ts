/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { mergeStatistics } from '../src/lib/functions/statistic-util';
import type { BooksDbStatistic } from '../src/lib/data/database/books-db/versions/books-db';

test.describe('Enriched statistics data and merging (v9)', () => {
  test('merges readingTimeByHour, lookupCount, session metrics, and maxProgress cleanly', () => {
    const existing: BooksDbStatistic[] = [
      {
        title: 'Book A',
        dateKey: '2026-09-16',
        charactersRead: 5000,
        readingTime: 600,
        minReadingSpeed: 10000,
        altMinReadingSpeed: 10000,
        lastReadingSpeed: 30000,
        maxReadingSpeed: 35000,
        lastStatisticModified: 1000,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 300, 0, 0, 0, 0, 0, 0, 0, 0
        ],
        lookupCount: 5,
        sessionCount: 2,
        longestSessionSeconds: 300,
        maxProgress: 0.15
      }
    ];

    const incoming: BooksDbStatistic[] = [
      {
        title: 'Book A',
        dateKey: '2026-09-16',
        charactersRead: 8000,
        readingTime: 1200,
        minReadingSpeed: 10000,
        altMinReadingSpeed: 10000,
        lastReadingSpeed: 32000,
        maxReadingSpeed: 38000,
        lastStatisticModified: 2000,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 600, 300, 0, 0, 0, 0, 0, 0, 0
        ],
        lookupCount: 12,
        sessionCount: 4,
        longestSessionSeconds: 600,
        maxProgress: 0.28
      }
    ];

    const merged = mergeStatistics(incoming, existing, true);
    expect(merged).toHaveLength(1);
    const result = merged[0];

    expect(result.charactersRead).toBe(8000);
    expect(result.readingTime).toBe(1200);
    expect(result.lookupCount).toBe(12);
    expect(result.sessionCount).toBe(4);
    expect(result.longestSessionSeconds).toBe(600);
    expect(result.maxProgress).toBe(0.28);
    expect(result.readingTimeByHour).toBeDefined();
    expect(result.readingTimeByHour?.[15]).toBe(600);
    expect(result.readingTimeByHour?.[16]).toBe(300);
  });

  test('preserves enriched telemetry from earlier record if newer record lacks them', () => {
    const existingWithTelemetry: BooksDbStatistic[] = [
      {
        title: 'Book B',
        dateKey: '2026-09-16',
        charactersRead: 4000,
        readingTime: 500,
        minReadingSpeed: 10000,
        altMinReadingSpeed: 10000,
        lastReadingSpeed: 28000,
        maxReadingSpeed: 30000,
        lastStatisticModified: 1000,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 500, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ],
        lookupCount: 8,
        sessionCount: 1,
        longestSessionSeconds: 500,
        maxProgress: 0.12
      }
    ];

    // Simulating an incoming update from a legacy client that does not populate enriched fields
    const incomingLegacy: BooksDbStatistic[] = [
      {
        title: 'Book B',
        dateKey: '2026-09-16',
        charactersRead: 6000,
        readingTime: 800,
        minReadingSpeed: 10000,
        altMinReadingSpeed: 10000,
        lastReadingSpeed: 29000,
        maxReadingSpeed: 31000,
        lastStatisticModified: 2000
      }
    ];

    const merged = mergeStatistics(incomingLegacy, existingWithTelemetry, true);
    expect(merged).toHaveLength(1);
    const result = merged[0];

    expect(result.charactersRead).toBe(6000);
    expect(result.lookupCount).toBe(8);
    expect(result.sessionCount).toBe(1);
    expect(result.longestSessionSeconds).toBe(500);
    expect(result.maxProgress).toBe(0.12);
    expect(result.readingTimeByHour).toBeDefined();
    expect(result.readingTimeByHour?.[14]).toBe(500);
  });

  test('merges concurrent offline sessions across different hours and profiles without overwriting', () => {
    // Phone read offline at 8 AM with mobile profile
    const phoneRecord: BooksDbStatistic = {
      title: 'Book C',
      dateKey: '2026-09-16',
      charactersRead: 2000,
      readingTime: 600,
      minReadingSpeed: 12000,
      altMinReadingSpeed: 12000,
      lastReadingSpeed: 12000,
      maxReadingSpeed: 12000,
      lastStatisticModified: 1000,
      charactersByHour: [0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      readingTimeByHour: [0, 0, 0, 0, 0, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      lookupsByHour: [0, 0, 0, 0, 0, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      readingTimeByProfile: { 'default-mobile': 600 }
    };

    // Laptop read offline at 8 PM with desktop profile
    const laptopRecord: BooksDbStatistic = {
      title: 'Book C',
      dateKey: '2026-09-16',
      charactersRead: 3500,
      readingTime: 1200,
      minReadingSpeed: 10500,
      altMinReadingSpeed: 10500,
      lastReadingSpeed: 10500,
      maxReadingSpeed: 10500,
      lastStatisticModified: 2000,
      charactersByHour: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3500, 0, 0, 0],
      readingTimeByHour: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1200, 0, 0, 0
      ],
      lookupsByHour: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0],
      readingTimeByProfile: { 'default-desktop': 1200 }
    };

    const merged = mergeStatistics([laptopRecord], [phoneRecord], true);
    expect(merged).toHaveLength(1);
    const result = merged[0];

    // Both hours are preserved
    expect(result.charactersByHour?.[8]).toBe(2000);
    expect(result.charactersByHour?.[20]).toBe(3500);
    expect(result.readingTimeByHour?.[8]).toBe(600);
    expect(result.readingTimeByHour?.[20]).toBe(1200);
    expect(result.lookupsByHour?.[8]).toBe(15);
    expect(result.lookupsByHour?.[20]).toBe(25);

    // Both profiles are preserved
    expect(result.readingTimeByProfile?.['default-mobile']).toBe(600);
    expect(result.readingTimeByProfile?.['default-desktop']).toBe(1200);
  });

  test('merges telemetry bidirectionally even when incoming record has an older lastStatisticModified timestamp', () => {
    // Phone read offline in morning with mobile profile (older lastStatisticModified)
    const phoneRecord: BooksDbStatistic = {
      title: 'Book C',
      dateKey: '2026-09-16',
      charactersRead: 2000,
      readingTime: 600,
      minReadingSpeed: 12000,
      altMinReadingSpeed: 12000,
      lastReadingSpeed: 12000,
      maxReadingSpeed: 12000,
      lastStatisticModified: 1000,
      charactersByHour: [0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      readingTimeByHour: [0, 0, 0, 0, 0, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      lookupsByHour: [0, 0, 0, 0, 0, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      readingTimeByProfile: { 'default-mobile': 600 }
    };

    // Laptop has newer reading session from evening (newer lastStatisticModified)
    const laptopRecord: BooksDbStatistic = {
      title: 'Book C',
      dateKey: '2026-09-16',
      charactersRead: 3500,
      readingTime: 1200,
      minReadingSpeed: 10500,
      altMinReadingSpeed: 10500,
      lastReadingSpeed: 10500,
      maxReadingSpeed: 10500,
      lastStatisticModified: 2000,
      charactersByHour: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3500, 0, 0, 0],
      readingTimeByHour: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1200, 0, 0, 0
      ],
      lookupsByHour: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 0],
      readingTimeByProfile: { 'default-desktop': 1200 }
    };

    // Incoming is phone (older modified timestamp), existing on device is laptop (newer)
    const merged = mergeStatistics([phoneRecord], [laptopRecord], true);
    expect(merged).toHaveLength(1);
    const result = merged[0];

    // Newer scalar metrics preserved from existing laptop record
    expect(result.charactersRead).toBe(3500);
    expect(result.readingTime).toBe(1200);

    // Telemetry from older incoming record must NOT be dropped
    expect(result.charactersByHour?.[8]).toBe(2000);
    expect(result.charactersByHour?.[20]).toBe(3500);
    expect(result.readingTimeByHour?.[8]).toBe(600);
    expect(result.readingTimeByHour?.[20]).toBe(1200);
    expect(result.lookupsByHour?.[8]).toBe(15);
    expect(result.lookupsByHour?.[20]).toBe(25);

    // Both profiles preserved
    expect(result.readingTimeByProfile?.['default-mobile']).toBe(600);
    expect(result.readingTimeByProfile?.['default-desktop']).toBe(1200);
  });
});
