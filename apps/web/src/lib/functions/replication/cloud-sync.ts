/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import {
  StorageDataType,
  StorageKey,
  StorageSourceDefault,
  getFriendlyStorageSourceName
} from '$lib/data/storage/storage-types';
import {
  cacheStorageData$,
  clearPendingCloudSync,
  database,
  markLastSync,
  pushTransientNotice,
  readingGoalsMergeMode$,
  replicationSaveBehavior$,
  statisticsMergeMode$
} from '$lib/data/store';
import { MergeMode } from '$lib/data/merge-mode';
import { replicateData } from '$lib/functions/replication/replicator';
import {
  beginSyncActivity,
  buildSyncLabel,
  endSyncActivity,
  updateSyncActivity
} from '$lib/functions/replication/replication-progress';
import { ensureDeviceIdentity } from '$lib/functions/replication/device-identity';
import { recordSyncRun } from '$lib/functions/replication/sync-diagnostics';
import { syncStatisticContributions } from '$lib/functions/replication/contribution-sync';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { ApiStorageHandler } from '$lib/data/storage/handler/api-handler';
import { logger } from '$lib/data/logger';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';

export const SYNC_DATA_TYPES = [
  StorageDataType.PROGRESS,
  StorageDataType.STATISTICS,
  StorageDataType.READING_GOALS,
  StorageDataType.USER_BOOKMARKS,
  StorageDataType.PROFILES
];

/**
 * Book-scoped data: mirrored only to the cloud a book is opened from during
 * on-demand secondary access. These are the per-book payloads (reading
 * position, bookmarks, audio/subtitle blobs) that respect each book's
 * preferred storage source.
 */
export const BOOK_SCOPED_DATA_TYPES = [
  StorageDataType.PROGRESS,
  StorageDataType.USER_BOOKMARKS,
  StorageDataType.AUDIOBOOK,
  StorageDataType.SUBTITLE
];

/**
 * Aggregate data: kept on the primary sync target (`$syncTarget$`) only.
 * Statistics, reading goals, and profiles describe global reading behaviour, not a single
 * book, so they are never fanned out to a secondary cloud.
 */
export const PRIMARY_ONLY_DATA_TYPES = [
  StorageDataType.STATISTICS,
  StorageDataType.READING_GOALS,
  StorageDataType.PROFILES
];

function resolveSource(
  sourceName: string,
  storageSources: BooksDbStorageSource[]
): BooksDbStorageSource | null {
  const found = storageSources?.find((s) => s.name === sourceName);
  if (found) return found;
  if (sourceName === StorageSourceDefault.GDRIVE_DEFAULT) {
    return {
      name: StorageSourceDefault.GDRIVE_DEFAULT,
      type: StorageKey.GDRIVE,
      storedInManager: false,
      encryptionDisabled: false,
      data: new ArrayBuffer(0),
      lastSourceModified: 0
    } as BooksDbStorageSource;
  }
  if (sourceName === StorageSourceDefault.ONEDRIVE_DEFAULT) {
    return {
      name: StorageSourceDefault.ONEDRIVE_DEFAULT,
      type: StorageKey.ONEDRIVE,
      storedInManager: false,
      encryptionDisabled: false,
      data: new ArrayBuffer(0),
      lastSourceModified: 0
    } as BooksDbStorageSource;
  }
  return null;
}

/**
 * Retry a cloud sync after re-authentication. Reads current store settings
 * so banner/header callers share one implementation with Settings.
 * Syncs a single named source only — automatic sync never fans out to two
 * clouds at once. Returns an error message (empty string on success).
 */
