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
  markPendingCloudSync,
  pushTransientNotice,
  readingGoalsMergeMode$,
  replicationSaveBehavior$,
  statisticsMergeMode$
} from '$lib/data/store';
import { MergeMode } from '$lib/data/merge-mode';
import { replicateData } from '$lib/functions/replication/replicator';
import {
  beginPriorityPhase,
  beginSyncActivity,
  buildSyncLabel,
  endSyncActivity,
  markPriorityBookComplete,
  markPriorityReady,
  resetReadReady,
  updateSyncActivity
} from '$lib/functions/replication/replication-progress';
import {
  READ_READY_DATA_TYPES,
  splitSyncContexts,
  type PrioritizableContext
} from '$lib/functions/replication/sync-priority';
import { ensureDeviceIdentity } from '$lib/functions/replication/device-identity';
import { recordSyncRun } from '$lib/functions/replication/sync-diagnostics';
import { syncStatisticContributions } from '$lib/functions/replication/contribution-sync';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { isNetworkUnreachableError } from '$lib/functions/replication/error-handler';
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
    // Safety net: transient network failures (any data type) must retain the
    // pending marker even if the per-request handler never ran, so the next
    // online sync heals without forcing a reconnect.
    if (error && isNetworkUnreachableError(error)) {
      markPendingCloudSync(sourceName, error);
    }
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
    // Priority ranking needs local reading signals alongside the context:
    // progress + recency decide which books sync their reading state first.
    // Best-effort: a missing bookmark store still yields plain contexts.
    const bookmarksById = new Map<
      number,
      { progress?: number | string; lastBookmarkModified?: number }
    >();
    try {
      const bookmarks = await db.getAll('bookmark');
      for (const bookmark of bookmarks || []) {
        if (bookmark && typeof bookmark.dataId === 'number') {
          bookmarksById.set(bookmark.dataId, bookmark);
        }
      }
    } catch {
      // no-op: contexts below fall back to book-level signals only.
    }
    const contexts: PrioritizableContext[] = books
      .filter((b) => b && typeof b.title === 'string' && b.title.trim().length > 0)
      .map((b) => {
        const bookmark = typeof b.id === 'number' ? bookmarksById.get(b.id) : undefined;
        return {
          id: b.id,
          title: b.title,
          imagePath: b.coverImage || '',
          progress: bookmark?.progress ?? 0,
          lastBookOpen: b.lastBookOpen || 0,
          lastBookmarkModified: bookmark?.lastBookmarkModified || 0
        };
      });

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

    // Two-phase prioritized sync. Phase 1 downloads reading position +
    // manual bookmarks for currently-reading books first — the payload the
    // reader needs before starting to read — and flips read-ready. Phase 2
    // runs immediately after: the deferred upload for those books, then the
    // full download/upload for everything. Download-before-upload is
    // preserved within each step, so deferring the upload can only leave
    // other devices briefly stale, never clobber local progress (LWW and
    // union merges guard every write).
    const readReadyTypes = READ_READY_DATA_TYPES.filter((t) => dataTypes.includes(t));
    const { priority, deferred } = splitSyncContexts(contexts);
    const usePriorityPhases =
      readReadyTypes.length > 0 && priority.length > 0 && deferred.length > 0;

    if (usePriorityPhases) {
      beginPriorityPhase(priority.map((c) => c.title));
      updateSyncActivity(runId, {
        label: `${buildSyncLabel('Downloading', readReadyTypes)} — ${friendlyTarget}`
      });
      const priorityDownError = await replicateData(
        targetHandler,
        localStorageHandler,
        false,
        priority,
        readReadyTypes,
        undefined,
        true,
        { onBookComplete: markPriorityBookComplete }
      );
      if (priorityDownError) {
        // Never leave a ready badge standing on a failed sync.
        resetReadReady();
        endSyncActivity(runId);
        return finish(priorityDownError);
      }
      markPriorityReady();
      pushTransientNotice('Reading state synced — finishing remaining sync');

      // Deferred upload for priority books: local edits queued during phase
      // 1 ride along here, bounding cloud staleness to seconds.
      updateSyncActivity(runId, {
        label: `${buildSyncLabel('Uploading', readReadyTypes)} — ${friendlyTarget}`
      });
      const priorityUpError = await replicateData(
        localStorageHandler,
        targetHandler,
        false,
        priority,
        readReadyTypes,
        undefined,
        true
      );
      if (priorityUpError) {
        // The download succeeded but the sync as a whole failed: clear the
        // badge rather than claim "synced" while the cloud goes stale.
        resetReadReady();
        endSyncActivity(runId);
        return finish(priorityUpError);
      }
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
