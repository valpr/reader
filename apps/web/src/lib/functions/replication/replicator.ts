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
import { throwIfAborted } from '$lib/functions/replication/replication-error';
import {
  replicationProgress$,
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

            let dataProcessed = false;

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
              // are just a field on the row) — same reasoning as statistics
              // v2 above. A scalar freshness marker must never gate this
              // read: skipping the fetch because *some* row on the source
              // looks older is exactly how a deletion fails to propagate to
              // a device that has a newer, unrelated edit. Always pull,
              // merge, and let saveUserBookmarks's own write-skip (not a
              // pre-fetch read-skip) absorb the no-op case.
              const ubData = await sourceHandler.getUserBookmarks(context);

              checkCancelAndProgress(cancelSignal, !dataProcessed);

              if (ubData) {
                await targetHandler.saveUserBookmarks(ubData, context);

                dataProcessed = true;
              }

              checkCancelAndProgress(cancelSignal, !dataProcessed, !ubData);
            }

            if (dataProcessed) {
              const coverData = await sourceHandler.getCover(context);

              checkCancelAndProgress(cancelSignal, !coverData);

              await targetHandler.saveCover(coverData, context);

              checkCancelAndProgress(cancelSignal);

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
            const { readingGoals, lastGoalModified } = await sourceHandler.getReadingGoals();

            checkCancelAndProgress(cancelSignal);

            if (readingGoals) {
              await targetHandler.saveReadingGoals(readingGoals, lastGoalModified);
            }

            checkCancelAndProgress(cancelSignal, false, !readingGoals);

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
            const { tags, titles, lastTagsModified, entries } = await sourceHandler.getBookTags();

            checkCancelAndProgress(cancelSignal);

            if (tags) {
              await targetHandler.saveBookTags(tags, titles, lastTagsModified, entries);
            }

            checkCancelAndProgress(cancelSignal, false, !tags);

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
