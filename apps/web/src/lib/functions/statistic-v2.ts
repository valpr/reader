/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type {
  BooksDbStatistic,
  BooksDbStatisticContribution
} from '$lib/data/database/books-db/versions/books-db';
import { mergeStatistics } from '$lib/functions/statistic-util';

/**
 * Statistics v2 (sync-redesign P3/P4): per-device contribution model.
 *
 * - `statisticContribution` (IndexedDB): this device's own raw cumulative
 *   reading, keyed `(title, dateKey)`. Only the local tracker writes it.
 * - `statistic` (IndexedDB): folded/display row, recomputed from local +
 *   downloaded contributions. Sync pulls never touch the contribution store.
 * - Cloud: one stable file per device per year,
 *   `statistics_v2_{deviceId}_{year}.json`, overwritten in place. File count
 *   stays bounded at devices x years independent of sync frequency.
 */

export const STATISTICS_V2_FORMAT = 'statistics-v2';
export const STATISTICS_V2_VERSION = 1;
export const LEGACY_MIGRATION_STATE_ID = 'legacy-migration-v1';
export const MIGRATION_MARKER_FORMAT = 'statistics-v2-migration';
export const MIGRATION_MARKER_VERSION = 1;
/** DeviceId stamped on unattributed legacy history seeded at migration. */
export const LEGACY_BASELINE_DEVICE_PREFIX = 'legacy:';

export interface StatisticContributionFile {
  format: typeof STATISTICS_V2_FORMAT;
  version: number;
  deviceId: string;
  year: number;
  revision: number;
  rows: BooksDbStatisticContribution[];
}

/**
 * One-time legacy migration claim (P4). Files are per-device
 * (`statistics_v2_migration_{deviceId}.json`) so two concurrent first-syncs
 * can never collide on a name — even on providers that permit duplicate
 * filenames — and the deterministic tie-break (lowest deviceId wins) works
 * identically everywhere. The loser adopts the winner's baseline.
 */
export interface StatisticMigrationMarker {
  format: typeof MIGRATION_MARKER_FORMAT;
  version: number;
  deviceId: string;
  completedAt: number;
  baselineRows: BooksDbStatistic[];
}

export function getMigrationMarkerFileName(deviceId: string): string {
  return `statistics_v2_migration_${deviceId}.json`;
}

export function parseMigrationMarkerFileName(filename: string): string | undefined {
  const match = /^statistics_v2_migration_(.+)\.json$/.exec(filename);
  return match?.[1];
}

export function isMigrationMarkerFileName(filename: string): boolean {
  return parseMigrationMarkerFileName(filename) !== undefined;
}

export function isStatisticMigrationMarker(value: unknown): value is StatisticMigrationMarker {
  if (!value || typeof value !== 'object') return false;
  const marker = value as Partial<StatisticMigrationMarker>;
  return (
    marker.format === MIGRATION_MARKER_FORMAT &&
    typeof marker.deviceId === 'string' &&
    marker.deviceId.length > 0 &&
    typeof marker.completedAt === 'number' &&
    Array.isArray(marker.baselineRows) &&
    marker.baselineRows.every(
      (row) => !!row && typeof row.title === 'string' && typeof row.dateKey === 'string'
    )
  );
}

/** Deterministic P4 tie-break: lowest deviceId wins, independent of provider. */
export function pickMigrationWinner(markers: StatisticMigrationMarker[]): StatisticMigrationMarker {
  return [...markers].sort((a, b) => (a.deviceId < b.deviceId ? -1 : 1))[0];
}

export function getYearFromDateKey(dateKey: string): number {
  const year = Number.parseInt(dateKey.slice(0, 4), 10);
  return Number.isFinite(year) ? year : 0;
}

export function getContributionFileName(deviceId: string, year: number): string {
  return `statistics_v2_${deviceId}_${year}.json`;
}

export function parseContributionFileName(
  filename: string
): { deviceId: string; year: number } | undefined {
  const match = /^statistics_v2_(.+)_(\d{4})\.json$/.exec(filename);
  if (!match) return undefined;
  return { deviceId: match[1], year: Number.parseInt(match[2], 10) };
}

export function isContributionFileName(filename: string): boolean {
  return parseContributionFileName(filename) !== undefined;
}

export function buildContributionFile(
  deviceId: string,
  year: number,
  revision: number,
  rows: BooksDbStatisticContribution[]
): StatisticContributionFile {
  return {
    format: STATISTICS_V2_FORMAT,
    version: STATISTICS_V2_VERSION,
    deviceId,
    year,
    revision,
    rows: rows.filter((row) => getYearFromDateKey(row.dateKey) === year)
  };
}

