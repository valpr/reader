/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import { BaseStorageHandler, FilePrefix } from '$lib/data/storage/handler/base-handler';
import { storage } from '$lib/data/window/navigator/storage';
import { StorageDataType, StorageKey } from '$lib/data/storage/storage-types';
import { database, lastSyncTimestamp$, requestPersistentStorage$ } from '$lib/data/store';
import loadEpub from '$lib/functions/file-loaders/epub/load-epub';
import loadHtmlz from '$lib/functions/file-loaders/htmlz/load-htmlz';
import loadTxt from '$lib/functions/file-loaders/txt/load-txt';
import type { LoadData } from '$lib/functions/file-loaders/types';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import { ensureDeviceIdentity } from '$lib/functions/replication/device-identity';
import { syncStatisticContributions } from '$lib/functions/replication/contribution-sync';
import {
  recordUserBookmarksSyncState,
  trySkipUserBookmarksSync
} from '$lib/functions/replication/bookmarks-sync-state';
import { throwIfAborted } from '$lib/functions/replication/replication-error';
import {
  beginSyncActivity,
  buildSyncLabel,
  endSyncActivity,
  replicationProgress$,
  syncActivity$,
  syncVerbForHandlers,
  updateSyncActivity,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import pLimit from 'p-limit';

export const exporterVersion = 1;

const globalReplicationQueue = pLimit(1);

/**
 * Cross-tab sync serialization (M3): same-origin tabs take turns through
 * `navigator.locks` where available, with the in-context queue as fallback.
 * The lock name is origin-scoped by the platform. `locks` is injectable for
 * tests; pass `undefined` explicitly to exercise the fallback.
 */
export function runSerialized<T>(
  task: () => Promise<T>,
  locks?: Navigator['locks'] | undefined | null
): Promise<T> {
  const available = locks === undefined ? getNavigatorLocks() : locks;
  if (available) {
    return available.request('ttu-reader-sync', { mode: 'exclusive' }, () =>
      globalReplicationQueue(task)
    );
  }
  return globalReplicationQueue(task);
}

function getNavigatorLocks(): Navigator['locks'] | undefined {
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks;
    }
  } catch {
    // Non-DOM runtimes fall through to the in-context queue.
  }
  return undefined;
}

export async function importData(
  document: Document,
  targetHandler: BaseStorageHandler,
  files: File[],
  cancelSignal: AbortSignal,
  fileCountData?: Record<string, number>
) {
  return runSerialized(async () => {
    const dataIds: number[] = [];
    const tasks: Promise<void>[] = [];
    const lastBookModified = new Date().getTime();
    const progressBase = 3; // load -> save -> cover;
    const maxProgress = progressBase * files.length;
    const limiter = pLimit(1);

    let errorMessage = '';
    const parentActivity = syncActivity$.getValue();
    const isChild = parentActivity.active;
    const childRunId = parentActivity.runId;
    const runId = isChild
      ? childRunId
      : beginSyncActivity(
          files.length === 1
            ? `Importing \u201C${files[0]?.name ?? ''}\u201D`
            : `Importing ${files.length} books`,
          undefined,
          files.length
        );
    let importedCount = 0;

    replicationProgress$.next({ progressBase, maxProgress });

    await persistStorage(targetHandler.storageType);

    if (targetHandler.isCacheDisabled()) {
      targetHandler.clearData(false);
    }

    let newFileData = 0;

    files.forEach((file) =>
      tasks.push(
        limiter(async () => {
          let currentTitle = file.name;
          updateSyncActivity(runId, {
            label:
              files.length === 1
                ? `Importing \u201C${currentTitle}\u201D`
                : `Importing \u201C${currentTitle}\u201D (${Math.min(importedCount + 1, files.length)}/${files.length})`,
            completed: importedCount,
            total: files.length
          });

          if (fileCountData && Object.prototype.hasOwnProperty.call(fileCountData, currentTitle)) {
            checkCancelAndProgress(cancelSignal, true, true);
            checkCancelAndProgress(cancelSignal, true, true);
            checkCancelAndProgress(cancelSignal, true, true);

            return;
          }

          try {
            throwIfAborted(cancelSignal);

            let bookContent: LoadData;

            if (file.name.endsWith('.epub')) {
              bookContent = await loadEpub(file, document, lastBookModified);
            } else if (file.name.endsWith('.txt')) {
              bookContent = await loadTxt(file, lastBookModified);
            } else {
              bookContent = await loadHtmlz(file, document, lastBookModified);
            }

            if (fileCountData) {
              fileCountData[currentTitle] = bookContent.characters;
              checkCancelAndProgress(cancelSignal, true, true);
              checkCancelAndProgress(cancelSignal, true, true);
              checkCancelAndProgress(cancelSignal, true, true);

              newFileData += 1;

              return;
            }

            checkCancelAndProgress(cancelSignal, true, true);

            currentTitle = bookContent.title;

            const context: ReplicationContext = {
              title: bookContent.title,
              imagePath: bookContent.coverImage || ''
            };

            dataIds.push(await targetHandler.saveBook(bookContent, false, undefined, context));

            checkCancelAndProgress(cancelSignal, false);

            if (bookContent.coverImage) {
              await targetHandler.saveCover(bookContent.coverImage, context);
            }

            database.dataListChanged$.next(targetHandler);

            checkCancelAndProgress(cancelSignal, true, !bookContent.coverImage);
          } catch (error: any) {
            errorMessage = handleErrorDuringReplication(
              error,
              `Error importing ${currentTitle}: `,
              [limiter]
            );
          } finally {
            importedCount += 1;
          }
        })
      )
    );

    await Promise.all(tasks).catch(() => {});

    if (fileCountData && newFileData) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(
        new Blob([JSON.stringify(fileCountData)], { type: 'application/json' })
      );
      a.rel = 'noopener';
      a.download = 'characters';

      setTimeout(() => {
        URL.revokeObjectURL(a.href);
      }, 1e4);

      setTimeout(() => {
        a.click();
      });
    }

    if (!isChild) endSyncActivity(runId);

    return errorMessage;
  });
}