export async function triggerCloudSync(
  window: Window,
  sourceName: string,
  storageSources: BooksDbStorageSource[] = [],
  requestedTypes: StorageDataType[] = SYNC_DATA_TYPES
): Promise<string> {
  const startedAt = Date.now();
  const dataTypes = requestedTypes?.length ? requestedTypes : SYNC_DATA_TYPES;
  let deletionCounts: { deletedBookmarks: number; removedTagTitles: number } | undefined;
  const finish = (error = '') => {
    recordSyncRun({
      startedAt,
      durationMs: Date.now() - startedAt,
      target: sourceName,
      attemptedTypes: dataTypes,
      ...(error ? { error } : {}),
      ...(deletionCounts || {})
    });
    return error;
  };

  if (!sourceName) return finish('No storage source');

  try {
    await ensureDeviceIdentity(database);

    let sources = storageSources;
    if (!sources.length) {
      const db = await database.db;
      sources = await db.getAll('storageSource');
    }
    const source = resolveSource(sourceName, sources);
    if (!source) return finish(`No storage source with name ${sourceName} found`);

    const targetHandler = getStorageHandler(
      window,
      source.type,
      source.name,
      true,
      cacheStorageData$.getValue(),
      replicationSaveBehavior$.getValue(),
      statisticsMergeMode$.getValue(),
      readingGoalsMergeMode$.getValue()
    );
    const localStorageHandler = getStorageHandler(
      window,
      StorageKey.BROWSER,
      '',
      true,
      cacheStorageData$.getValue(),
      replicationSaveBehavior$.getValue(),
      statisticsMergeMode$.getValue(),
      readingGoalsMergeMode$.getValue()
    );

    const db = await database.db;
    const books = await db.getAll('data');
    const contexts = books
      .filter((b) => b && typeof b.title === 'string' && b.title.trim().length > 0)
      .map((b) => ({
        id: b.id,
        title: b.title,
        imagePath: b.coverImage || ''
      }));

    const friendlyTarget = getFriendlyStorageSourceName(sourceName) || sourceName;
    const runId = beginSyncActivity(`${buildSyncLabel('Syncing', dataTypes)} — ${friendlyTarget}`);

    // List warming: one batched metadata listing up front so the per-book
    // getExternalFiles calls in both passes below serve the in-memory cache
    // (titleToId/titleToFiles) instead of issuing O(books) per-folder
    // listings on a cold cache. Metadata-only (folder/file names), no blob
    // download; no-op when already fetched. Best-effort: failure falls back
    // to today's per-book listing and must never fail the sync.
    try {
      await targetHandler.getBookList();
    } catch (listError: any) {
      logger.warn(`Cloud book list warm-up failed for ${sourceName}: ${listError?.message}`);
    }

    // Always pull and merge before publishing. A sync direction preference
    // cannot establish that aggregate records have the same members.
    // Parent activity owns the spinner; inner replicateData calls update
    // detail as children and never clear it (see replicator isChild guard).
    updateSyncActivity(runId, {
      label: `${buildSyncLabel('Downloading', dataTypes)} — ${friendlyTarget}`
    });
    const downError = await replicateData(
      targetHandler,
      localStorageHandler,
      false,
      contexts,
      dataTypes,
      undefined,
      true
    );
    if (downError) {
      endSyncActivity(runId);
      return finish(downError);
    }

    updateSyncActivity(runId, {
      label: `${buildSyncLabel('Uploading', dataTypes)} — ${friendlyTarget}`
    });
    const error = await replicateData(
      localStorageHandler,
      targetHandler,
      false,
      contexts,
      dataTypes,
      undefined,
      true
    );
    if (error) {
      endSyncActivity(runId);
      return finish(error);
    }
    endSyncActivity(runId);

    // Deletion-state census for diagnostics: best-effort, never fails sync.
    deletionCounts = await database.getDeletionCounts().catch(() => undefined);

    markLastSync(sourceName);
    clearPendingCloudSync(sourceName);

    // Explicit user action only: triggerCloudSync is called from the
    // reconnect flow and the manual Sync button, never from background
    // autosave sync. Announce completion directly from the promise so
    // silent background check-ins can never toast.
    pushTransientNotice(`Sync complete (${getFriendlyStorageSourceName(sourceName)})`);

    // Lightweight presence refresh: re-list cloud folders (metadata only,
    // no book blob download) so remote-only / remotely-deleted books appear
    // in the library. Handlers are singletons, so invalidating here is seen
    // by the unified library stream. Emit undefined (not the handler) so
    // `database.dataList$` subscribers keep their expected source.
    try {
      if (targetHandler instanceof ApiStorageHandler) {
        targetHandler.invalidateBookListCache();
        await targetHandler.getBookList();
      }
    } catch (listError: any) {
      logger.warn(`Cloud book list refresh failed for ${sourceName}: ${listError?.message}`);
    } finally {
      database.listLoading$.next(false);
      database.dataListChanged$.next(undefined);
    }
    return finish();
  } catch (err: any) {
    const message = err?.message || 'Unknown sync error';
    logger.error(`Cloud sync retry failed for ${sourceName}: ${message}`);
    return finish(message);
  }
}

