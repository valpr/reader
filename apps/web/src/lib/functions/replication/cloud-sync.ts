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
import type { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';

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
  let runId = 0;
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
    runId = beginSyncActivity(`${buildSyncLabel('Syncing', dataTypes)} — ${friendlyTarget}`);

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

    // Deletion-state census for diagnostics: best-effort, never fails sync.
    deletionCounts = await database.getDeletionCounts().catch(() => undefined);

    markLastSync(sourceName);
    clearPendingCloudSync(sourceName);

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

    endSyncActivity(runId);

    // Explicit user action only: triggerCloudSync is called from the
    // reconnect flow and the manual Sync button, never from background
    // autosave sync. Announce completion directly from the promise so
    // silent background check-ins can never toast before sync has actually
    // finished and UI spinners have cleared.
    pushTransientNotice(`Sync complete (${getFriendlyStorageSourceName(sourceName)})`);

    return finish();
  } catch (err: any) {
    if (runId) endSyncActivity(runId);
    const message = err?.message || 'Unknown sync error';
    logger.error(`Cloud sync retry failed for ${sourceName}: ${message}`);
    return finish(message);
  }
}

/**
 * Total error normalizer for sync legs: any rejection is a failure, so this
 * never returns a falsy value. A bare `err.message` mapping turns thrown
 * strings (and message-less rejections) into `undefined` — false success.
 */
export function asSyncErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err || 'Unknown sync error';
  const message = (err as { message?: unknown } | null | undefined)?.message;
  if (typeof message === 'string' && message) return message;
  return 'Unknown sync error';
}

/**
 * Read-state types for the open book, honoring the primary vs secondary
 * scope: secondary clouds only ever see book-scoped payloads. Both
 * `READ_READY_DATA_TYPES` happen to be book-scoped today; the filter keeps
 * that invariant explicit if the set ever grows.
 */
export function openBookReadStateTypes(isPrimary: boolean): StorageDataType[] {
  return READ_READY_DATA_TYPES.filter((t) => isPrimary || BOOK_SCOPED_DATA_TYPES.includes(t));
}

export interface OpenBookReadStateParams {
  localHandler: BaseStorageHandler;
  externalHandler: BaseStorageHandler;
  context: ReplicationContext;
  /**
   * Candidate types (the caller applies the primary vs secondary scope via
   * `openBookReadStateTypes`); only read-state types are ever downloaded.
   */
  dataTypes: StorageDataType[];
  /**
   * Runs after the download lands locally. Lets the reader re-resolve its
   * resume position and offer a jump without ever auto-navigating.
   */
  onDownloaded?: () => Promise<void> | void;
}

/**
 * Phase-1 download only for the open book: pulls reading position + manual
 * bookmarks so the reader can offer a jump before the full library sync
 * runs. Uploads ride along with the full sync moments later. Returns an
 * error message (undefined on success); failures stay silent by design and
 * the full sync retries and reports them through its own flows.
 *
 * No redownload on the follow-up pass: this runs through the same
 * `replicateData` path, so the full sync's repeat over this book degrades
 * to metadata checks — the progress up-to-date gate and the user-bookmarks
 * exact-state marker recorded here skip both bodies.
 */
export async function downloadOpenBookReadState({
  localHandler,
  externalHandler,
  context,
  dataTypes,
  onDownloaded
}: OpenBookReadStateParams): Promise<string | undefined> {
  const readStateTypes = dataTypes.filter((t) => READ_READY_DATA_TYPES.includes(t));
  if (!readStateTypes.length) return undefined;

  const downError = await replicateData(
    externalHandler,
    localHandler,
    false,
    [context],
    readStateTypes
  ).catch(asSyncErrorMessage);
  if (downError) return downError;

  try {
    await onDownloaded?.();
  } catch {
    // Best-effort UI refresh: never fail the sync when the reader
    // re-reads its local position.
  }

  return undefined;
}

export interface SingleBookTwoPhaseParams {
  localHandler: BaseStorageHandler;
  externalHandler: BaseStorageHandler;
  context: ReplicationContext;
  /**
   * Already-scoped data types (the caller applies the primary vs secondary
   * `BOOK_SCOPED_DATA_TYPES` filter) — used as-is so scoping has a single
   * source of truth.
   */
  dataTypes: StorageDataType[];
  refreshDataList: boolean;
  /**
   * Runs after the Phase-1 download (read-state) lands locally, before the
   * Phase-1 upload. Lets the reader re-resolve its resume position and offer
   * a jump without ever auto-navigating.
   */
  onPhase1Downloaded?: () => Promise<void> | void;
}

/**
 * Two-stage sync for the single open book (reader explicit sync).
 *
 * Phase 1 downloads then uploads reading position + manual bookmarks
 * (`READ_READY_DATA_TYPES`) — the small payload the reader needs first —
 * then Phase 2 downloads then uploads everything else queued. Download
 * always precedes upload within each phase so the local copy converges
 * before publishing; callers flush pending autosaves first so the upload
 * publishes the live position rather than stale DB state (LWW guards the
 * download leg on last-write-wins types, union merges guard the rest).
 * Returns an error message (undefined on success).
 */
export async function replicateSingleBookTwoPhase({
  localHandler,
  externalHandler,
  context,
  dataTypes,
  refreshDataList,
  onPhase1Downloaded
}: SingleBookTwoPhaseParams): Promise<string | undefined> {
  const effectiveTypes = [...dataTypes];
  if (!effectiveTypes.length) return undefined;

  const phase1Types = effectiveTypes.filter((t) => READ_READY_DATA_TYPES.includes(t));
  const restTypes = effectiveTypes.filter((t) => !READ_READY_DATA_TYPES.includes(t));
  const contexts = [context];
  const asError = asSyncErrorMessage;

  if (phase1Types.length) {
    const downError = await replicateData(
      externalHandler,
      localHandler,
      false,
      contexts,
      phase1Types
    ).catch(asError);
    if (downError) return downError;

    try {
      await onPhase1Downloaded?.();
    } catch {
      // Best-effort UI refresh: never fail the sync when the reader
      // re-reads its local position.
    }

    const upError = await replicateData(
      localHandler,
      externalHandler,
      refreshDataList,
      contexts,
      phase1Types
    ).catch(asError);
    if (upError) return upError;
  }

  if (restTypes.length) {
    const downError = await replicateData(
      externalHandler,
      localHandler,
      false,
      contexts,
      restTypes
    ).catch(asError);
    if (downError) return downError;

    const upError = await replicateData(
      localHandler,
      externalHandler,
      refreshDataList,
      contexts,
      restTypes
    ).catch(asError);
    if (upError) return upError;
  }

  return undefined;
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
  let runId = 0;
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
    runId = beginSyncActivity(
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
    if (contributionsError) {
      endSyncActivity(runId);
      return finish(contributionsError);
    }

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

    endSyncActivity(runId);
    return finish();
  } catch (err: any) {
    if (runId) endSyncActivity(runId);
    const message = err?.message || 'Unknown sync error';
    logger.error(`One-shot recovery failed for ${sourceName}: ${message}`);
    return finish(message);
  }
}
