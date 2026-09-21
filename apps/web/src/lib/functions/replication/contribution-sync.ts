/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { DatabaseService } from '$lib/data/database/books-db/database.service';
import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';
import { mergeStatistics } from '$lib/functions/statistic-util';
import {
  MIGRATION_MARKER_FORMAT,
  MIGRATION_MARKER_VERSION,
  isContributionFile,
  isStatisticMigrationMarker,
  pickMigrationWinner,
  type StatisticContributionFile,
  type StatisticMigrationMarker
} from '$lib/functions/statistic-v2';

/**
 * Statistics v2 sync (P3/P4/P5): pull, reconcile, publish.
 *
 * Structural remote surface — implemented by the cloud, filesystem, and
 * backup handlers, and by the fake remote used in sync tests:
 */
export interface ContributionRemote {
  listContributionFiles(): Promise<StatisticContributionFile[]>;
  writeContributionFiles(files: StatisticContributionFile[]): Promise<void>;
  listMigrationMarkers(): Promise<StatisticMigrationMarker[]>;
  writeMigrationMarker(marker: StatisticMigrationMarker): Promise<void>;
  listLegacyStatisticSnapshots(): Promise<BooksDbStatistic[][]>;
}

/**
 * One sync run: migrate once, then pull + fold, then publish. Returns an
 * error message (empty string on success) so callers can merge it into
 * their own replication error reporting.
 */
export async function syncStatisticContributions(
  db: DatabaseService,
  remote: ContributionRemote,
  deviceId: string
): Promise<string> {
  try {
    await ensureContributionMigration(db, remote, deviceId);
    await pullContributionFiles(db, remote);
    await publishContributionFiles(db, remote, deviceId);
  } catch (error: any) {
    return error?.message || 'Statistics sync failed';
  }

  return '';
}

/**
 * P4 one-time, conservative legacy migration. Old snapshots are
 * un-attributed, so they are merged with the old non-additive merge — never
 * summed — and seeded as a single `legacy:` baseline that later folds
 * exactly once. Concurrent first-syncs each propose their own marker; the
 * deterministic tie-break (lowest deviceId) picks one winner and the loser
 * adopts the winner's baseline.
 */
export async function ensureContributionMigration(
  db: DatabaseService,
  remote: ContributionRemote,
  deviceId: string
): Promise<void> {
  if (await db.isLegacyStatisticsMigrationComplete()) return;

  // Always propose our own marker first: a visible marker may be a
  // concurrent proposal, not a decided winner. The re-list + deterministic
  // tie-break below is what decides, identically on every provider.
  const visible = (await remote.listMigrationMarkers()).filter(isStatisticMigrationMarker);
  if (!visible.some((marker) => marker.deviceId === deviceId)) {
    const display = await db.getAllDisplayStatistics();
    let baseline = display;
    if (!baseline.length) {
      const snapshots = await remote.listLegacyStatisticSnapshots();
      baseline = mergeLegacySnapshots(snapshots);
    }
    await remote.writeMigrationMarker({
      format: MIGRATION_MARKER_FORMAT,
      version: MIGRATION_MARKER_VERSION,
      deviceId,
      completedAt: Date.now(),
      baselineRows: baseline
    });
  }

  const after = (await remote.listMigrationMarkers()).filter(isStatisticMigrationMarker);
  // Remotes that don't persist markers (never in production) fall back to a
  // local-only baseline so migration still completes exactly once.
  const winner =
    after.length === 0
      ? {
          deviceId,
          baselineRows: await db.getAllDisplayStatistics()
        }
      : pickMigrationWinner(after);
  await adoptBaseline(db, winner.baselineRows, winner.deviceId);
}

async function adoptBaseline(
  db: DatabaseService,
  baselineRows: BooksDbStatistic[],
  sourceTag: string
): Promise<void> {
  const display = await db.getAllDisplayStatistics();
  const merged = mergeLegacySnapshots([baselineRows, display]);
  await db.seedLegacyBaseline(merged, sourceTag);
  await db.markLegacyStatisticsMigrationComplete(`legacy:${sourceTag}`);
}

/** Old non-additive merge, applied per title (legacy merge keys date only). */
function mergeLegacySnapshots(snapshots: BooksDbStatistic[][]): BooksDbStatistic[] {
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
 * Pull: fetch every contribution file, cache them as remote rows, recompute
 * display. The local contribution store is never written here, and our own
 * device file is ignored (the local store is authoritative for it) — that
 * ordering is what keeps re-pulls idempotent.
 */
export async function pullContributionFiles(
  db: DatabaseService,
  remote: ContributionRemote
): Promise<void> {
  const files = (await remote.listContributionFiles()).filter(isContributionFile);
  await db.storeRemoteContributionFiles(files);
  await db.refoldAllFromStores();
}

/**
 * Publish: overwrite our own stable per-year files in place. Files the
 * remote already holds at an equal-or-newer revision are skipped, so a
 * no-op re-sync performs no writes.
 */
export async function publishContributionFiles(
  db: DatabaseService,
  remote: ContributionRemote,
  deviceId: string
): Promise<void> {
  const own = await db.getOwnContributionFiles(deviceId);
  if (!own.length) return;
  const existing = (await remote.listContributionFiles()).filter(isContributionFile);
  const stale = own.filter((file) => {
    const match = existing.find(
      (entry) => entry.deviceId === file.deviceId && entry.year === file.year
    );
    return !match || (match.revision || 0) < (file.revision || 0);
  });
  if (stale.length) {
    await remote.writeContributionFiles(stale);
  }
}