export async function importBackup(
  sourceHandler: BackupStorageHandler,
  targetHandler: BaseStorageHandler,
  file: File,
  cancelSignal: AbortSignal
) {
  return replicateData(
    sourceHandler,
    targetHandler,
    true,
    await sourceHandler.setBackupZip(file),
    [
      StorageDataType.DATA,
      StorageDataType.PROGRESS,
      StorageDataType.STATISTICS,
      StorageDataType.READING_GOALS,
      StorageDataType.PROFILES,
      StorageDataType.BOOK_TAGS,
      StorageDataType.AUDIOBOOK,
      StorageDataType.SUBTITLE,
      StorageDataType.USER_BOOKMARKS
    ],
    cancelSignal
  );
}

export async function replicateData(
  sourceHandler: BaseStorageHandler,
  targetHandler: BaseStorageHandler,
  refreshDataList: boolean,
  contexts: ReplicationContext[],
  dataToReplicate: StorageDataType[],
  cancelSignal?: AbortSignal,
  skipTimestamp = false
) {
  return runSerialized(async () => {
    const parentActivity = syncActivity$.getValue();
    const isChild = parentActivity.active;
    const childRunId = parentActivity.runId;
    const verb = syncVerbForHandlers(sourceHandler?.storageType, targetHandler?.storageType);
    const totalContexts = contexts.length;
    const runId = isChild
      ? childRunId
      : beginSyncActivity(
          buildSyncLabel(
            verb,
            dataToReplicate,
            totalContexts === 1 ? contexts[0]?.title : undefined
          ),
          undefined,
          totalContexts || undefined
        );
    const nonBookOperations = [
      StorageDataType.READING_GOALS,
      StorageDataType.PROFILES,
      StorageDataType.BOOK_TAGS
    ];
    const bookOperationsLength = dataToReplicate.filter(
      (entry) => !nonBookOperations.includes(entry)
    ).length;
    const otherOperationsLength = dataToReplicate.length - bookOperationsLength;
    // recent check -> source retrieval -> target storage per data type + retrieve and store cover
    const progressBaseForBookOperations = bookOperationsLength ? bookOperationsLength * 4 + 2 : 0;
    const progressBaseForOtherOperations = otherOperationsLength * 4;
    const maxProgress =
      progressBaseForBookOperations * contexts.length + progressBaseForOtherOperations;
    const processBookData = dataToReplicate.includes(StorageDataType.DATA);
    const processProgressData = dataToReplicate.includes(StorageDataType.PROGRESS);
    const processStatistics = dataToReplicate.includes(StorageDataType.STATISTICS);
    const processReadingGoals = dataToReplicate.includes(StorageDataType.READING_GOALS);
    const processProfiles = dataToReplicate.includes(StorageDataType.PROFILES);
    const processBookTags = dataToReplicate.includes(StorageDataType.BOOK_TAGS);
    const processAudioBook = dataToReplicate.includes(StorageDataType.AUDIOBOOK);
    const processSubtitleData = dataToReplicate.includes(StorageDataType.SUBTITLE);
    const processUserBookmarks = dataToReplicate.includes(StorageDataType.USER_BOOKMARKS);
    const replicationLimiter = pLimit(1);
    const replicationTasks: Promise<void>[] = [];

    let anyBookmarksChanged = false;
    let anyUserBookmarksChanged = false;
    let errorMessage = '';
    let processed = 0;
    // Statistics v2 contribution files are global (per device/year), not per
    // book: the migrate → pull+fold → publish sequence runs once per run.
    let statisticsV2Synced = false;

    replicationProgress$.next({ maxProgress });

    await persistStorage(targetHandler.storageType).catch(() => {});

    [sourceHandler, targetHandler].forEach((handler) => {
      if (handler.isCacheDisabled()) {
        handler.clearData(false);
      }
    });

    contexts.forEach((context) =>
      replicationTasks.push(
        replicationLimiter(async () => {
          try {
            throwIfAborted(cancelSignal);
            updateSyncActivity(runId, {
              label: buildSyncLabel(verb, dataToReplicate, context.title, processed, totalContexts),
              completed: processed,
              total: totalContexts || undefined
            });

            let dataProcessed = false;
            // Cover is embedded in the book file, not in progress/bookmarks/stats.
            // Gate the cover fetch+upload only on actual book-data changes.
            let bookDataChanged = false;

            if (processBookData) {
              if (
                await targetHandler.isBookPresentAndUpToDate(
                  await sourceHandler.getFilenameForRecentCheck('bookdata_', context),
                  context
                )
              ) {
                checkCancelAndProgress(cancelSignal, true, true);
                checkCancelAndProgress(cancelSignal, true, true);
              } else {
                const bookData = await sourceHandler.getBook(context);

                checkCancelAndProgress(cancelSignal);

                if (bookData) {
                  await targetHandler.saveBook(bookData, undefined, undefined, context);
                  dataProcessed = true;
                  bookDataChanged = true;
                }

                checkCancelAndProgress(cancelSignal, bookOperationsLength === 1, !bookData);
              }
            }

            if (processProgressData) {
              if (
                await targetHandler.isProgressPresentAndUpToDate(
                  await sourceHandler.getFilenameForRecentCheck('progress_', context),
                  context
                )
              ) {
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              } else {
                const progressData = await sourceHandler.getProgress(context);

                checkCancelAndProgress(cancelSignal, !dataProcessed);

                if (progressData) {
                  await targetHandler.saveProgress(progressData, context);

                  dataProcessed = true;
                }

                checkCancelAndProgress(cancelSignal, !dataProcessed, !progressData);
              }
            }

            if (processStatistics) {
              // Statistics v2: aggregate data with merge semantics. A scalar
              // timestamp may never gate the fold — always pull, reconcile,
              // and publish the per-device contribution files.
              if (!statisticsV2Synced) {
                statisticsV2Synced = true;

                checkCancelAndProgress(cancelSignal, !dataProcessed);

                const statisticsError = await replicateStatisticContributions(
                  sourceHandler,
                  targetHandler
                );

                if (statisticsError) {
                  errorMessage = handleErrorDuringReplication(
                    new Error(statisticsError),
                    'Error Processing Statistics: ',
                    [replicationLimiter],
                    progressBaseForBookOperations
                  );
                } else {
                  dataProcessed = true;
                }
              }

              checkCancelAndProgress(cancelSignal, !dataProcessed, !dataProcessed);
            }

            if (processAudioBook) {
              if (
                await targetHandler.isAudioBookPresentAndUpToDate(
                  await sourceHandler.getFilenameForRecentCheck(FilePrefix.AUDIO_BOOK, context),
                  context
                )
              ) {
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              } else {
                const audioBook = await sourceHandler.getAudioBook(context);

                checkCancelAndProgress(cancelSignal, !dataProcessed);

                if (audioBook) {
                  await targetHandler.saveAudioBook(audioBook, context);

                  dataProcessed = true;
                }

                checkCancelAndProgress(cancelSignal, !dataProcessed, !audioBook);
              }
            }

            if (processSubtitleData) {
              if (
                await targetHandler.isSubtitleDataPresentAndUpToDate(
                  await sourceHandler.getFilenameForRecentCheck(FilePrefix.SUBTITLE, context),
                  context
                )
              ) {
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              } else {
                const subtitleData = await sourceHandler.getSubtitleData(context);

                checkCancelAndProgress(cancelSignal, !dataProcessed);

                if (subtitleData) {
                  await targetHandler.saveSubtitleData(subtitleData, context);

                  dataProcessed = true;
                }

                checkCancelAndProgress(cancelSignal, !dataProcessed, !subtitleData);
              }
            }

            if (processUserBookmarks) {
              // Bookmarks are merged, not replaced (per-syncId LWW, deletions
              // are just a field on the row). A scalar freshness marker must
              // never gate this read — same-max-timestamp sets can still
              // differ, and skipping then would drop deletions under clock
              // skew. The exact-state marker below is the only safe skip:
              // remote set + local rows identical to the last merge means a
              // re-merge is a proven no-op. Any doubt falls through to the
              // full pull + merge, whose own write-skip absorbs no-op
              // uploads.
              if (await trySkipUserBookmarksSync(sourceHandler, targetHandler, context)) {
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
                checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              } else {
                const ubData = await sourceHandler.getUserBookmarks(context);

                checkCancelAndProgress(cancelSignal, !dataProcessed);

                if (ubData) {
                  await targetHandler.saveUserBookmarks(ubData, context);

                  dataProcessed = true;

                  // Record only genuine merges: File pass-through payloads
                  // are dropped unmerged by browser targets, so they must
                  // never mint a "clean" marker.
                  if (!(ubData instanceof File)) {
                    await recordUserBookmarksSyncState(sourceHandler, targetHandler, context);
                  }
                }

                checkCancelAndProgress(cancelSignal, !dataProcessed, !ubData);
              }
            }

            if (dataProcessed) {
              // Cover is embedded in the book file: only re-sync when book data
              // itself changed. Progress, bookmarks, statistics, audio, and
              // subtitle updates never alter the cover — skipping it saves the
              // largest binary payload in the sync (typically 100 KB – 2 MB).
              // A target missing its cover file (e.g. a failed cover upload on
              // an earlier run) still heals via the presence check below.
              let syncCover = bookDataChanged;

              if (!syncCover) {
                syncCover = await isCoverMissing(sourceHandler, targetHandler, context);
              }

              if (syncCover) {
                const coverData = await sourceHandler.getCover(context);

                checkCancelAndProgress(cancelSignal, !coverData);

                await targetHandler.saveCover(coverData, context);

                checkCancelAndProgress(cancelSignal);
              } else {
                checkCancelAndProgress(cancelSignal, true, true);
                checkCancelAndProgress(cancelSignal, true, true);
              }

              if (refreshDataList) {
                database.dataListChanged$.next(targetHandler);
              }

              if (targetHandler.storageType === StorageKey.BROWSER && processProgressData) {
                anyBookmarksChanged = true;
              }

              if (targetHandler.storageType === StorageKey.BROWSER && processUserBookmarks) {
                anyUserBookmarksChanged = true;
              }
            } else {
              checkCancelAndProgress(cancelSignal, true, true);
              checkCancelAndProgress(cancelSignal, true, true);
            }

            processed += 1;
          } catch (error: any) {
            errorMessage = handleErrorDuringReplication(
              error,
              `Error Processing ${context.title}: `,
              [replicationLimiter],
              progressBaseForBookOperations
            );
          }
        })
      )
    );

    if (processReadingGoals) {
      replicationTasks.push(
        replicationLimiter(async () => {
          try {
            if (
              await targetHandler.areReadingGoalsPresentAndUpToDate(
                await sourceHandler.getFilenameForRecentCheck(
                  BaseStorageHandler.readingGoalsFilePrefix
                )
              )
            ) {
              checkCancelAndProgress(cancelSignal, false, true);
              checkCancelAndProgress(cancelSignal, false, true);
            } else {
              const { readingGoals, lastGoalModified } = await sourceHandler.getReadingGoals();

              checkCancelAndProgress(cancelSignal);

              if (readingGoals) {
                await targetHandler.saveReadingGoals(readingGoals, lastGoalModified);
              }

              checkCancelAndProgress(cancelSignal, false, !readingGoals);
            }

            processed += 1;
          } catch (error) {
            errorMessage = handleErrorDuringReplication(
              error,
              `Error Processing Reading Goals: `,
              [replicationLimiter],
              progressBaseForOtherOperations
            );
          }
        })
      );
    }

    if (processProfiles) {
      replicationTasks.push(
        replicationLimiter(async () => {
          try {
            // Deliberately no filename gate here (unlike goals/tags above):
            // the profiles filename derives from lastProfilesModified only,
            // but the payload also carries customThemes and
            // statisticsSettings, whose edits never bump that timestamp
            // (theme save/delete, settings toggles). Gating on the filename
            // would suppress those publishes indefinitely, so profiles
            // always pull + merge — it is one small file either way.
            const { profiles, customThemes, statisticsSettings, lastProfilesModified } =
              await sourceHandler.getProfiles();

            checkCancelAndProgress(cancelSignal);

            if (profiles) {
              await targetHandler.saveProfiles(
                profiles,
                lastProfilesModified,
                customThemes,
                statisticsSettings
              );
            }

            checkCancelAndProgress(cancelSignal, false, !profiles);

            processed += 1;
          } catch (error) {
            errorMessage = handleErrorDuringReplication(
              error,
              `Error Processing Reader Profiles: `,
              [replicationLimiter],
              progressBaseForOtherOperations
            );
          }
        })
      );
    }

    if (processBookTags) {
      replicationTasks.push(
        replicationLimiter(async () => {
          try {
            if (
              await targetHandler.areBookTagsPresentAndUpToDate(
                await sourceHandler.getFilenameForRecentCheck(BaseStorageHandler.bookTagsFilePrefix)
              )
            ) {
              checkCancelAndProgress(cancelSignal, false, true);
              checkCancelAndProgress(cancelSignal, false, true);
            } else {
              const { tags, titles, lastTagsModified, entries } = await sourceHandler.getBookTags();

              checkCancelAndProgress(cancelSignal);

              if (tags) {
                await targetHandler.saveBookTags(tags, titles, lastTagsModified, entries);
              }

              checkCancelAndProgress(cancelSignal, false, !tags);
            }

            processed += 1;
          } catch (error) {
            errorMessage = handleErrorDuringReplication(
              error,
              `Error Processing Book Tags: `,
              [replicationLimiter],
              progressBaseForOtherOperations
            );
          }
        })
      );
    }

    await Promise.all(replicationTasks).catch(() => {});

    if (anyBookmarksChanged) {
      database.bookmarksChanged$.next();
    }

    if (anyUserBookmarksChanged) {
      database.userBookmarksChanged$.next();
    }

    if (targetHandler instanceof BackupStorageHandler) {
      await targetHandler
        .createExportZip(document, cancelSignal?.aborted || !processed)
        .catch((error) => {
          errorMessage = error.message;
        });
    }

    if (
      !skipTimestamp &&
      !errorMessage &&
      !cancelSignal?.aborted &&
      !(targetHandler instanceof BackupStorageHandler) &&
      !(sourceHandler instanceof BackupStorageHandler)
    ) {
      lastSyncTimestamp$.next(Date.now());
    }

    if (!isChild) endSyncActivity(runId);

    return errorMessage;
  });
}