export function isContributionFile(value: unknown): value is StatisticContributionFile {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<StatisticContributionFile>;
  return (
    payload.format === STATISTICS_V2_FORMAT &&
    typeof payload.deviceId === 'string' &&
    payload.deviceId.length > 0 &&
    typeof payload.year === 'number' &&
    Number.isFinite(payload.year) &&
    typeof payload.revision === 'number' &&
    Array.isArray(payload.rows) &&
    payload.rows.every(
      (row) =>
        !!row &&
        typeof row.title === 'string' &&
        typeof row.dateKey === 'string' &&
        row.dateKey.length > 0
    )
  );
}

/**
 * Fold per-device contributions into display rows, per `(title, dateKey)`:
 * counters and hourly buckets sum; extrema take max/min; derived
 * speeds are recomputed from folded totals, never folded directly;
 * completion keeps the earliest valid completion.
 */
export function foldStatisticContributions(
  contributions: BooksDbStatistic[][]
): BooksDbStatistic[] {
  const grouped = new Map<string, BooksDbStatistic[]>();

  for (const list of contributions) {
    for (const row of list || []) {
      if (!row?.title || !row?.dateKey) continue;
      const key = row.title + '::' + row.dateKey;
      const existing = grouped.get(key);
      if (existing) existing.push(row);
      else grouped.set(key, [row]);
    }
  }

  const folded: BooksDbStatistic[] = [];

  for (const rows of grouped.values()) {
    folded.push(foldContributionGroup(rows));
  }

  folded.sort((a, b) =>
    a.title === b.title ? (a.dateKey > b.dateKey ? 1 : -1) : a.title > b.title ? 1 : -1
  );

  return folded;
}

function foldContributionGroup(rows: BooksDbStatistic[]): BooksDbStatistic {
  const first = rows[0];
  const folded: BooksDbStatistic = {
    ...first,
    charactersRead: 0,
    readingTime: 0,
    minReadingSpeed: 0,
    altMinReadingSpeed: 0,
    lastReadingSpeed: 0,
    maxReadingSpeed: 0,
    lastStatisticModified: 0
  };
  delete folded.completedBook;
  delete folded.completedData;

  let longestSessionSeconds = 0;
  let maxProgress = 0;
  let lookupCount = 0;
  let sessionCount = 0;
  let readingTimeByHour: number[] | undefined;
  let charactersByHour: number[] | undefined;
  let lookupsByHour: number[] | undefined;
  let readingTimeByProfile: Record<string, number> | undefined;
  let minSpeed = 0;
  let altMinSpeed = 0;
  let maxSpeed = 0;
  let earliestCompletion: BooksDbStatistic | undefined;

  for (const row of rows) {
    folded.readingTime += row.readingTime || 0;
    folded.charactersRead += row.charactersRead || 0;
    folded.lastStatisticModified = Math.max(
      folded.lastStatisticModified,
      row.lastStatisticModified || 0
    );

    lookupCount += row.lookupCount || 0;
    sessionCount += row.sessionCount || 0;
    longestSessionSeconds = Math.max(longestSessionSeconds, row.longestSessionSeconds || 0);
    maxProgress = Math.max(maxProgress, row.maxProgress || 0);
    maxSpeed = Math.max(maxSpeed, row.maxReadingSpeed || 0);
    minSpeed = foldMinSpeed(minSpeed, row.minReadingSpeed || 0);
    altMinSpeed = foldMinSpeed(altMinSpeed, row.altMinReadingSpeed || 0);

    readingTimeByHour = sumHourly(readingTimeByHour, row.readingTimeByHour);
    charactersByHour = sumHourly(charactersByHour, row.charactersByHour);
    lookupsByHour = sumHourly(lookupsByHour, row.lookupsByHour);
    readingTimeByProfile = sumByKey(readingTimeByProfile, row.readingTimeByProfile);

    if (row.completedBook && row.completedData) {
      if (
        !earliestCompletion ||
        row.dateKey < earliestCompletion.dateKey ||
        (row.dateKey === earliestCompletion.dateKey &&
          (row.lastStatisticModified || 0) < (earliestCompletion.lastStatisticModified || 0))
      ) {
        earliestCompletion = row;
      }
    }
  }

  const speed = folded.readingTime
    ? Math.ceil((3600 * folded.charactersRead) / folded.readingTime)
    : 0;
  folded.lastReadingSpeed = speed;
  folded.maxReadingSpeed = Math.max(maxSpeed, speed);
  folded.minReadingSpeed = minSpeed || speed;
  folded.altMinReadingSpeed = altMinSpeed || speed;
  if (lookupCount) folded.lookupCount = lookupCount;
  if (sessionCount) folded.sessionCount = sessionCount;
  if (longestSessionSeconds) folded.longestSessionSeconds = longestSessionSeconds;
  if (maxProgress) folded.maxProgress = maxProgress;
  if (readingTimeByHour) folded.readingTimeByHour = readingTimeByHour;
  if (charactersByHour) folded.charactersByHour = charactersByHour;
  if (lookupsByHour) folded.lookupsByHour = lookupsByHour;
  if (readingTimeByProfile) folded.readingTimeByProfile = readingTimeByProfile;
  if (earliestCompletion?.completedData) {
    folded.completedBook = 1;
    folded.completedData = earliestCompletion.completedData;
  }

  return folded;
}

