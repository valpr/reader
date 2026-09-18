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
  computeTotalDaysInPeriod,
  DROP_OFF_INACTIVITY_THRESHOLD_MS,
  DROP_OFF_MIN_READING_TIME_SECONDS,
  extractAvailableYears,
  extractEarliestDate
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
      name: 'Tablet',
      icon: 'tablet',
      updatedAt: 1,
      settings: {} as any
    },
    {
      id: 'default-ereader',
      name: 'E-Reader / E-Ink',
      icon: 'ereader',
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
    expect(result.hasDropOffData).toBe(true);
    expect(result.abandonedBooksCount).toBe(4);
    // Modal bucket should be 20-30% (contains Book B at 22% and Book C at 25%)
    expect(result.modalDropOffBracket).toBe('20–30%');
    // Median of [15, 22, 25, 80] is (22 + 25) / 2 = 23.5 -> 24%
    expect(result.medianDropOffPercentage).toBe(24);
    expect(result.summaryMessage).toContain('24%');
    expect(result.summaryMessage).toContain('20–30%');
  });

  test('calculateDropOffAnalysis hides cliff when 2 or fewer books unfinished', () => {
    const topBooks = [
      {
        title: 'Book A',
        readingTimeSeconds: 2000,
        charactersRead: 10000,
        lookupCount: 5,
        maxProgress: 0.15,
        completed: false,
        rank: 1
      },
      {
        title: 'Book B',
        readingTimeSeconds: 3000,
        charactersRead: 15000,
        lookupCount: 8,
        maxProgress: 0.22,
        completed: false,
        rank: 2
      }
    ];
    const result = calculateDropOffAnalysis(topBooks);
    expect(result.hasDropOffData).toBe(false);
    expect(result.abandonedBooksCount).toBe(2);
    expect(result.summaryMessage).toContain('more than 2 books are left unfinished');
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
    expect(result.hasDropOffData).toBe(false);
    expect(result.abandonedBooksCount).toBe(0);
    expect(result.summaryMessage).toContain('100% Completion');
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
    expect(breakdown[2].profileName).toBe('Tablet');
    expect(breakdown[2].percentage).toBe(10);
  });

  test('calculateProfileBreakdown supports user-added custom profiles and handles deleted profiles', () => {
    const customProfiles: ReaderProfile[] = [
      ...dummyProfiles,
      {
        id: 'profile-boox-palma',
        name: '  Boox Palma  ',
        icon: 'tablet',
        updatedAt: 1,
        settings: {} as any
      },
      {
        id: 'profile-night-phone',
        name: 'Bedtime Reading',
        icon: 'mobile',
        updatedAt: 1,
        settings: {} as any
      }
    ];

    const profileSeconds = new Map<string, number>([
      ['profile-boox-palma', 5000], // Custom added profile
      ['profile-night-phone', 3000], // Custom added profile
      ['profile-deleted-device', 2000] // Deleted profile whose ID was in historical data
    ]);

    const breakdown = calculateProfileBreakdown(profileSeconds, customProfiles);
    expect(breakdown).toHaveLength(3);
    // #1 Boox Palma (trimmed name, custom icon)
    expect(breakdown[0].profileName).toBe('Boox Palma');
    expect(breakdown[0].profileIcon).toBe('tablet');
    expect(breakdown[0].percentage).toBe(50);

    // #2 Bedtime Reading
    expect(breakdown[1].profileName).toBe('Bedtime Reading');
    expect(breakdown[1].profileIcon).toBe('mobile');
    expect(breakdown[1].percentage).toBe(30);

    // #3 Archived Profile (deleted custom profile)
    expect(breakdown[2].profileName).toBe('Archived Profile');
    expect(breakdown[2].profileIcon).toBe('custom');
    expect(breakdown[2].percentage).toBe(20);
  });

  test('assigns Emerging Reader when under sample gate (<3 completed books or <=2 days)', () => {
    // Only 1 book and 1 day
    const statsFew: Partial<BooksDbStatistic>[] = [
      {
        title: 'Book A',
        dateKey: '2026-04-10',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 180,
        completedBook: 1,
        maxProgress: 1.0
      }
    ];
    const metrics = calculateLookbackMetrics(statsFew as BooksDbStatistic[], 2026);
    expect(metrics.hasSufficientData).toBe(false);
    expect(metrics.primaryArchetype.id).toBe('emerging-reader');

    // 3 books started across 3 days, but only 2 completed
    const statsThreeStartedTwoCompleted: Partial<BooksDbStatistic>[] = [
      {
        title: 'Book A',
        dateKey: '2026-04-10',
        readingTime: 3600,
        charactersRead: 10000,
        completedBook: 1,
        maxProgress: 1.0
      },
      {
        title: 'Book B',
        dateKey: '2026-04-11',
        readingTime: 3600,
        charactersRead: 10000,
        completedBook: 1,
        maxProgress: 1.0
      },
      {
        title: 'Book C',
        dateKey: '2026-04-12',
        readingTime: 3600,
        charactersRead: 10000,
        maxProgress: 0.5 // unfinished
      }
    ];
    const metricsTwoCompleted = calculateLookbackMetrics(
      statsThreeStartedTwoCompleted as BooksDbStatistic[],
      2026
    );
    expect(metricsTwoCompleted.hasSufficientData).toBe(false);
    expect(metricsTwoCompleted.booksCompleted).toBe(2);
    expect(metricsTwoCompleted.primaryArchetype.id).toBe('emerging-reader');
  });

  test('evaluates Reading Archetypes based on objective metrics when requirements met', () => {
    // 3 completed books across 3 days with high lookups -> Vocab Hunter (Yomitan Addict)
    const statsVocab: Partial<BooksDbStatistic>[] = [
      {
        title: 'Dense Classic',
        dateKey: '2026-04-10',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 180,
        completedBook: 1,
        maxProgress: 1.0
      },
      {
        title: 'Essay Collection',
        dateKey: '2026-04-11',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 150,
        completedBook: 1,
        maxProgress: 1.0
      },
      {
        title: 'Poetry Anthology',
        dateKey: '2026-04-12',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 120,
        completedBook: 1,
        maxProgress: 1.0
      }
    ];

    const metricsVocab = calculateLookbackMetrics(statsVocab as BooksDbStatistic[], 2026);
    expect(metricsVocab.hasSufficientData).toBe(true);
    expect(metricsVocab.primaryArchetype.id).toBe('vocab-hunter');
    expect(metricsVocab.lookupsPer1kChars).toBe(15);

    // High speed (>20k chars/hr) across 3 books / 3 days -> Light Novel Binger
    const statsSpeed: Partial<BooksDbStatistic>[] = [
      {
        title: 'Isekai Vol 1',
        dateKey: '2026-05-15',
        readingTime: 3600,
        charactersRead: 25000,
        lookupCount: 2,
        maxProgress: 1.0
      },
      {
        title: 'Isekai Vol 2',
        dateKey: '2026-05-16',
        readingTime: 3600,
        charactersRead: 25000,
        lookupCount: 2,
        maxProgress: 1.0
      },
      {
        title: 'Isekai Vol 3',
        dateKey: '2026-05-17',
        readingTime: 3600,
        charactersRead: 25000,
        lookupCount: 2,
        maxProgress: 1.0
      }
    ];

    const metricsSpeed = calculateLookbackMetrics(statsSpeed as BooksDbStatistic[], 2026);
    expect(metricsSpeed.hasSufficientData).toBe(true);
    expect(metricsSpeed.primaryArchetype.id).toBe('ln-binger');

    // Late night reading (23:00 to 03:00) across 3 completed books / 3 days -> Night Owl
    const nightOwlReading = new Array(24).fill(0);
    nightOwlReading[23] = 1800; // 30 min at 11 PM
    nightOwlReading[1] = 1800; // 30 min at 1 AM
    const statsNight: Partial<BooksDbStatistic>[] = [
      {
        title: 'Night Story 1',
        dateKey: '2026-06-20',
        readingTime: 3600,
        charactersRead: 12000,
        lookupCount: 5,
        readingTimeByHour: nightOwlReading,
        completedBook: 1,
        maxProgress: 1.0
      },
      {
        title: 'Night Story 2',
        dateKey: '2026-06-21',
        readingTime: 3600,
        charactersRead: 12000,
        lookupCount: 5,
        readingTimeByHour: nightOwlReading,
        completedBook: 1,
        maxProgress: 1.0
      },
      {
        title: 'Night Story 3',
        dateKey: '2026-06-22',
        readingTime: 3600,
        charactersRead: 12000,
        lookupCount: 5,
        readingTimeByHour: nightOwlReading,
        completedBook: 1,
        maxProgress: 1.0
      }
    ];

    const metricsNight = calculateLookbackMetrics(statsNight as BooksDbStatistic[], 2026);
    expect(metricsNight.hasSufficientData).toBe(true);
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
    expect(emptyMetrics.hasSufficientData).toBe(false);
    expect(emptyMetrics.totalReadingTimeSeconds).toBe(0);
    expect(emptyMetrics.totalCharactersRead).toBe(0);
    expect(emptyMetrics.booksStarted).toBe(0);
    expect(emptyMetrics.booksCompleted).toBe(0);
    expect(emptyMetrics.primaryArchetype.id).toBe('emerging-reader');
    expect(emptyMetrics.dropOffAnalysis.abandonedBooksCount).toBe(0);
    expect(emptyMetrics.dropOffAnalysis.hasDropOffData).toBe(false);
    expect(emptyMetrics.yoyComparison).toBeUndefined();
  });

  test('calculateDropOffAnalysis does not falsely claim 100% completion when 0 books completed and 0% progress', () => {
    // 3 books started, none completed, all with 0% progress (e.g. metadata or progress not recorded)
    const unfinishedZeroProgress = [
      {
        title: 'Book 1',
        readingTimeSeconds: 2000,
        charactersRead: 3000,
        lookupCount: 0,
        maxProgress: 0,
        completed: false,
        rank: 1
      },
      {
        title: 'Book 2',
        readingTimeSeconds: 2400,
        charactersRead: 4000,
        lookupCount: 1,
        maxProgress: 0,
        completed: false,
        rank: 2
      },
      {
        title: 'Book 3',
        readingTimeSeconds: 2200,
        charactersRead: 2000,
        lookupCount: 0,
        maxProgress: 0,
        completed: false,
        rank: 3
      }
    ];

    const result = calculateDropOffAnalysis(unfinishedZeroProgress);
    expect(result.hasDropOffData).toBe(true);
    expect(result.abandonedBooksCount).toBe(3);
    expect(result.modalDropOffBracket).toBe('0–10%');
    expect(result.medianDropOffPercentage).toBe(0);
    expect(result.summaryMessage).not.toContain('100% Completion');
    expect(result.summaryMessage).toContain('0%');

    // 1 book started, none completed, 0% progress -> insufficient sample gate, but NOT 100% completion
    const singleZeroProgress = [
      {
        title: 'Book 1',
        readingTimeSeconds: 2000,
        charactersRead: 3000,
        lookupCount: 0,
        maxProgress: 0,
        completed: false,
        rank: 1
      }
    ];
    const singleResult = calculateDropOffAnalysis(singleZeroProgress);
    expect(singleResult.hasDropOffData).toBe(false);
    expect(singleResult.abandonedBooksCount).toBe(1);
    expect(singleResult.summaryMessage).not.toContain('100% Completion');
    expect(singleResult.summaryMessage).toContain('more than 2 books are left unfinished');
  });

  test('extractEarliestDate finds the earliest date across all statistics', () => {
    const stats: Partial<BooksDbStatistic>[] = [
      { dateKey: '2026-05-10', readingTime: 100 },
      { dateKey: '2025-11-20', readingTime: 200 },
      { dateKey: '2025-07-15', readingTime: 300 },
      { dateKey: '2026-01-01', readingTime: 0, charactersRead: 0 } // inactive day
    ];
    expect(extractEarliestDate(stats as BooksDbStatistic[])).toBe('2025-07-15');
  });

  test('computeTotalDaysInPeriod measures consistency from mid-year start date', () => {
    // If user's first read was 2025-07-01, baseline for 2025 is 184 days (July 1 to Dec 31)
    const activeDates = new Set(['2025-07-01', '2025-08-01']);
    const daysMidYear = computeTotalDaysInPeriod(2025, activeDates, '2025-07-01');
    expect(daysMidYear).toBe(184);

    // If user started in previous year (e.g. 2024), full 2025 is measured (365 days)
    const daysFullYear = computeTotalDaysInPeriod(2025, activeDates, '2024-05-10');
    expect(daysFullYear).toBe(365);
  });

  test('does not inflate longestSessionSeconds with daily total reading time when telemetry exists', () => {
    // If all stats have longestSessionSeconds, daily readingTime is NEVER used
    const statsWithTelemetry: Partial<BooksDbStatistic>[] = [
      {
        title: 'Book A',
        dateKey: '2026-04-10',
        readingTime: 10000, // 2.7 hours total
        longestSessionSeconds: 1500, // 25 min
        charactersRead: 10000,
        maxProgress: 0.5
      },
      {
        title: 'Book B',
        dateKey: '2026-04-11',
        readingTime: 8000,
        longestSessionSeconds: 2000, // 33 min
        charactersRead: 10000,
        maxProgress: 0.5
      },
      {
        title: 'Book C',
        dateKey: '2026-04-12',
        readingTime: 6000,
        longestSessionSeconds: 1800, // 30 min
        charactersRead: 10000,
        maxProgress: 0.5
      }
    ];
    const metricsTelemetry = calculateLookbackMetrics(
      statsWithTelemetry as BooksDbStatistic[],
      2026
    );
    expect(metricsTelemetry.longestSessionSeconds).toBe(2000);

    // If legacy stat lacks longestSessionSeconds, it falls back to readingTime
    const statsLegacy: Partial<BooksDbStatistic>[] = [
      {
        title: 'Book A',
        dateKey: '2026-04-10',
        readingTime: 4200,
        // No longestSessionSeconds recorded
        charactersRead: 10000,
        maxProgress: 0.5
      }
    ];
    const metricsLegacy = calculateLookbackMetrics(statsLegacy as BooksDbStatistic[], 2026);
    expect(metricsLegacy.longestSessionSeconds).toBe(4200);
  });

  test('integrates bookMetadataMap progress fallback and completedTitles in lookback calculation', () => {
    const stats: Partial<BooksDbStatistic>[] = [
      {
        title: 'Book Without MaxProgress',
        dateKey: '2026-04-10',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 2
        // maxProgress omitted/undefined
      },
      {
        title: 'Completed Novel',
        dateKey: '2026-04-11',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 2,
        maxProgress: 0.8
        // completedBook not set in stat
      },
      {
        title: 'Book Three',
        dateKey: '2026-04-12',
        readingTime: 3600,
        charactersRead: 10000,
        lookupCount: 2,
        maxProgress: 0.4
      }
    ];

    const bookMetadataMap = new Map([
      ['Book Without MaxProgress', { progress: 0.65 }],
      ['Completed Novel', { progress: 0.98 }]
    ]);
    const completedTitles = new Set(['Completed Novel']);

    const metrics = calculateLookbackMetrics(stats as BooksDbStatistic[], 2026, {
      bookMetadataMap,
      completedTitles
    });

    const bookNoProgress = metrics.topBooks.find((b) => b.title === 'Book Without MaxProgress');
    expect(bookNoProgress?.maxProgress).toBe(0.65);

    const completedBook = metrics.topBooks.find((b) => b.title === 'Completed Novel');
    expect(completedBook?.completed).toBe(true);
    expect(completedBook?.maxProgress).toBe(0.98);
    expect(metrics.booksCompleted).toBe(1);
  });

  test('calculateDropOffAnalysis only counts books inactive for over 2 weeks as dropped', () => {
    const referenceDate = new Date('2026-09-17T12:00:00Z');
    expect(DROP_OFF_INACTIVITY_THRESHOLD_MS).toBe(14 * 24 * 60 * 60 * 1000);
    const dayMs = 24 * 60 * 60 * 1000;

    const books = [
      // Actively read 2 days ago (< 14 days) -> NOT abandoned
      {
        title: 'Active Book 1',
        readingTimeSeconds: 5000,
        charactersRead: 20000,
        lookupCount: 15,
        maxProgress: 0.35,
        completed: false,
        rank: 1,
        lastReadTime: referenceDate.getTime() - 2 * dayMs
      },
      // Actively read 13 days ago (< 14 days) -> NOT abandoned
      {
        title: 'Active Book 2',
        readingTimeSeconds: 4000,
        charactersRead: 18000,
        lookupCount: 10,
        maxProgress: 0.5,
        completed: false,
        rank: 2,
        lastReadTime: referenceDate.getTime() - 13 * dayMs
      },
      // Abandoned 16 days ago (> 14 days) -> Abandoned at 25%
      {
        title: 'Abandoned Book A',
        readingTimeSeconds: 3000,
        charactersRead: 12000,
        lookupCount: 5,
        maxProgress: 0.25,
        completed: false,
        rank: 3,
        lastReadTime: referenceDate.getTime() - 16 * dayMs
      },
      // Abandoned 30 days ago (> 14 days) -> Abandoned at 28%
      {
        title: 'Abandoned Book B',
        readingTimeSeconds: 3500,
        charactersRead: 14000,
        lookupCount: 8,
        maxProgress: 0.28,
        completed: false,
        rank: 4,
        lastReadTime: referenceDate.getTime() - 30 * dayMs
      },
      // Abandoned 60 days ago (> 14 days) -> Abandoned at 22%
      {
        title: 'Abandoned Book C',
        readingTimeSeconds: 2000,
        charactersRead: 8000,
        lookupCount: 3,
        maxProgress: 0.22,
        completed: false,
        rank: 5,
        lastReadTime: referenceDate.getTime() - 60 * dayMs
      }
    ];

    const result = calculateDropOffAnalysis(books, { referenceDate });
    // Out of 5 unfinished books, only the 3 books inactive for > 14 days are counted
    expect(result.abandonedBooksCount).toBe(3);
    expect(result.hasDropOffData).toBe(true);
    // Modal bracket for 25%, 28%, 22% is 20-30%
    expect(result.modalDropOffBracket).toBe('20–30%');
    // Median of [22, 25, 28] is 25%
    expect(result.medianDropOffPercentage).toBe(25);
    expect(result.summaryMessage).toContain('around 25%');
  });

  test('calculateDropOffAnalysis reports no reading drop-offs when all unfinished books are actively read', () => {
    const referenceDate = new Date('2026-09-17T12:00:00Z');
    const dayMs = 24 * 60 * 60 * 1000;

    const books = [
      {
        title: 'Active Book 1',
        readingTimeSeconds: 5000,
        charactersRead: 20000,
        lookupCount: 15,
        maxProgress: 0.35,
        completed: false,
        rank: 1,
        lastReadTime: referenceDate.getTime() - 1 * dayMs
      },
      {
        title: 'Active Book 2',
        readingTimeSeconds: 4000,
        charactersRead: 18000,
        lookupCount: 10,
        maxProgress: 0.5,
        completed: false,
        rank: 2,
        lastReadTime: referenceDate.getTime() - 5 * dayMs
      },
      {
        title: 'Active Book 3',
        readingTimeSeconds: 3000,
        charactersRead: 12000,
        lookupCount: 5,
        maxProgress: 0.7,
        completed: false,
        rank: 3,
        lastReadTime: referenceDate.getTime() - 10 * dayMs
      }
    ];

    const result = calculateDropOffAnalysis(books, { referenceDate });
    expect(result.abandonedBooksCount).toBe(0);
    expect(result.hasDropOffData).toBe(false);
    expect(result.summaryMessage).toBe('No reading drop-offs recorded.');
  });

  test('calculateLookbackMetrics derives lastReadTime from dateKey and ignores recent reads for drop-off cliff', () => {
    const referenceDate = new Date('2026-09-17T12:00:00Z');

    const stats: Partial<BooksDbStatistic>[] = [
      // Completed book
      {
        title: 'Finished Novel',
        dateKey: '2026-08-01',
        readingTime: 10000,
        charactersRead: 50000,
        lookupCount: 10,
        completedBook: 1,
        maxProgress: 1.0
      },
      // Actively read 3 days ago: 2026-09-14
      {
        title: 'Active Read',
        dateKey: '2026-09-14',
        readingTime: 3000,
        charactersRead: 15000,
        lookupCount: 5,
        maxProgress: 0.4
      },
      // Abandoned in June: 2026-06-01 (> 2 weeks ago)
      {
        title: 'Abandoned A',
        dateKey: '2026-06-01',
        readingTime: 2000,
        charactersRead: 8000,
        lookupCount: 4,
        maxProgress: 0.2
      },
      // Abandoned in July: 2026-07-01 (> 2 weeks ago)
      {
        title: 'Abandoned B',
        dateKey: '2026-07-01',
        readingTime: 2500,
        charactersRead: 10000,
        lookupCount: 3,
        maxProgress: 0.25
      }
    ];

    const metrics = calculateLookbackMetrics(stats as BooksDbStatistic[], 2026, {
      referenceDate
    });

    // 4 books started, 1 completed, 3 unfinished
    expect(metrics.booksStarted).toBe(4);
    expect(metrics.booksCompleted).toBe(1);

    // Only 2 unfinished books are abandoned (> 2 weeks). 'Active Read' was read 3 days ago.
    expect(metrics.dropOffAnalysis.abandonedBooksCount).toBe(2);
    // Since only 2 books are abandoned (need > 2 for cliff), cliff is not shown
    expect(metrics.dropOffAnalysis.hasDropOffData).toBe(false);
    expect(metrics.dropOffAnalysis.summaryMessage).toContain('currently 2 / 3');
  });

  test('calculateDropOffAnalysis excludes books read for 30 minutes or less from drop-off count', () => {
    const referenceDate = new Date('2026-09-17T12:00:00Z');
    const dayMs = 24 * 60 * 60 * 1000;
    expect(DROP_OFF_MIN_READING_TIME_SECONDS).toBe(1800);

    const books = [
      // Only read for 5 minutes (300s) -> preview/sampling, NOT counted as dropped
      {
        title: 'Previewed Book',
        readingTimeSeconds: 300,
        charactersRead: 1000,
        lookupCount: 0,
        maxProgress: 0.05,
        completed: false,
        rank: 1,
        lastReadTime: referenceDate.getTime() - 30 * dayMs
      },
      // Read for 20 minutes (1200s < 1800s) -> under 30 mins, NOT counted as dropped
      {
        title: 'Briefly Read Book',
        readingTimeSeconds: 1200,
        charactersRead: 5000,
        lookupCount: 2,
        maxProgress: 0.12,
        completed: false,
        rank: 2,
        lastReadTime: referenceDate.getTime() - 40 * dayMs
      },
      // Read for 35 minutes (2100s > 1800s) and inactive for 30 days -> COUNTED
      {
        title: 'Abandoned Long Book 1',
        readingTimeSeconds: 2100,
        charactersRead: 10000,
        lookupCount: 5,
        maxProgress: 0.22,
        completed: false,
        rank: 3,
        lastReadTime: referenceDate.getTime() - 30 * dayMs
      },
      // Read for 50 minutes (3000s > 1800s) and inactive for 45 days -> COUNTED
      {
        title: 'Abandoned Long Book 2',
        readingTimeSeconds: 3000,
        charactersRead: 14000,
        lookupCount: 8,
        maxProgress: 0.25,
        completed: false,
        rank: 4,
        lastReadTime: referenceDate.getTime() - 45 * dayMs
      },
      // Read for 40 minutes (2400s > 1800s) and inactive for 60 days -> COUNTED
      {
        title: 'Abandoned Long Book 3',
        readingTimeSeconds: 2400,
        charactersRead: 11000,
        lookupCount: 4,
        maxProgress: 0.28,
        completed: false,
        rank: 5,
        lastReadTime: referenceDate.getTime() - 60 * dayMs
      }
    ];

    const result = calculateDropOffAnalysis(books, { referenceDate });
    // Previewed Book and Briefly Read Book are excluded; only the 3 books with >= 30m reading time are counted
    expect(result.abandonedBooksCount).toBe(3);
    expect(result.hasDropOffData).toBe(true);
    expect(result.modalDropOffBracket).toBe('20–30%');
    expect(result.medianDropOffPercentage).toBe(25);
  });
});