async function persistStorage(target: StorageKey) {
  if (target === StorageKey.BROWSER && requestPersistentStorage$.getValue()) {
    try {
      await storage.persist();
    } catch (_) {
      // no-op
    }
  }
}

function checkCancelAndProgress(
  cancelSignal: AbortSignal | undefined,
  allowCancel = true,
  addDefaultProgress = false
) {
  if (allowCancel) {
    throwIfAborted(cancelSignal);
  }

  if (addDefaultProgress) {
    BaseStorageHandler.reportProgress();
  }

  BaseStorageHandler.completeStep();
}

/**
 * Cover healing check for the book-data gate above: when the book payload
 * itself is in sync, the cover can only be missing, never stale (covers are
 * write-once), so presence — not content — decides. Backup import/export
 * always copies everything; the browser side keeps no cover files, so the
 * local card art traveling on the context is the presence signal there;
 * cloud/filesystem targets get a metadata-only filename lookup (served from
 * the warmed cache, no download). Never throws: doubt means "sync it".
 */
async function isCoverMissing(
  sourceHandler: BaseStorageHandler,
  targetHandler: BaseStorageHandler,
  context: ReplicationContext
): Promise<boolean> {
  try {
    if (
      sourceHandler instanceof BackupStorageHandler ||
      targetHandler instanceof BackupStorageHandler
    ) {
      return true;
    }

    if (targetHandler.storageType === StorageKey.BROWSER) {
      return !context.imagePath;
    }

    return (await targetHandler.getFilenameForRecentCheck('cover_', context)) === undefined;
  } catch {
    return true;
  }
}

/**
 * Statistics v2 contribution sync for a replication run. The non-browser
 * side (cloud, filesystem, or backup) is the contribution remote; browser
 * to browser never carries statistics.
 */
async function replicateStatisticContributions(
  sourceHandler: BaseStorageHandler,
  targetHandler: BaseStorageHandler
): Promise<string> {
  const remote = sourceHandler.storageType === StorageKey.BROWSER ? targetHandler : sourceHandler;

  if (remote.storageType === StorageKey.BROWSER) {
    return '';
  }

  try {
    const identity = await ensureDeviceIdentity(database);
    return await syncStatisticContributions(database, remote, identity.deviceId);
  } catch (error: any) {
    return error?.message || 'Statistics sync failed';
  }
}
