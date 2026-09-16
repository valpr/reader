/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';
import type { ReaderProfile } from '$lib/data/profiles/profile-types';
import {
  calculateDropOffAnalysis,
  calculateLookbackMetrics,
  calculateProfileBreakdown,
  computeLongestStreak,
  extractAvailableYears
} from '$lib/components/statistics/statistics-lookback/lookback-calculator';

test.describe('Reading Lookback Calculator', () => {
  const dummyProfiles: ReaderProfile[] = [
    {
      id: 'default-desktop',
      name: 'PC / Desktop',
      icon: 'desktop',
      updatedAt: 1,
      settings: {} as any
    },
    {
      id: 'default-mobile',
      name: 'Mobile / Phone',
      icon: 'mobile',
      updatedAt: 1,
      settings: {} as any
    },
    {
      id: 'default-tablet',
      name: 'Tablet / E-Reader',
      icon: 'tablet',
      updatedAt: 1,
      settings: {} as any
    }
  ];

  test('extractAvailableYears extracts and sorts years descending', () => {
    const stats: Partial<BooksDbStatistic>[] = [
      { dateKey: '2024-05-10' },
      { dateKey: '2026-01-01' },
      { dateKey: '2025-11-20' },
      { dateKey: '2024-12-31' }
    ];
    const years = extractAvailableYears(stats as BooksDbStatistic[]);
    expect(years).toEqual([2026, 2025, 2024]);
  });

  test('computeLongestStreak calculates consecutive days correctly', () => {
    const dates = new Set([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03', // 3 day streak
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10' // 5 day streak
    ]);
    expect(computeLongestStreak(dates)).toBe(5);
  });

  test('calculateDropOffAnalysis identifies cliff and median abandonment percentage', () => {
    const topBooks = [
      // Completed book (should not be in drop-off calculation)
      {
        title: 'Finished Novel',
        readingTimeSeconds: 10000,
        charactersRead: 50000,
        lookupCount: 10,
        maxProgress: 1.0,
        completed: true,
        rank: 1
      },
      // Abandoned at 15%
      {
        title: 'Book A',
        readingTimeSeconds: 2000,
        charactersRead: 10000,
        lookupCount: 5,
        maxProgress: 0.15,
        completed: false,
        rank: 2
      },
      // Abandoned at 22%
      {
        title: 'Book B',
        readingTimeSeconds: 3000,
        charactersRead: 15000,
        lookupCount: 8,
        maxProgress: 0.22,
        completed: false,
        rank: 3
      },
      // Abandoned at 25%
      {
        title: 'Book C',
        readingTimeSeconds: 3500,
        charactersRead: 17000,
        lookupCount: 12,
        maxProgress: 0.25,
        completed: false,
        rank: 4
      },
      // Abandoned at 80%
      {
        title: 'Book D',
        readingTimeSeconds: 9000,
        charactersRead: 40000,
        lookupCount: 30,
        maxProgress: 0.8,
        completed: false,
        rank: 5
      }
    ];

    const result = calculateDropOffAnalysis(topBooks);
    expect(result.abandonedBooksCount).toBe(4);
    // Modal bucket should be 20-30% (contains Book B at 22% and Book C at 25%)
    expect(result.modalDropOffBracket).toBe('20–30%');
    // Median of [15, 22, 25, 80] is (22 + 25) / 2 = 23.5 -> 24%
    expect(result.medianDropOffPercentage).toBe(24);
    expect(result.summaryMessage).toContain('24%');
    expect(result.summaryMessage).toContain('20–30%');
  });

  test('calculateDropOffAnalysis handles 100% completion gracefully', () => {
    const topBooks = [
      {
        title: 'Finished Novel',
        readingTimeSeconds: 10000,
        charactersRead: 50000,
        lookupCount: 10,
        maxProgress: 1.0,
        completed: true,
        rank: 1
      }
    ];
    const result = calculateDropOffAnalysis(topBooks);
    expect(result.abandonedBooksCount).toBe(0);
    expect(result.summaryMessage).toBe('You finished every book you started reading!');
  });

  test('calculateProfileBreakdown accurately splits device reading time', () => {
    const profileSeconds = new Map<string, number>([
      ['default-mobile', 7200], // 2 hours = 60%
      ['default-desktop', 3600], // 1 hour = 30%
      ['default-tablet', 1200] // 20 mins = 10%
    ]);

    const breakdown = calculateProfileBreakdown(profileSeconds, dummyProfiles);
    expect(breakdown).toHaveLength(3);
    expect(breakdown[0].profileName).toBe('Mobile / Phone');
    expect(breakdown[0].percentage).toBe(60);
    expect(breakdown[1].profileName).toBe('PC / Desktop');
    expect(breakdown[1].percentage).toBe(30);
    expect(breakdown[2].profileName).toBe('Tablet / E-Reader');
    expect(breakdown[2].percentage).toBe(10);
  });

  test('evaluates Reading Archetypes based on objective metrics', () => {
    // High lookups -> Vocab Hunter (Yomitan Addict)
    const statsVocab: Partial<BooksDbStatistic>[] = [
      {
        title: 'Dense Classic',
        dateKey: '2026-04-10',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 180, // 18 lookups per 1k chars
        maxProgress: 0.5
      }
    ];

    const metricsVocab = calculateLookbackMetrics(statsVocab as BooksDbStatistic[], 2026);
    expect(metricsVocab.primaryArchetype.id).toBe('vocab-hunter');
    expect(metricsVocab.lookupsPer1kChars).toBe(18);

    // High speed (>20k chars/hr) -> Light Novel Binger
    const statsSpeed: Partial<BooksDbStatistic>[] = [
      {
        title: 'Isekai Vol 1',
        dateKey: '2026-05-15',
        readingTime: 3600, // 1 hr
        charactersRead: 25000, // 25,000 chars/hr
        lookupCount: 2,
        maxProgress: 1.0
      }
    ];

    const metricsSpeed = calculateLookbackMetrics(statsSpeed as BooksDbStatistic[], 2026);
    expect(metricsSpeed.primaryArchetype.id).toBe('ln-binger');

    // Late night reading (23:00 to 03:00) -> Night Owl
    const nightOwlReading = new Array(24).fill(0);
    nightOwlReading[23] = 1800; // 30 min at 11 PM
    nightOwlReading[1] = 1800; // 30 min at 1 AM
    const statsNight: Partial<BooksDbStatistic>[] = [
      {
        title: 'Night Story',
        dateKey: '2026-06-20',
        readingTime: 3600,
        charactersRead: 12000,
        lookupCount: 5,
        readingTimeByHour: nightOwlReading,
        maxProgress: 0.4
      }
    ];

    const metricsNight = calculateLookbackMetrics(statsNight as BooksDbStatistic[], 2026);
    expect(metricsNight.peakTimeCategory).toBe('Night Owl');
    expect(metricsNight.primaryArchetype.id).toBe('night-owl');
  });

  test('computes Year-over-Year comparison deltas', () => {
    const stats: Partial<BooksDbStatistic>[] = [
      // 2025: 10,000 chars in 3,600s (1 hr)
      {
        title: 'Book 2025',
        dateKey: '2025-06-01',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 20,
        maxProgress: 1.0
      },
      // 2026: 20,000 chars in 5,400s (1.5 hr)
      {
        title: 'Book 2026',
        dateKey: '2026-06-01',
        readingTime: 5400,
        charactersRead: 20000,
        lookupCount: 40,
        maxProgress: 1.0
      }
    ];

    const metrics2026 = calculateLookbackMetrics(stats as BooksDbStatistic[], 2026);
    expect(metrics2026.yoyComparison).toBeDefined();
    expect(metrics2026.yoyComparison?.hasPriorYearData).toBe(true);
    expect(metrics2026.yoyComparison?.priorYear).toBe(2025);
    // Reading time: (5400 - 3600) / 3600 * 100 = +50%
    expect(metrics2026.yoyComparison?.readingTimeDeltaPercent).toBe(50);
    // Characters: (20000 - 10000) / 10000 * 100 = +100%
    expect(metrics2026.yoyComparison?.charactersDeltaPercent).toBe(100);
    // Speed: 2025 speed = 10000 chars/hr; 2026 speed = (20000 / 5400) * 3600 = 13333.3 chars/hr -> +33.3%
    expect(metrics2026.yoyComparison?.speedDeltaPercent).toBe(33.3);
  });

  test('handles All Time mode and empty statistics gracefully', () => {
    const emptyMetrics = calculateLookbackMetrics([], 'all');
    expect(emptyMetrics.totalReadingTimeSeconds).toBe(0);
    expect(emptyMetrics.totalCharactersRead).toBe(0);
    expect(emptyMetrics.booksStarted).toBe(0);
    expect(emptyMetrics.booksCompleted).toBe(0);
    expect(emptyMetrics.primaryArchetype.id).toBe('steady-reader');
    expect(emptyMetrics.dropOffAnalysis.abandonedBooksCount).toBe(0);
    expect(emptyMetrics.yoyComparison).toBeUndefined();
  });
});
