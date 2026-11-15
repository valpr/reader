/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { IDBPDatabase } from 'idb';
import type BooksDb from '$lib/data/database/books-db/versions/books-db';
import {
  BaseStorageHandler,
  FilePrefix,
  type FileIdentity
} from '$lib/data/storage/handler/base-handler';
import { StorageDataType, StorageKey } from '$lib/data/storage/storage-types';
import { fingerprintUserBookmarks } from '$lib/functions/replication/bookmarks-sync-state';

/**
 * Whole-sync early exit: skip a full cloud sync when nothing changed.
 *
 * Follows the exact-state marker pattern from `bookmarks-sync-state.ts`:
 * a skip is allowed only when BOTH sides provably match the last
 * successful full sync —
 *
 * - the local syncable content hashes to the same fingerprint, AND
 * - the remote file inventory (names + revisions) is identical to the
 *   inventory seen by that sync.
 *
 * Either side changed (or the marker is missing, corrupt, expired, or
 * the pairing is ineligible) falls through to the full sync. A skip
 * therefore performs neither a read that could have changed the outcome
 * nor a write that would have differed — worst case is a redundant sync,
 * never loss. Markers are advisory performance hints in localStorage (no
 * schema migration, no cross-tab coordination): losing one only costs
 * speed.
 *
 * Why an inventory instead of a manifest file in the cloud: every cloud
 * writer would have to cooperate with a manifest (single-book sync,
 * profile sync, recovery, import), and any writer that forgot would let
 * another device skip past its upload. The inventory observes the actual
 * remote state, so it is immune to writer bypasses by construction: any
 * upload changes a filename (timestamps are embedded in every sync
 * filename) or a provider revision, and the next gate sees it.
 *
 * Scope: the gate covers the standard full-sync types only (progress,
 * statistics, reading goals, user bookmarks, profiles). Book blobs,
 * covers, audio, subtitles, and tags are synced on demand or under
 * other flows, so a run requesting them never skips — and the marker is
 * only recorded after a run that covered all five gated types, so a
 * partial run can never mint a marker for state it did not publish.
 */
export const SYNC_STATE_GATED_TYPES: StorageDataType[] = [
  StorageDataType.PROGRESS,
  StorageDataType.STATISTICS,
  StorageDataType.READING_GOALS,
  StorageDataType.USER_BOOKMARKS,
  StorageDataType.PROFILES
];

const MARKER_VERSION = 1;

const MARKER_KEY_PREFIX = 'reader:full-sync-state:v1:';

/**
 * Upper bound on trusting a marker without re-verifying bodies (30 days).
 * Same bound as the bookmarks marker: it caps the identical-filename
 * race (same name + same revision, divergent content under clock skew)
 * that name/revision matching cannot see, while costing one full sync
 * per idle month — negligible against the per-sync savings.
 */
const MARKER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Per-book file identities, one entry per remote book folder. */
export interface BookSyncInventory {
  title: string;
  progress: FileIdentity[];
  statistics: FileIdentity[];
  userBookmarks: FileIdentity[];
}

/** Remote state observed by the gate: titles, per-book files, root files. */
export interface RemoteSyncInventory {
  books: BookSyncInventory[];
  readingGoals: FileIdentity[];
  profiles: FileIdentity[];
  contributions: FileIdentity[];
}

export interface FullSyncStateMarker {
  v: number;
  localHash: string;
  remote: RemoteSyncInventory;
  /** Wall-clock ms at record time; markers pre-dating this field read old. */
  recordedAt?: number;
}

export interface FullSyncStateInputs {
  db: IDBPDatabase<BooksDb>;
  localHandler: BaseStorageHandler;
  remoteHandler: BaseStorageHandler;
  dataTypes: StorageDataType[];
}

/**
 * Deterministic JSON: object keys sorted recursively, `undefined`
 * normalized to `null`, so the same logical state always serializes to
 * the same string regardless of row order or key insertion order.
 * Callers sort arrays by their key before stringifying.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

async function sha256Hex(text: string): Promise<string | undefined> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return undefined;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

function sortIdentities(identities: FileIdentity[]): FileIdentity[] {
  return [...identities].sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return (a.revision ?? '') < (b.revision ?? '') ? -1 : 1;
  });
}

/**
 * Content fingerprint over the local syncable state for the gated types.
 * Book rows contribute only id/title/lastBookModified: book content is
 * not in the gated set, and lastBookModified is the book-change signal
 * (re-import bumps it). `lastBookOpen` is deliberately excluded — merely
 * opening a book must not defeat the skip. Progress rows are hashed
 * whole (every field is sync content); user bookmarks reuse the existing
 * canonical fingerprint; statistics hash both the folded rows and the
 * per-device contribution rows; goals and profiles hash the exact payload
 * the handlers publish. Returns undefined when anything needed is
 * unavailable — the gate treats that as "cannot prove unchanged".
 */