function foldMinSpeed(current: number, candidate: number): number {
  if (!candidate) return current;
  return current ? Math.min(current, candidate) : candidate;
}

function sumHourly(
  current: number[] | undefined,
  incoming: number[] | undefined
): number[] | undefined {
  if (!incoming) return current;
  const length = Math.max(current?.length || 0, incoming.length, 24);
  const result = current ? [...current] : new Array(length).fill(0);
  while (result.length < length) result.push(0);
  for (let i = 0; i < incoming.length; i += 1) {
    result[i] = (result[i] || 0) + (incoming[i] || 0);
  }
  return result;
}

function sumByKey(
  current: Record<string, number> | undefined,
  incoming: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!incoming) return current;
  const result = { ...(current || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    result[key] = (result[key] || 0) + (value || 0);
  }
  return result;
}

/** A contribution row carries real reading worth publishing. */ export function isPublishableContributionRow(
  row: BooksDbStatistic
): boolean {
  return (
    (row.readingTime || 0) > 0 ||
    (row.charactersRead || 0) > 0 ||
    (row.lookupCount || 0) > 0 ||
    (row.sessionCount || 0) > 0 ||
    !!row.completedBook
  );
}

/**
 * Group one device's contribution rows into stable per-year publish payloads.
 * File revision is the max row revision, so a no-op re-publish carries an
 * unchanged revision and remotes can skip the write.
 */
export function groupContributionsByYear(
  deviceId: string,
  rows: BooksDbStatisticContribution[]
): StatisticContributionFile[] {
  const byYear = new Map<number, BooksDbStatisticContribution[]>();

  for (const row of rows) {
    if (!row?.title || !row?.dateKey) continue;
    if (!isPublishableContributionRow(row)) continue;
    const year = getYearFromDateKey(row.dateKey);
    if (!year) continue;
    const list = byYear.get(year);
    if (list) list.push(row);
    else byYear.set(year, [row]);
  }

  return [...byYear.entries()].map(([year, yearRows]) =>
    buildContributionFile(
      deviceId,
      year,
      Math.max(0, ...yearRows.map((row) => row.revision || 0)),
      yearRows
    )
  );
}

/**
 * Old non-additive legacy merge, applied per title (the legacy merge keys on
 * date only). Used for migration baselines and duplicate repair — never for
 * summing attributed contributions.
 */ export function mergeLegacySnapshotRows(snapshots: BooksDbStatistic[][]): BooksDbStatistic[] {
  const byTitle = new Map<string, BooksDbStatistic[]>();
  for (const rows of snapshots || []) {
    for (const row of rows || []) {
      if (!row?.title || !row?.dateKey) continue;
      const list = byTitle.get(row.title);
      if (list) list.push(row);
      else byTitle.set(row.title, [row]);
    }
  }

  const merged: BooksDbStatistic[] = [];
  for (const rows of byTitle.values()) {
    merged.push(...mergeStatistics(rows, [], false));
  }
  return merged;
}

/**
 * Stable content hash for clone detection: fixed field order, rows sorted by
 * key. Two tabs on one device always agree; a second device reusing our
 * deviceId produces a different hash (or a higher revision) and is held.
 */
export function hashContributionRows(rows: BooksDbStatisticContribution[]): string {
  const normalized = (rows || [])
    .filter((row) => row?.title && row?.dateKey)
    .map((row) => [
      row.title,
      row.dateKey,
      row.charactersRead || 0,
      row.readingTime || 0,
      row.lookupCount || 0,
      row.sessionCount || 0,
      row.longestSessionSeconds || 0,
      row.maxProgress || 0,
      row.minReadingSpeed || 0,
      row.altMinReadingSpeed || 0,
      row.lastReadingSpeed || 0,
      row.maxReadingSpeed || 0,
      row.lastStatisticModified || 0,
      row.readingTimeByHour || 0,
      row.charactersByHour || 0,
      row.lookupsByHour || 0,
      row.readingTimeByProfile || 0,
      row.completedBook || 0,
      row.completedData || 0,
      row.revision || 0
    ])
    .sort((a, b) =>
      a[0] === b[0] ? (a[1] > b[1] ? 1 : -1) : (a[0] as string) > (b[0] as string) ? 1 : -1
    );
  return JSON.stringify(normalized);
}
