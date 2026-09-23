/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';

export interface SpeedTrendTitleContribution {
  title: string;
  charactersRead: number;
  readingTimeSeconds: number;
  /** Time-weighted average speed for this title in the bucket (chars/hr, 0 when no time). */
  avgSpeed: number;
  /** Share of the bucket's characters (0-100, rounded). */
  charsSharePercent: number;
}

export interface SpeedTrendBucket {
  key: string;
  label: string;
  shortLabel: string;
  totalChars: number;
  totalTimeSeconds: number;
  /** Time-weighted average speed for the bucket (chars/hr). 0 when totalTimeSeconds is 0. */
  avgSpeed: number;
  hasData: boolean;
  titles: SpeedTrendTitleContribution[];
}

export type SpeedTrendLevel = 'year' | 'month' | 'week' | 'years';

export interface SpeedTrendResult {
  level: SpeedTrendLevel;
  buckets: SpeedTrendBucket[];
  /** Time-weighted overall average across ALL rows in scope (chars/hr). */
  overallAverage: number;
  overallChars: number;
  overallTimeSeconds: number;
}

export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

export const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Average reading speed in chars/hour. Matches lookback-calculator.ts
 * (Math.round) so trend values agree with the Recap hero "~X chars/hr".
 * Every other tracker path uses Math.ceil (<=1 char/hr difference) — inside
 * Recap, round is the correct choice for consistency.
 */
export function avgSpeedCharsPerHour(characters: number, timeSeconds: number): number {
  if (!timeSeconds || timeSeconds <= 0) return 0;
  return Math.round((characters / timeSeconds) * 3600);
}

function pad2(value: number): string {
  return `${value}`.padStart(2, '0');
}

export function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

export function parseDateKey(
  dateKey: string
): { year: number; monthIndex: number; day: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return undefined;
  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    return undefined;
  }
  return { year, monthIndex, day };
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function dayOfWeek(dateKey: string): number {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return 0;
  return new Date(parsed.year, parsed.monthIndex, parsed.day).getDay();
}

function addDays(dateKey: string, days: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const date = new Date(parsed.year, parsed.monthIndex, parsed.day + days);
  return toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildBucket(
  key: string,
  label: string,
  shortLabel: string,
  rows: BooksDbStatistic[]
): SpeedTrendBucket {
  let totalChars = 0;
  let totalTime = 0;
  const byTitle = new Map<string, { chars: number; time: number }>();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const chars = row.charactersRead || 0;
    const time = row.readingTime || 0;
    totalChars += chars;
    totalTime += time;
    const existing = byTitle.get(row.title) || { chars: 0, time: 0 };
    existing.chars += chars;
    existing.time += time;
    byTitle.set(row.title, existing);
  }

  const hasData = totalTime > 0;
  const titles: SpeedTrendTitleContribution[] = [...byTitle.entries()].map(([title, value]) => ({
    title,
    charactersRead: value.chars,
    readingTimeSeconds: value.time,
    avgSpeed: avgSpeedCharsPerHour(value.chars, value.time),
    charsSharePercent: totalChars > 0 ? Math.round((value.chars / totalChars) * 100) : 0
  }));
  titles.sort((a, b) => b.charactersRead - a.charactersRead || (a.title > b.title ? 1 : -1));

  return {
    key,
    label,
    shortLabel,
    totalChars,
    totalTimeSeconds: totalTime,
    avgSpeed: avgSpeedCharsPerHour(totalChars, totalTime),
    hasData,
    titles
  };
}

function overallOf(rows: BooksDbStatistic[]): {
  overallAverage: number;
  overallChars: number;
  overallTimeSeconds: number;
} {
  let chars = 0;
  let time = 0;
  for (let i = 0; i < rows.length; i += 1) {
    chars += rows[i].charactersRead || 0;
    time += rows[i].readingTime || 0;
  }
  return {
    overallAverage: avgSpeedCharsPerHour(chars, time),
    overallChars: chars,
    overallTimeSeconds: time
  };
}