export async function computeLocalSyncFingerprint(
  db: IDBPDatabase<BooksDb>,
  localHandler: BaseStorageHandler
): Promise<string | undefined> {
  try {
    const [
      books,
      progressRows,
      userBookmarkRows,
      statisticRows,
      contributionRows,
      goals,
      profiles
    ] = await Promise.all([
      db.getAll('data').catch(() => undefined),
      db.getAll('bookmark').catch(() => undefined),
      db.getAll('userBookmark').catch(() => undefined),
      db.getAll('statistic').catch(() => undefined),
      db.getAll('statisticContribution').catch(() => undefined),
      localHandler.getReadingGoals().catch(() => undefined),
      localHandler.getProfiles().catch(() => undefined)
    ]);

    if (
      !books ||
      !progressRows ||
      !userBookmarkRows ||
      !statisticRows ||
      !contributionRows ||
      !goals ||
      !profiles
    ) {
      return undefined;
    }

    const snapshot = {
      v: 1,
      books: books
        .map((book) => ({
          id: book.id,
          title: book.title,
          lastBookModified: book.lastBookModified
        }))
        .sort((a, b) => a.id - b.id),
      progress: [...progressRows].sort((a, b) => a.dataId - b.dataId),
      userBookmarks: fingerprintUserBookmarks(userBookmarkRows),
      statistics: [...statisticRows].sort((a, b) =>
        a.title === b.title
          ? a.dateKey < b.dateKey
            ? -1
            : a.dateKey > b.dateKey
              ? 1
              : 0
          : a.title < b.title
            ? -1
            : 1
      ),
      contributions: [...contributionRows].sort((a, b) =>
        a.title === b.title
          ? a.dateKey < b.dateKey
            ? -1
            : a.dateKey > b.dateKey
              ? 1
              : 0
          : a.title < b.title
            ? -1
            : 1
      ),
      readingGoals: goals,
      profiles
    };

    return sha256Hex(stableStringify(snapshot));
  } catch {
    return undefined;
  }
}

/**
 * Remote file inventory for the gated types, metadata-only (names +
 * revisions, no bodies). Per-book listings are served from the warmed
 * book-list cache when available; root listings are metadata-only by
 * construction. Returns undefined when anything needed is unavailable.
 */
export async function collectRemoteSyncInventory(
  remoteHandler: BaseStorageHandler
): Promise<RemoteSyncInventory | undefined> {
  try {
    const cards = await remoteHandler.getBookList();
    const titles = [
      ...new Set(
        cards
          .map((card) => card.title)
          .filter((title): title is string => typeof title === 'string' && title.length > 0)
      )
    ].sort();

    const books: BookSyncInventory[] = [];
    for (const title of titles) {
      const context = { title };
      const [progress, statistics, userBookmarks] = await Promise.all([
        remoteHandler.listFilesWithPrefix('progress_', context).catch(() => undefined),
        remoteHandler.listFilesWithPrefix('statistics_', context).catch(() => undefined),
        remoteHandler.listFilesWithPrefix(FilePrefix.USER_BOOKMARKS, context).catch(() => undefined)
      ]);
      if (!progress || !statistics || !userBookmarks) return undefined;
      books.push({
        title,
        progress: sortIdentities(progress),
        statistics: sortIdentities(statistics),
        userBookmarks: sortIdentities(userBookmarks)
      });
    }

    const [readingGoals, profiles, contributions] = await Promise.all([
      remoteHandler.listRootFileIdentities(BaseStorageHandler.readingGoalsFilePrefix),
      remoteHandler.listRootFileIdentities(BaseStorageHandler.profilesFilePrefix),
      remoteHandler.listRootFileIdentities(BaseStorageHandler.contributionFilePrefix)
    ]);
    if (!readingGoals || !profiles || !contributions) return undefined;

    return {
      books,
      readingGoals: sortIdentities(readingGoals),
      profiles: sortIdentities(profiles),
      contributions: sortIdentities(contributions)
    };
  } catch {
    return undefined;
  }
}

function markerKey(sourceName: string): string {
  return `${MARKER_KEY_PREFIX}${encodeURIComponent(sourceName)}`;
}

function readStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

function isFileIdentity(value: unknown): value is FileIdentity {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FileIdentity>;
  return (
    typeof entry.name === 'string' &&
    (entry.revision === undefined || typeof entry.revision === 'string')
  );
}

function isRemoteInventory(value: unknown): value is RemoteSyncInventory {
  if (!value || typeof value !== 'object') return false;
  const inventory = value as Partial<RemoteSyncInventory>;
  if (
    !Array.isArray(inventory.books) ||
    !Array.isArray(inventory.readingGoals) ||
    !Array.isArray(inventory.profiles) ||
    !Array.isArray(inventory.contributions)
  ) {
    return false;
  }
  return (
    inventory.books.every(
      (book) =>
        book &&
        typeof book === 'object' &&
        typeof (book as BookSyncInventory).title === 'string' &&
        Array.isArray((book as BookSyncInventory).progress) &&
        (book as BookSyncInventory).progress.every(isFileIdentity) &&
        Array.isArray((book as BookSyncInventory).statistics) &&
        (book as BookSyncInventory).statistics.every(isFileIdentity) &&
        Array.isArray((book as BookSyncInventory).userBookmarks) &&
        (book as BookSyncInventory).userBookmarks.every(isFileIdentity)
    ) &&
    inventory.readingGoals.every(isFileIdentity) &&
    inventory.profiles.every(isFileIdentity) &&
    inventory.contributions.every(isFileIdentity)
  );
}