export type RecoveryDirection = 'push' | 'pull';

/**
 * One-shot recovery (M4, Advanced only, behind confirmation): a single
 * directional sync with Overwrite + Replace semantics, so deletions and
 * long-diverged state propagate explicitly. Normal syncs never use these
 * modes — they always merge. Returns an error message (empty on success).
 */
export async function runOneShotRecovery(
  window: Window,
  sourceName: string,
  direction: RecoveryDirection,
  storageSources: BooksDbStorageSource[] = []
): Promise<string> {
  const startedAt = Date.now();
  let deletionCounts: { deletedBookmarks: number; removedTagTitles: number } | undefined;
  const finish = (error = '') => {
    recordSyncRun({
      startedAt,
      durationMs: Date.now() - startedAt,
      target: sourceName,
      attemptedTypes: SYNC_DATA_TYPES,
      ...(error ? { error: `recovery(${direction}): ${error}` } : {}),
      ...(deletionCounts || {})
    });
    return error;
  };

  if (!sourceName) return finish('No storage source');

  try {
    const identity = await ensureDeviceIdentity(database);

    let sources = storageSources;
    if (!sources.length) {
      const db = await database.db;
      sources = await db.getAll('storageSource');
    }
    const source = resolveSource(sourceName, sources);
    if (!source) return finish(`No storage source with name ${sourceName} found`);

    const targetHandler = getStorageHandler(
      window,
      source.type,
      source.name,
      true,
      cacheStorageData$.getValue(),
      ReplicationSaveBehavior.Overwrite,
      MergeMode.REPLACE,
      MergeMode.REPLACE
    );
    const localStorageHandler = getStorageHandler(
      window,
      StorageKey.BROWSER,
      '',
      true,
      cacheStorageData$.getValue(),
      ReplicationSaveBehavior.Overwrite,
      MergeMode.REPLACE,
      MergeMode.REPLACE
    );

    const db = await database.db;
    const books = await db.getAll('data');
    const contexts = books
      .filter((b) => b && typeof b.title === 'string' && b.title.trim().length > 0)
      .map((b) => ({
        id: b.id,
        title: b.title,
        imagePath: b.coverImage || ''
      }));

    const from = direction === 'push' ? localStorageHandler : targetHandler;
    const to = direction === 'push' ? targetHandler : localStorageHandler;
    const friendlyTarget = getFriendlyStorageSourceName(sourceName) || sourceName;
    const recoveryVerb = direction === 'push' ? 'Uploading' : 'Downloading';
    const runId = beginSyncActivity(
      `${buildSyncLabel(recoveryVerb, SYNC_DATA_TYPES)} — ${friendlyTarget} (recovery)`
    );
    const error = await replicateData(from, to, false, contexts, SYNC_DATA_TYPES, undefined, true);
    if (error) {
      endSyncActivity(runId);
      return finish(error);
    }

    updateSyncActivity(runId, { label: `Syncing Statistics — ${friendlyTarget} (recovery)` });
    const contributionsError = await syncStatisticContributions(
      database,
      targetHandler,
      identity.deviceId
    );
    endSyncActivity(runId);
    if (contributionsError) return finish(contributionsError);

    // Post-recovery census: Overwrite replaces the manual set wholesale, so
    // this also confirms recovery cleared deletion state in its scope.
    deletionCounts = await database.getDeletionCounts().catch(() => undefined);

    try {
      if (targetHandler instanceof ApiStorageHandler) {
        targetHandler.invalidateBookListCache();
        await targetHandler.getBookList();
      }
    } catch (listError: any) {
      logger.warn(`Cloud book list refresh failed for ${sourceName}: ${listError?.message}`);
    } finally {
      database.listLoading$.next(false);
      database.dataListChanged$.next(undefined);
    }
    return finish();
  } catch (err: any) {
    const message = err?.message || 'Unknown sync error';
    logger.error(`One-shot recovery failed for ${sourceName}: ${message}`);
    return finish(message);
  }
}
