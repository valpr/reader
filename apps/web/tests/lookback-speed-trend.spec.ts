/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';
import {
  avgSpeedCharsPerHour,
  bucketizeAllYears,
  bucketizeMonth,
  bucketizeWeek,
  bucketizeYear,
  getDayKeysForWeek,
  getWeekRangesForMonth
} from '$lib/components/statistics/statistics-lookback/lookback-speed-trend';
import { calculateLookbackMetrics } from '$lib/components/statistics/statistics-lookback/lookback-calculator';

function row(
  title: string,
  dateKey: string,
  readingTime: number,
  charactersRead: number
): BooksDbStatistic {
  return {
    title,
    dateKey,
    readingTime,
    charactersRead,
    minReadingSpeed: 0,
    altMinReadingSpeed: 0,
    lastReadingSpeed: 0,
    maxReadingSpeed: 0,
    lastStatisticModified: 1
  } as BooksDbStatistic;
}

test.describe('Speed trend calculator', () => {
  test('avgSpeed uses round-parity with the Recap hero metric', () => {
    // 10000 chars / 3600s = 10000 exactly; non-integer case rounds (not ceils):
    // 10001/3600*3600 = 10001; use a case where round != ceil: 10000 chars / 7000s = 5142.857 -> 5143 both;
    // 1000 chars / 7000s = 514.285 -> round 514, ceil 515
    expect(avgSpeedCharsPerHour(1000, 7000)).toBe(514);

    const rows = [row('A', '2026-03-01', 3600, 10000), row('B', '2026-03-02', 3400, 9500)];
    const trend = bucketizeYear(rows, 2026);
    const hero = calculateLookbackMetrics(rows, 2026);
    expect(trend.overallAverage).toBe(hero.averageReadingSpeedCharsPerHour);
  });

  test('bucket speed is time-weighted, not the mean of daily speeds', () => {
    // Day 1: fast but tiny (36000/hr for 60s = 600 chars). Day 2: slow but huge (10000/hr for 3600s).
    // Mean of speeds would be 23000; weighted truth = round(3600*10600/3660) = 10426.
    const rows = [row('A', '2026-03-01', 60, 600), row('A', '2026-03-02', 3600, 10000)];
    const trend = bucketizeYear(rows, 2026);
    const march = trend.buckets[2];
    expect(march.avgSpeed).toBe(Math.round((10600 / 3660) * 3600));
    expect(march.avgSpeed).not.toBe(23000);
  });

  test('year level produces 12 month buckets with title breakdowns', () => {
    const rows = [
      row('Fast Book', '2026-01-05', 3600, 20000),
      row('Slow Book', '2026-01-06', 3600, 10000),
      row('Other', '2026-03-10', 1800, 9000)
    ];
    const trend = bucketizeYear(rows, 2026);
    expect(trend.level).toBe('year');
    expect(trend.buckets).toHaveLength(12);
    const jan = trend.buckets[0];
    expect(jan.hasData).toBe(true);
    expect(jan.avgSpeed).toBe(Math.round((30000 / 7200) * 3600));
    expect(jan.titles[0].title).toBe('Fast Book');
    expect(jan.titles[0].charsSharePercent).toBe(67);
    expect(jan.titles[1].charsSharePercent).toBe(33);
    expect(trend.buckets[1].hasData).toBe(false);
    expect(trend.buckets[1].avgSpeed).toBe(0);
  });

  test('month level clips edge weeks to the month (Monday start)', () => {
    // March 2026: Mar 1 is a Sunday. Monday-start chunks: [1], [2-8], [9-15], [16-22], [23-29], [30-31].
    const ranges = getWeekRangesForMonth(2026, 2, 1);
    expect(ranges[0]).toMatchObject({ startKey: '2026-03-01', endKey: '2026-03-01' });
    expect(ranges[ranges.length - 1]).toMatchObject({
      startKey: '2026-03-30',
      endKey: '2026-03-31'
    });
    // Every March day covered exactly once, nothing from April.
    const covered = ranges.flatMap((r) => {
      const keys: string[] = [];
      let key = r.startKey;
      while (key <= r.endKey) {
        keys.push(key);
        const [y, m, d] = key.split('-').map(Number);
        const next = new Date(y, m - 1, d + 1);
        key = `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, '0')}-${`${next.getDate()}`.padStart(2, '0')}`;
      }
      return keys;
    });
    expect(covered).toHaveLength(31);
    expect(new Set(covered).size).toBe(31);

    const rows = [row('A', '2026-03-01', 3600, 12000), row('B', '2026-03-31', 3600, 24000)];
    const trend = bucketizeMonth(rows, 2026, 2, 1);
    expect(trend.level).toBe('month');
    expect(trend.buckets).toHaveLength(6);
    expect(trend.buckets[0].avgSpeed).toBe(12000);
    expect(trend.buckets[5].avgSpeed).toBe(24000);
  });

  test('month level differs between Sunday and Monday start', () => {
    const sunday = getWeekRangesForMonth(2026, 2, 0);
    const monday = getWeekRangesForMonth(2026, 2, 1);
    // Sunday start: Mar 1 (Sunday) begins a chunk [1-7].
    expect(sunday[0]).toMatchObject({ startKey: '2026-03-01', endKey: '2026-03-07' });
    expect(monday[0]).toMatchObject({ startKey: '2026-03-01', endKey: '2026-03-01' });
  });

  test('week level produces 7 consecutive day buckets', () => {
    expect(getDayKeysForWeek('2026-03-02')).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08'
    ]);
    const rows = [row('A', '2026-03-04', 1800, 9000)];
    const trend = bucketizeWeek(rows, '2026-03-02');
    expect(trend.buckets).toHaveLength(7);
    expect(trend.buckets[2].hasData).toBe(true);
    expect(trend.buckets[2].avgSpeed).toBe(18000);
    expect(trend.buckets[0].hasData).toBe(false);
  });

  test('zero-time rows never produce a speed point', () => {
    const rows = [row('A', '2026-03-04', 0, 5000)];
    const trend = bucketizeWeek(rows, '2026-03-02');
    expect(trend.buckets[2].hasData).toBe(false);
    expect(trend.buckets[2].avgSpeed).toBe(0);
  });

  test('all-time level buckets per year ascending', () => {
    const rows = [row('A', '2025-06-01', 3600, 10000), row('B', '2026-06-01', 3600, 20000)];
    const trend = bucketizeAllYears(rows);
    expect(trend.buckets.map((b) => b.key)).toEqual(['2025', '2026']);
    expect(trend.overallAverage).toBe(Math.round((30000 / 7200) * 3600));
  });
});