/** Year level: 12 month buckets for the given year. */
export function bucketizeYear(rows: BooksDbStatistic[], year: number): SpeedTrendResult {
  const buckets: SpeedTrendBucket[] = [];
  for (let month = 0; month < 12; month += 1) {
    const prefix = `${year}-${pad2(month + 1)}`;
    const monthRows = rows.filter((row) => row.dateKey.startsWith(prefix));
    buckets.push(
      buildBucket(
        `${year}-${pad2(month + 1)}`,
        `${MONTH_LONG[month]} ${year}`,
        MONTH_SHORT[month],
        monthRows
      )
    );
  }
  return { level: 'year', buckets, ...overallOf(rows) };
}

export interface MonthWeekRange {
  startKey: string;
  endKey: string;
  label: string;
  shortLabel: string;
}

/**
 * Split a calendar month into week chunks clipped to the month.
 * Chunks break on weekStart (0=Sunday..6=Saturday, honors Start of Week setting).
 * Edge chunks are partial (e.g. "Mar 1–2", "Mar 30–31") so days are never
 * double-counted with adjacent months.
 */
export function getWeekRangesForMonth(
  year: number,
  monthIndex: number,
  weekStart: number
): MonthWeekRange[] {
  const total = daysInMonth(year, monthIndex);
  const ranges: MonthWeekRange[] = [];
  let chunkStart = 1;

  for (let day = 2; day <= total + 1; day += 1) {
    const isEnd = day > total;
    const dow = isEnd ? -1 : new Date(year, monthIndex, day).getDay();
    if (isEnd || dow === weekStart) {
      const startKey = toDateKey(year, monthIndex, chunkStart);
      const endKey = toDateKey(year, monthIndex, day - 1);
      const monthName = MONTH_SHORT[monthIndex];
      const label =
        chunkStart === day - 1
          ? `${monthName} ${chunkStart}`
          : `${monthName} ${chunkStart}–${day - 1}`;
      ranges.push({ startKey, endKey, label, shortLabel: label });
      chunkStart = day;
    }
  }

  return ranges;
}

/** Month level: week buckets clipped to the month. */
export function bucketizeMonth(
  rows: BooksDbStatistic[],
  year: number,
  monthIndex: number,
  weekStart: number
): SpeedTrendResult {
  const ranges = getWeekRangesForMonth(year, monthIndex, weekStart);
  const buckets = ranges.map((range) =>
    buildBucket(
      range.startKey,
      `${range.label}`,
      range.shortLabel,
      rows.filter((row) => row.dateKey >= range.startKey && row.dateKey <= range.endKey)
    )
  );
  return { level: 'month', buckets, ...overallOf(rows) };
}

/** Day keys for 7 consecutive days starting at weekStartKey (inclusive). */
export function getDayKeysForWeek(weekStartKey: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    keys.push(addDays(weekStartKey, i));
  }
  return keys;
}

function formatDayLabel(dateKey: string): { label: string; shortLabel: string } {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return { label: dateKey, shortLabel: dateKey };
  const weekday = WEEKDAY_SHORT[new Date(parsed.year, parsed.monthIndex, parsed.day).getDay()];
  return {
    label: `${weekday} ${MONTH_SHORT[parsed.monthIndex]} ${parsed.day}`,
    shortLabel: `${parsed.monthIndex + 1}/${parsed.day}`
  };
}

/** Week level: 7 day buckets starting at weekStartKey. */
export function bucketizeWeek(rows: BooksDbStatistic[], weekStartKey: string): SpeedTrendResult {
  const keys = getDayKeysForWeek(weekStartKey);
  const buckets = keys.map((key) => {
    const { label, shortLabel } = formatDayLabel(key);
    return buildBucket(
      key,
      label,
      shortLabel,
      rows.filter((row) => row.dateKey === key)
    );
  });
  return { level: 'week', buckets, ...overallOf(rows) };
}

/** All-time level: one bucket per year present in rows (ascending). */
export function bucketizeAllYears(rows: BooksDbStatistic[]): SpeedTrendResult {
  const years = new Set<number>();
  for (let i = 0; i < rows.length; i += 1) {
    const parsed = parseDateKey(rows[i].dateKey);
    if (parsed) years.add(parsed.year);
  }
  const sorted = [...years].sort((a, b) => a - b);
  const buckets = sorted.map((year) =>
    buildBucket(
      `${year}`,
      `${year}`,
      `${year}`,
      rows.filter((row) => row.dateKey.startsWith(`${year}-`))
    )
  );
  return { level: 'years', buckets, ...overallOf(rows) };
}
