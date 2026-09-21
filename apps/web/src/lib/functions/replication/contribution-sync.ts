/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { DatabaseService } from '$lib/data/database/books-db/database.service';
import type {
  BooksDbStatistic,
  BooksDbStatisticSyncState
} from '$lib/data/database/books-db/versions/books-db';
import { createDeviceId } from '$lib/functions/replication/device-identity';
import { CloneSuspectError } from '$lib/functions/replication/error-handler';
import {
  MIGRATION_MARKER_FORMAT,
  MIGRATION_MARKER_VERSION,
  hashContributionRows,
  isContributionFile,
  isStatisticMigrationMarker,
  mergeLegacySnapshotRows,
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
      baseline = mergeLegacySnapshotRows(snapshots);
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
  const merged = mergeLegacySnapshotRows([baselineRows, display]);
  await db.seedLegacyBaseline(merged, sourceTag);
  await db.markLegacyStatisticsMigrationComplete(`legacy:${sourceTag}`);
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
 *
 * Clone hold (M3): our last-published revision+hash per file is remembered.
 * If our remote file advanced beyond (or diverged from) what we published,
 * another writer is reusing our deviceId — publishing is held with a visible
 * error instead of silently overwriting their contribution.
 */
export async function publishContributionFiles(
  db: DatabaseService,
  remote: ContributionRemote,
  deviceId: string
): Promise<void> {
  const own = await db.getOwnContributionFiles(deviceId);
  if (!own.length) return;
  const existing = (await remote.listContributionFiles()).filter(isContributionFile);
  const published = await getPublishedV2State(db);
  const toWrite: StatisticContributionFile[] = [];

  for (const file of own) {
    const fileKey = `${file.deviceId}/${file.year}`;
    const match = existing.find(
      (entry) => entry.deviceId === file.deviceId && entry.year === file.year
    );
    const ownHash = hashContributionRows(file.rows);
    const last = published.files[fileKey];

    if (match && last) {
      const remoteHash = hashContributionRows(match.rows);
      if (
        (match.revision || 0) > (last.revision || 0) ||
        ((match.revision || 0) === (last.revision || 0) && remoteHash !== last.hash)
      ) {
        throw new CloneSuspectError(
          `Contribution file ${fileKey} changed outside this device (revision ` +
            `${match.revision}, last published ${last.revision}). Publishing is held so a ` +
            `cloned device identity cannot overwrite another device's reading. Adopt a ` +
            `fresh device identity, then sync again.`
        );
      }
    }

    if (match && (match.revision || 0) >= (file.revision || 0)) {
      published.files[fileKey] = {
        revision: match.revision || 0,
        hash: hashContributionRows(match.rows)
      };
      continue;
    }
    if (match && hashContributionRows(match.rows) === ownHash) {
      published.files[fileKey] = { revision: match.revision || 0, hash: ownHash };
      continue;
    }

    toWrite.push(file);
    published.files[fileKey] = { revision: file.revision || 0, hash: ownHash };
  }

  if (toWrite.length) {
    await remote.writeContributionFiles(toWrite);
  }
  await putPublishedV2State(db, published);
}

interface PublishedV2State extends BooksDbStatisticSyncState {
  files: Record<string, { revision: number; hash: string }>;
}

const PUBLISHED_V2_STATE_ID = 'published-v2';

async function getPublishedV2State(db: DatabaseService): Promise<PublishedV2State> {
  const state = await db.getStatisticSyncState(PUBLISHED_V2_STATE_ID);
  return {
    id: PUBLISHED_V2_STATE_ID,
    updatedAt: state?.updatedAt || 0,
    files: ((state as PublishedV2State)?.files || {}) as Record<
      string,
      { revision: number; hash: string }
    >
  };
}

async function putPublishedV2State(db: DatabaseService, state: PublishedV2State): Promise<void> {
  await db.putStatisticSyncState({ ...state, updatedAt: Date.now() });
}

/**
 * Escape hatch for a held publish: mint a fresh device identity. Future
 * contributions publish under the new id; the old file stays untouched.
 */
export async function adoptNewDeviceIdentity(
  db: DatabaseService,
  deviceLabel = 'This device'
): Promise<string> {
  const deviceId = createDeviceId();
  await db.putDeviceIdentity({ id: 0, deviceId, deviceLabel });
  return deviceId;
}
