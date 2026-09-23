/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BooksDbUserBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import { canonicalizeUserBookmarks } from '$lib/data/user-bookmarks-merge';
import { FilePrefix, type BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import { StorageKey } from '$lib/data/storage/storage-types';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';

/**
 * Exact-state sync markers for user bookmarks (manual bookmark rows).
 *
 * Why markers instead of timestamps: bookmark files are merged sets with
 * per-row last-write-wins (deletions are ordinary row fields), so a scalar
 * freshness marker must never gate the read — two sets can share the same
 * max-timestamp and row count while differing (e.g. one side edited X@200,
 * the other deleted Y@200 under clock skew), and skipping then would drop
 * the deletion. Markers skip only on exact equality instead:
 *
 * - the remote file set (names + revisions) is identical to the set seen by
 *   the last successful merge, AND
 * - the local rows are identical (canonical fingerprint) to the rows
 *   produced by that merge.
 *
 * Either side changed (or the marker is missing/corrupt, or the pairing is
 * ineligible) falls through to the full pull + merge. A skip therefore
 * performs neither a read that could have changed the outcome nor a write
 * that would have differed — worst case is a redundant fetch, never loss.
 * Markers are advisory performance hints in localStorage (no schema
 * migration, no cross-tab coordination): losing one only costs speed.
 *
 * Markers bind to the local data-row id as well as the title: deleting a
 * book and re-importing it mints a fresh row id, so the stale marker from
 * the deleted row can never suppress the restoration fetch. Contexts
 * without an id (backup zips, ad-hoc callers) simply never skip.
 */
const MARKER_VERSION = 1;

const MARKER_KEY_PREFIX = 'ttu-reader:ub-sync-state:v1:';

export interface BookmarksSyncMarker {
  v: number;
  remoteNames: string[];
  localFp: string;
  /** Local `data` row id at record time; undefined for id-less contexts. */
  dataId?: number;
}

/**
 * Advisory content fingerprint over transport identity only (per-device
 * auto-increment ids excluded, order-independent). FNV-1a is enough: a
 * collision merely skips one fetch, converging on the next change.
 */
export function fingerprintUserBookmarks(rows: BooksDbUserBookmarkData[] | undefined): string {
  const normalized = canonicalizeUserBookmarks(Array.isArray(rows) ? rows : []);
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
}

function markerKey(remoteSourceName: string, title: string): string {
  return `${MARKER_KEY_PREFIX}${encodeURIComponent(remoteSourceName)}::${encodeURIComponent(title)}`;
}

function readStorage(): Storage | undefined {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readBookmarksSyncMarker(
  remoteSourceName: string,
  title: string
): BookmarksSyncMarker | undefined {
  try {
    const raw = readStorage()?.getItem(markerKey(remoteSourceName, title));

    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as Partial<BookmarksSyncMarker>;

    if (parsed?.v !== MARKER_VERSION) return undefined;
    if (
      !Array.isArray(parsed.remoteNames) ||
      !parsed.remoteNames.every((name) => typeof name === 'string')
    ) {
      return undefined;
    }
    if (typeof parsed.localFp !== 'string') return undefined;
    if (parsed.dataId !== undefined && typeof parsed.dataId !== 'number') return undefined;

    return {
      v: MARKER_VERSION,
      remoteNames: [...parsed.remoteNames].sort(),
      localFp: parsed.localFp,
      dataId: parsed.dataId
    };
  } catch {
    return undefined;
  }
}

export function writeBookmarksSyncMarker(
  remoteSourceName: string,
  title: string,
  remoteNames: string[],
  localFp: string,
  dataId: number | undefined
): void {
  try {
    readStorage()?.setItem(
      markerKey(remoteSourceName, title),
      JSON.stringify({
        v: MARKER_VERSION,
        remoteNames: [...remoteNames].sort(),
        localFp,
        dataId
      })
    );
  } catch {
    // Advisory only: losing a marker costs one redundant fetch.
  }
}

export function clearBookmarksSyncMarker(remoteSourceName: string, title: string): void {
  try {
    readStorage()?.removeItem(markerKey(remoteSourceName, title));
  } catch {
    // no-op
  }
}

interface SyncSides {
  browser: BaseStorageHandler;
  remote: BaseStorageHandler;
}

/**
 * Marker-eligible pairings: exactly one browser side plus one file-backed
 * remote (cloud/filesystem). Backup import/export always copies everything,
 * Overwrite recovery replaces wholesale, and cloud-to-cloud pass-through
 * has no local rows to fingerprint — all fall back to the full merge.
 */
function splitSyncSides(
  sourceHandler: BaseStorageHandler,
  targetHandler: BaseStorageHandler
): SyncSides | undefined {
  const sourceIsBrowser = sourceHandler.storageType === StorageKey.BROWSER;
  const targetIsBrowser = targetHandler.storageType === StorageKey.BROWSER;

  if (sourceIsBrowser === targetIsBrowser) return undefined;

  const browser = sourceIsBrowser ? sourceHandler : targetHandler;
  const remote = sourceIsBrowser ? targetHandler : sourceHandler;

  if (remote.storageType === StorageKey.BACKUP) return undefined;
  if (sourceHandler.isOverwriteMode() || targetHandler.isOverwriteMode()) return undefined;

  return { browser, remote };
}

async function currentRemoteNames(
  remote: BaseStorageHandler,
  context: ReplicationContext
): Promise<string[] | undefined> {
  try {
    const files = await remote.listFilesWithPrefix(FilePrefix.USER_BOOKMARKS, context);

    return files.map((file) => file.name).sort();
  } catch {
    return undefined;
  }
}

async function currentLocalFingerprint(
  browser: BaseStorageHandler,
  context: ReplicationContext
): Promise<string | undefined> {
  try {
    const rows = await browser.getUserBookmarks(context);

    if (!Array.isArray(rows)) return undefined;

    return fingerprintUserBookmarks(rows as BooksDbUserBookmarkData[]);
  } catch {
    return undefined;
  }
}

function equalNameSets(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

/**
 * True when the bookmark sync for this book can skip its body fetch(es):
 * the remote set and local rows both match the last successful merge.
 * Never throws; any doubt returns false (full pull + merge).
 */
export async function trySkipUserBookmarksSync(
  sourceHandler: BaseStorageHandler,
  targetHandler: BaseStorageHandler,
  context: ReplicationContext
): Promise<boolean> {
  const sides = splitSyncSides(sourceHandler, targetHandler);

  if (!sides) return false;

  try {
    const remoteNames = await currentRemoteNames(sides.remote, context);
    const localFp = await currentLocalFingerprint(sides.browser, context);

    if (!remoteNames || localFp === undefined) return false;

    const marker = readBookmarksSyncMarker(sides.remote.getCurrentStorageSource(), context.title);

    if (!marker) return false;

    // The marker is bound to the local data row that produced it. A fresh
    // row id means delete-then-reimport (or any row recreation): the rows
    // may look identical while the merge never ran for this row, so a
    // match must not skip the restoration fetch. Id-less contexts never
    // skip.
    if (marker.dataId === undefined || context.id === undefined || marker.dataId !== context.id) {
      return false;
    }

    return marker.localFp === localFp && equalNameSets(marker.remoteNames, remoteNames);
  } catch {
    return false;
  }
}

/**
 * Record the post-merge state after a successful save. Callers must only
 * invoke this when a genuine merge ran (never for File pass-through
 * payloads a browser target drops unmerged). Never throws.
 */
export async function recordUserBookmarksSyncState(
  sourceHandler: BaseStorageHandler,
  targetHandler: BaseStorageHandler,
  context: ReplicationContext
): Promise<void> {
  const sides = splitSyncSides(sourceHandler, targetHandler);

  if (!sides) return;

  try {
    // Listed after the save so an upload that minted a new filename is
    // captured; the down-pass remote is untouched by its own save, so the
    // same re-list is equally valid there.
    const remoteNames = await currentRemoteNames(sides.remote, context);
    const localFp = await currentLocalFingerprint(sides.browser, context);

    if (!remoteNames || localFp === undefined) return;

    writeBookmarksSyncMarker(
      sides.remote.getCurrentStorageSource(),
      context.title,
      remoteNames,
      localFp,
      context.id
    );
  } catch {
    // Advisory only.
  }
}