export function readFullSyncStateMarker(sourceName: string): FullSyncStateMarker | undefined {
  try {
    const raw = readStorage()?.getItem(markerKey(sourceName));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<FullSyncStateMarker>;
    if (parsed?.v !== MARKER_VERSION) return undefined;
    if (typeof parsed.localHash !== 'string') return undefined;
    if (!isRemoteInventory(parsed.remote)) return undefined;
    if (parsed.recordedAt !== undefined && typeof parsed.recordedAt !== 'number') {
      return undefined;
    }
    return {
      v: MARKER_VERSION,
      localHash: parsed.localHash,
      remote: parsed.remote,
      recordedAt: parsed.recordedAt
    };
  } catch {
    return undefined;
  }
}

export function writeFullSyncStateMarker(
  sourceName: string,
  localHash: string,
  remote: RemoteSyncInventory
): void {
  try {
    readStorage()?.setItem(
      markerKey(sourceName),
      JSON.stringify({
        v: MARKER_VERSION,
        localHash,
        remote,
        recordedAt: Date.now()
      })
    );
  } catch {
    // Advisory only: losing a marker costs one redundant sync.
  }
}

export function clearFullSyncStateMarker(sourceName: string): void {
  try {
    readStorage()?.removeItem(markerKey(sourceName));
  } catch {
    // no-op
  }
}

/**
 * Marker-eligible pairings: exactly one browser side (local) plus one
 * file-backed remote (cloud). Backup import/export always copies
 * everything, Overwrite recovery replaces wholesale, and cloud-to-cloud
 * pass-through has no local rows to fingerprint — all fall back to the
 * full sync.
 */
function isEligiblePairing(
  localHandler: BaseStorageHandler,
  remoteHandler: BaseStorageHandler
): boolean {
  if (localHandler.storageType !== StorageKey.BROWSER) return false;
  if (
    remoteHandler.storageType === StorageKey.BROWSER ||
    remoteHandler.storageType === StorageKey.BACKUP
  ) {
    return false;
  }
  if (localHandler.isOverwriteMode() || remoteHandler.isOverwriteMode()) return false;
  return true;
}

/**
 * True when the full sync for this source can be skipped: the requested
 * types are all inside the gated set, and both the local fingerprint and
 * the remote inventory match the last successful full sync. Never
 * throws; any doubt returns false (full sync).
 */
export async function trySkipFullSync(
  sourceName: string,
  inputs: FullSyncStateInputs
): Promise<boolean> {
  try {
    if (!inputs.dataTypes.every((type) => SYNC_STATE_GATED_TYPES.includes(type))) {
      return false;
    }
    if (!isEligiblePairing(inputs.localHandler, inputs.remoteHandler)) return false;

    const marker = readFullSyncStateMarker(sourceName);
    if (!marker) return false;

    // Markers expire (pre-TTL markers read old and therefore always fail
    // here): bounds the identical-filename race to one TTL window, then
    // a full sync re-verifies and re-records.
    if (
      typeof marker.recordedAt !== 'number' ||
      Date.now() - marker.recordedAt > MARKER_MAX_AGE_MS
    ) {
      return false;
    }

    const localHash = await computeLocalSyncFingerprint(inputs.db, inputs.localHandler);
    if (!localHash || localHash !== marker.localHash) return false;

    const remote = await collectRemoteSyncInventory(inputs.remoteHandler);
    if (!remote) return false;

    return stableStringify(remote) === stableStringify(marker.remote);
  } catch {
    return false;
  }
}

/**
 * Record the post-sync state after a successful full sync. Callers must
 * only invoke this when the run covered all gated types (a partial run
 * must never mint a marker for state it did not publish). Never throws.
 */
export async function recordFullSyncState(
  sourceName: string,
  inputs: FullSyncStateInputs
): Promise<void> {
  try {
    if (!SYNC_STATE_GATED_TYPES.every((type) => inputs.dataTypes.includes(type))) return;
    if (!isEligiblePairing(inputs.localHandler, inputs.remoteHandler)) return;

    const localHash = await computeLocalSyncFingerprint(inputs.db, inputs.localHandler);
    if (!localHash) return;
    const remote = await collectRemoteSyncInventory(inputs.remoteHandler);
    if (!remote) return;

    writeFullSyncStateMarker(sourceName, localHash, remote);
  } catch {
    // Advisory only.
  }
}
