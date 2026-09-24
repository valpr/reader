/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type {
  BooksDbAudioBook,
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbDeviceIdentity,
  BooksDbReadingGoal,
  BooksDbRemoteStatisticContribution,
  BooksDbStatistic,
  BooksDbStatisticContribution,
  BooksDbStatisticSyncState,
  BooksDbStorageSource,
  BooksDbSubtitleData,
  BooksDbUserBookmarkData,
  BookmarkColor
} from '$lib/data/database/books-db/versions/books-db';
import {
  getAllTagsFromDict,
  normalizeTagList,
  normalizeTagTitle,
  type BookTagsDict
} from '$lib/data/book-tags';
import { Observable, Subject, from } from 'rxjs';
import { StorageDataType, StorageKey } from '$lib/data/storage/storage-types';
import {
  advanceDateDays,
  getDate,
  getDateKey,
  mergeStatistics,
  updateStatisticToStore
} from '$lib/functions/statistic-util';
import {
  LEGACY_BASELINE_DEVICE_PREFIX,
  LEGACY_MIGRATION_STATE_ID,
  foldStatisticContributions,
  getYearFromDateKey,
  groupContributionsByYear,
  type StatisticContributionFile
} from '$lib/functions/statistic-v2';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import {
  getCurrentReadingGoal,
  mergeReadingGoals,
  readingGoalSortFunction
} from '$lib/data/reading-goal';
import {
  lastBookTagsModified$,
  lastReadingGoalsModified$,
  readingGoal$,
  syncTarget$
} from '$lib/data/store';
import { adoptConvergentSyncId, isSameBookmark } from '$lib/data/user-bookmarks-merge';
import { computeBookmarkSyncId, isLiveUserBookmark } from '$lib/data/user-bookmark-ids';

import type { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type { BookStatistic } from '$lib/components/statistics/statistics-types';
import type BooksDb from '$lib/data/database/books-db/versions/books-db';
import type { IDBPDatabase, StoreNames } from 'idb';
import LogReportDialog from '$lib/components/log-report-dialog.svelte';
import { MergeMode } from '$lib/data/merge-mode';
import MessageDialog from '$lib/components/message-dialog.svelte';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { dialogManager } from '$lib/data/dialog-manager';
import { getDefaultStatistic } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import { iffBrowser } from '$lib/functions/rxjs/iff-browser';
import { logger } from '$lib/data/logger';
import pLimit from 'p-limit';
import { replicationProgress$ } from '$lib/functions/replication/replication-progress';
import { setStorageSourceDefault } from '$lib/data/storage/storage-source-manager';
import { storageSource$ } from '$lib/data/storage/storage-view';
import { throwIfAborted } from '$lib/functions/replication/replication-error';

const LAST_ITEM_KEY = 0;

function sumHourlyArrays(
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

function sumProfileTimes(
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

type RemoteContributionStore = {
  // Loose structural typing so idb's per-store typed wrappers assign cleanly.
  index(name: string): {
    getAllKeys(query?: any, count?: number): Promise<any[]>;
  };

  delete(key: any): Promise<void>;
};

async function deleteRemoteRowsForBook(
  store: RemoteContributionStore,
  title: string
): Promise<void> {
  const keys = await store.index('byBook').getAllKeys(IDBKeyRange.bound([title], [title, []]));
  for (const key of keys) {
    await store.delete(key);
  }
}

async function deleteRemoteRowsForDay(
  store: RemoteContributionStore,
  title: string,
  dateKey: string
): Promise<void> {
  const keys = await store
    .index('byBook')
    .getAllKeys(IDBKeyRange.bound([title, dateKey], [title, dateKey, []]));
  for (const key of keys) {
    await store.delete(key);
  }
}

export class DatabaseService {
  private db$: Observable<Awaited<typeof this.db>>;

  isReady$: Observable<boolean>;

  listLoading$ = new Subject<boolean>();

  dataListChanged$ = new Subject<BaseStorageHandler | undefined>();

  lastHandler: BaseStorageHandler | undefined;

  dataList$ = iffBrowser(() =>
    this.dataListChanged$.pipe(
      startWith(undefined),
      tap((handler) => {
        this.lastHandler = handler;
      }),
      switchMap(() => storageSource$),
      switchMap((storageSource) =>
        from(
          Promise.resolve(this.lastHandler || getStorageHandler(window, storageSource, '')).then(
            (handler) => {
              logger.clearHistory();

              return handler.getBookList();
            }
          )
        ).pipe(
          catchError((error: unknown) => {
            if (error instanceof Error) {
              const showReport = logger.errorCount > 1;

              logger.warn(error.message);

              dialogManager.dialogs$.next([
                {
                  component: showReport ? LogReportDialog : MessageDialog,
                  props: {
                    title: 'Failure',
                    message: showReport ? 'Error(s) occurred' : `An Error occured: ${error.message}`
                  }
                }
              ]);
            }

            if (storageSource !== StorageKey.BROWSER) {
              this.lastHandler = undefined;
              storageSource$.next(StorageKey.BROWSER);
            }

            return [[]];
          })
        )
      ),
      tap(() => {
        this.lastHandler = undefined;
        this.listLoading$.next(false);
      }),
      shareReplay({ refCount: true, bufferSize: 1 })
    )
  );

  bookmarksChanged$ = new Subject<void>();

  bookmarks$ = this.bookmarksChanged$.pipe(
    startWith(0),
    switchMap(() => this.db$),
    switchMap((db) => db.getAll('bookmark')),
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  userBookmarksChanged$ = new Subject<void>();

  lastItemChanged$ = new Subject<void>();

  lastItem$ = this.lastItemChanged$.pipe(
    startWith(0),
    switchMap(() => this.db$),
    switchMap((db) => db.get('lastItem', LAST_ITEM_KEY)),
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  storageSourcesChanged$ = new Subject<BooksDbStorageSource[]>();

  constructor(public db: Promise<IDBPDatabase<BooksDb>>) {
    this.db$ = from(db).pipe(shareReplay({ refCount: true, bufferSize: 1 }));
    this.isReady$ = this.db$.pipe(map((x) => !!x));
  }

  async getLastModifiedForType(title: string, dataType: string) {
    if (!title || !dataType) {
      return 0;
    }
    const db = await this.db;
    const result = await db.get('lastModified', [title, dataType]);

    return result?.lastModifiedValue || 0;
  }

  async getDeviceIdentity(): Promise<BooksDbDeviceIdentity | undefined> {
    const db = await this.db;
    return db.get('deviceIdentity', 0);
  }

  async putDeviceIdentity(identity: BooksDbDeviceIdentity): Promise<void> {
    const db = await this.db;
    await db.put('deviceIdentity', identity);
  }

  async getData(dataId: number) {
    if (typeof dataId === 'number' && !Number.isNaN(dataId)) {
      const db = await this.db;
      return db.get('data', dataId);
    }
    return undefined;
  }

  async getDataByTitle(title: string) {
    if (title) {
      const db = await this.db;
      return db.getFromIndex('data', 'title', title);
    }

    return undefined;
  }

  async setFirstBookRead(
    bookTitle: string,
    startDaysHoursForTracker: number,
    existingStatistic?: BooksDbStatistic
  ) {
    if (!bookTitle) {
      return ['', false];
    }
    const db = await this.db;

    let firstStatistic = existingStatistic;

    if (!firstStatistic) {
      firstStatistic = await db.get('statistic', IDBKeyRange.bound([bookTitle], [bookTitle, []]));
    }

    if (firstStatistic) {
      return [firstStatistic.dateKey, false];
    }

    const dateKey = getDateKey(startDaysHoursForTracker);
    const tx = db.transaction(
      ['statistic', 'statisticContribution', 'lastModified', 'deviceIdentity'],
      'readwrite'
    );

    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const newStatistic = getDefaultStatistic(bookTitle, dateKey);
      newStatistic.lastStatisticModified = 0;

      await statisticsStore.put(newStatistic);
      // Zero-reading placeholder contribution so later refolds keep the
      // first-read row. Unpublishable (no reading) until real tracking lands.
      const identity = await tx.objectStore('deviceIdentity').get(0);
      if (identity?.deviceId) {
        await tx.objectStore('statisticContribution').put({
          ...newStatistic,
          deviceId: identity.deviceId,
          year: getYearFromDateKey(dateKey),
          revision: 0
        } as BooksDbStatisticContribution);
      }
      await lastModifiedStore.put({
        title: bookTitle,
        dataType: StorageDataType.STATISTICS,
        lastModifiedValue: 0
      });

      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }

    return [dateKey, true];
  }

  async getDataList(): Promise<BooksDbBookData[]> {
    const db = await this.db;
    return db.getAll('data');
  }

  async upsertData(
    data: Omit<BooksDbBookData, 'id'>,
    saveBehavior: ReplicationSaveBehavior,
    skipTimestampFallback = true,
    removeStorageContext = true
  ) {
    const db = await this.db;

    let dataId: number;
    let bookData: BooksDbBookData;

    const tx = db.transaction('data', 'readwrite');
    const { store } = tx;
    const oldData = await store.index('title').get(data.title);

    if (oldData) {
      if (removeStorageContext) {
        oldData.storageSource = undefined;
      }

      if (
        saveBehavior === ReplicationSaveBehavior.NewOnly &&
        oldData.lastBookModified &&
        data.lastBookModified &&
        oldData.lastBookModified >= data.lastBookModified
      ) {
        bookData = oldData;
      } else {
        bookData = {
          ...data,
          id: oldData.id,
          ...(skipTimestampFallback
            ? { lastBookModified: data.lastBookModified, lastBookOpen: data.lastBookOpen }
            : {
                lastBookModified: data.lastBookModified || oldData.lastBookModified,
                lastBookOpen: data.lastBookOpen || oldData.lastBookOpen
              }),
          ...(removeStorageContext ? { storageSource: undefined } : {})
        };
        await store.put(bookData);
      }
    } else {
      // Until https://github.com/jakearchibald/idb/issues/150 resolves
      const { id: _ignored, ...bookDataWithoutKey } = data as any;
      dataId = await store.add(bookDataWithoutKey as BooksDbBookData);
      bookData = { ...data, id: dataId };
    }
    await tx.done;

    return bookData;
  }

  async deleteData(
    dataIds: number[],
    idsToTitles: Map<number, string>,
    cancelSignal: AbortSignal,
    keepLocalStatistics: boolean
  ) {
    const db = await this.db;
    const lastItemObj = await db.get('lastItem', LAST_ITEM_KEY);
    const bookmarkIdData = await db.getAllKeys('bookmark');
    const lastItem = lastItemObj?.dataId;
    const bookmarkIds = new Set(bookmarkIdData);
    const deleted: number[] = [];
    const limiter = pLimit(1);
    const tasks: Promise<void>[] = [];

    let errorMessage = '';

    replicationProgress$.next({ progressBase: 1, maxProgress: dataIds.length });

    dataIds
      .filter((id) => typeof id === 'number' && !Number.isNaN(id))
      .forEach((id) =>
        tasks.push(
          limiter(async () => {
            try {
              throwIfAborted(cancelSignal);

              deleted.push(
                await this.deleteSingleData(
                  db,
                  id,
                  idsToTitles.get(id),
                  { lastItem, bookmarkIds },
                  !keepLocalStatistics
                )
              );
            } catch (error) {
              errorMessage = handleErrorDuringReplication(
                error,
                `Error deleting Book with id ${id}: `,
                [limiter]
              );
            }
          })
        )
      );

    await Promise.all(tasks).catch(() => {});

    return { error: errorMessage, deleted };
  }

  async getBookmark(dataId: number) {
    if (typeof dataId !== 'number' || Number.isNaN(dataId)) {
      return undefined;
    }
    const db = await this.db;
    return db.get('bookmark', dataId);
  }

  /**
   * Replace the tag list of a single book. Tags are normalized
   * (lowercase, deduped, capped). Touches `lastBookModified` and the DATA
   * sync timestamp so the change replicates, plus the book-tags dict marker.
   * Also stamps per-title tag attribution (`[title, BOOK_TAGS]` with the
   * authoring deviceId) — the publish path turns it into
   * `entries[key].{modifiedAt, deviceId}` for per-title last-write-wins, so
   * removals propagate instead of being re-added by the next union merge.
   * Callers must refresh the handler card cache (see manage page).
   */
  async updateBookTags(dataId: number, tags: string[]) {
    if (typeof dataId !== 'number' || Number.isNaN(dataId)) {
      throw new Error('Invalid book ID');
    }
    const db = await this.db;
    const book = await db.get('data', dataId);

    if (!book) {
      throw new Error('Book not found');
    }

    const normalized = normalizeTagList(tags);
    const now = Date.now();
    const identity = await db.get('deviceIdentity', 0).catch(() => undefined);

    await db.put('data', {
      ...book,
      tags: normalized,
      lastBookModified: Math.max(book.lastBookModified || 0, now)
    });
    await db.put('lastModified', {
      title: book.title,
      dataType: StorageDataType.DATA,
      lastModifiedValue: now
    });
    await db.put('lastModified', {
      title: book.title,
      dataType: StorageDataType.BOOK_TAGS,
      lastModifiedValue: now,
      deviceId: identity?.deviceId
    });

    lastBookTagsModified$.next(now);
    this.dataListChanged$.next(undefined);

    return normalized;
  }

  /**
   * Per-title tag attribution for the publish path: normalized-title key ->
   * `{ modifiedAt, deviceId }` from the `[title, BOOK_TAGS]` lastModified
   * rows written by `updateBookTags` (and by the sync apply path when a
   * remote entry wins). Titles without a row fall back to
   * `{ modifiedAt: 0, deviceId: '' }` and lose any LWW race — they carry no
   * observed edit, so they must not outrank a real timestamp.
   */
  async getTagAttribution(): Promise<Record<string, { modifiedAt: number; deviceId: string }>> {
    const db = await this.db;
    const attribution: Record<string, { modifiedAt: number; deviceId: string }> = {};
    const rows = await db.getAll('lastModified').catch(() => []);

    for (const row of rows || []) {
      if (row?.dataType !== StorageDataType.BOOK_TAGS || !row?.title) continue;
      attribution[normalizeTagTitle(row.title)] = {
        modifiedAt: row.lastModifiedValue || 0,
        deviceId: row.deviceId || ''
      };
    }

    return attribution;
  }

  /**
   * Persist a winning remote tag entry's attribution locally so the next
   * publish carries it forward. Stored under the book's actual title (not
   * the normalized key) to match `updateBookTags`' row shape.
   */
  async putTagAttribution(title: string, modifiedAt: number, deviceId: string): Promise<void> {
    if (!title) return;
    const db = await this.db;
    await db.put('lastModified', {
      title,
      dataType: StorageDataType.BOOK_TAGS,
      lastModifiedValue: modifiedAt,
      deviceId: deviceId || undefined
    });
  }

  /** Every tag used by any local book, unique and sorted. Feeds suggestions. */
  async getAllTags() {
    const db = await this.db;
    const books = await db.getAll('data');
    const dict: BookTagsDict = {};

    for (const book of books) {
      const tags = normalizeTagList(book.tags);
      if (tags.length) dict[normalizeTagTitle(book.title)] = tags;
    }

    return getAllTagsFromDict(dict);
  }

  async putBookmark(bookmarkData: BooksDbBookmarkData) {
    if (
      !bookmarkData ||
      typeof bookmarkData.dataId !== 'number' ||
      Number.isNaN(bookmarkData.dataId)
    ) {
      return;
    }
    // Stamp the authoring device when absent so position conflicts resolve
    // deterministically (P6). Incoming sync records already carry their
    // origin device and are never restamped here.
    if (!bookmarkData.deviceId) {
      const db = await this.db;
      const identity = await db.get('deviceIdentity', 0).catch(() => undefined);
      if (identity?.deviceId) {
        bookmarkData = { ...bookmarkData, deviceId: identity.deviceId };
      }
    }
    const db = await this.db;

    return db.put('bookmark', bookmarkData);
  }

  async deleteBookmark(dataId: number): Promise<void> {
    if (typeof dataId !== 'number' || Number.isNaN(dataId)) {
      return;
    }
    const db = await this.db;
    const tx = db.transaction(['bookmark', 'lastItem'], 'readwrite');
    try {
      await tx.objectStore('bookmark').delete(dataId);
      const lastItem = await tx.objectStore('lastItem').get(LAST_ITEM_KEY);
      if (lastItem?.dataId === dataId) {
        await tx.objectStore('lastItem').delete(LAST_ITEM_KEY);
        this.lastItemChanged$.next();
      }
      await tx.done;
      this.bookmarksChanged$.next();
    } catch (_) {
      // no-op
    }
  }

  /**
   * Live (non-deleted) rows for display, resume, and editor paths. The single
   * funnel for the shared deleted-filtering rule — callers never check
   * `row.deleted` themselves.
   */
  async getUserBookmarks(dataId: number): Promise<BooksDbUserBookmarkData[]> {
    if (typeof dataId !== 'number' || Number.isNaN(dataId)) {
      return [];
    }
    const db = await this.db;
    const all = await db.getAllFromIndex('userBookmark', 'dataId', dataId);
    return all.filter(isLiveUserBookmark).sort((a, b) => a.exploredCharCount - b.exploredCharCount);
  }

  /**
   * Deletion-state census for `SyncRun` diagnostics: soft-deleted bookmark
   * rows plus tagless titles that still carry tag attribution (i.e. local
   * tag removals waiting to propagate). Best-effort — diagnostics must never
   * fail a sync, so callers swallow errors.
   */
  async getDeletionCounts(): Promise<{ deletedBookmarks: number; removedTagTitles: number }> {
    const db = await this.db;
    const emptyAttribution: Record<string, { modifiedAt: number; deviceId: string }> = {};
    const [rows, books, attribution] = await Promise.all([
      db.getAll('userBookmark').catch(() => []),
      db.getAll('data').catch(() => []),
      this.getTagAttribution().catch(() => emptyAttribution)
    ]);
    const deletedBookmarks = (rows || []).filter((r) => r?.deleted).length;
    let removedTagTitles = 0;
    for (const book of books || []) {
      if (!book?.title) continue;
      if (normalizeTagList(book.tags).length) continue;
      if (attribution[normalizeTagTitle(book.title)]) removedTagTitles += 1;
    }
    return { deletedBookmarks, removedTagTitles };
  }

  /**
   * Sync-publish read: manual rows *including* soft-deleted ones (deletions
   * are ordinary rows that must travel), autosaves excluded as today.
   */
  async getUserBookmarksForSync(dataId: number): Promise<BooksDbUserBookmarkData[]> {
    if (typeof dataId !== 'number' || Number.isNaN(dataId)) {
      return [];
    }
    const db = await this.db;
    const all = await db.getAllFromIndex('userBookmark', 'dataId', dataId);
    const syncable = all.filter((b) => !b.isAutosave);
    // Opportunistic backfill: stamp missing syncIds so every published row
    // carries stable identity. Idempotent — stamped rows are skipped.
    const book = await db.get('data', dataId).catch(() => undefined);
    let changed = false;
    if (book?.title) {
      for (const row of syncable) {
        if (!row.syncId && row.id !== undefined) {
          row.syncId = await computeBookmarkSyncId(
            book.title,
            row.exploredCharCount,
            row.createdAt
          );
          await db.put('userBookmark', row);
          changed = true;
        }
      }
      if (changed) this.userBookmarksChanged$.next();
    }
    return syncable.sort((a, b) => a.exploredCharCount - b.exploredCharCount);
  }

  async putUserBookmark(data: BooksDbUserBookmarkData): Promise<number> {
    if (!data || typeof data.dataId !== 'number' || Number.isNaN(data.dataId)) {
      throw new Error('Invalid user bookmark data');
    }
    const db = await this.db;
    const book = await db.get('data', data.dataId).catch(() => undefined);
    let dataToStore: BooksDbUserBookmarkData = data;
    if (!dataToStore.isAutosave && book?.title && !dataToStore.syncId) {
      dataToStore = {
        ...dataToStore,
        syncId: await computeBookmarkSyncId(
          book.title,
          dataToStore.exploredCharCount,
          dataToStore.createdAt
        )
      };
    }
    if (dataToStore.id === undefined) {
      const { id: _ignored, ...withoutId } = dataToStore;
      dataToStore = withoutId as BooksDbUserBookmarkData;
    }
    // Defensive un-delete: a fresh write colliding with a soft-deleted row's
    // seed (same position + createdAt) revives that row instead of forking
    // a duplicate. UI recreation always mints a new createdAt, so this path
    // is rare — but deterministic when it happens.
    if (!dataToStore.isAutosave && dataToStore.syncId) {
      const siblings = await db
        .getAllFromIndex('userBookmark', 'dataId', dataToStore.dataId)
        .catch(() => []);
      const tombstoned = siblings.find((s) => s.syncId === dataToStore.syncId && s.deleted);
      if (tombstoned?.id !== undefined) {
        dataToStore = {
          ...dataToStore,
          id: tombstoned.id,
          deleted: false,
          deletedAt: undefined
        };
      }
    }
    const id = (await db.put('userBookmark', dataToStore)) as number;
    if (!data.isAutosave) {
      if (book?.title) {
        await db.put('lastModified', {
          title: book.title,
          dataType: StorageDataType.USER_BOOKMARKS,
          lastModifiedValue: data.lastModified || Date.now()
        });
      }
    }
    this.userBookmarksChanged$.next();
    return id;
  }

  async putAutosaveBookmark(data: BooksDbUserBookmarkData, maxKeep: number = 10): Promise<void> {
    if (!data || typeof data.dataId !== 'number' || Number.isNaN(data.dataId)) {
      return;
    }
    const db = await this.db;
    const tx = db.transaction('userBookmark', 'readwrite');
    const store = tx.objectStore('userBookmark');
    const index = store.index('dataId');

    const existing = await index.getAll(data.dataId);
    const autosaves = existing
      .filter((b) => b.isAutosave)
      .sort((a, b) => b.createdAt - a.createdAt);

    // If an existing autosave is within 15 characters, remove the old one so this new one replaces it
    const nearby = autosaves.find(
      (b) => Math.abs(b.exploredCharCount - data.exploredCharCount) < 15
    );
    if (nearby?.id !== undefined) {
      await store.delete(nearby.id);
    }

    const { id: _ignored, ...dataWithoutId } = data;
    await store.add({
      ...dataWithoutId,
      isAutosave: true
    });

    const remaining = autosaves.filter((b) => b.id !== nearby?.id);
    if (remaining.length >= maxKeep) {
      const toDelete = remaining.slice(maxKeep - 1);
      for (const old of toDelete) {
        if (old.id !== undefined) {
          await store.delete(old.id);
        }
      }
    }

    await tx.done;
    this.userBookmarksChanged$.next();
  }

  async clearAutosaveBookmarks(dataId: number): Promise<void> {
    if (typeof dataId !== 'number' || Number.isNaN(dataId)) {
      return;
    }
    const db = await this.db;
    const tx = db.transaction('userBookmark', 'readwrite');
    const store = tx.objectStore('userBookmark');
    const index = store.index('dataId');

    const existing = await index.getAll(dataId);
    for (const item of existing) {
      if (item.isAutosave && item.id !== undefined) {
        await store.delete(item.id);
      }
    }

    await tx.done;
    this.userBookmarksChanged$.next();
  }

  async promoteAutosaveToBookmark(
    id: number,
    label?: string,
    color?: BookmarkColor,
    note?: string
  ): Promise<void> {
    if (typeof id !== 'number' || Number.isNaN(id)) return;
    const db = await this.db;
    const bookmark = await db.get('userBookmark', id);
    if (!bookmark) return;

    const updated: BooksDbUserBookmarkData = {
      ...bookmark,
      label: label !== undefined ? label : bookmark.label.replace(/\s*\(Autosave\)$/i, ''),
      color: color || 'blue',
      note: note !== undefined ? note : bookmark.note,
      isAutosave: false,
      lastModified: Date.now()
    };

    const promotedBook = await db.get('data', bookmark.dataId).catch(() => undefined);
    if (promotedBook?.title && !updated.syncId) {
      updated.syncId = await computeBookmarkSyncId(
        promotedBook.title,
        updated.exploredCharCount,
        updated.createdAt
      );
    }

    await db.put('userBookmark', updated);

    const book = await db.get('data', bookmark.dataId);
    if (book?.title) {
      await db.put('lastModified', {
        title: book.title,
        dataType: StorageDataType.USER_BOOKMARKS,
        lastModifiedValue: updated.lastModified
      });
    }

    this.userBookmarksChanged$.next();
  }

  /**
   * Delete a bookmark. Manual rows are soft-deleted (`deleted`/`deletedAt`
   * with a fresh `lastModified`) so the removal propagates as an ordinary
   * LWW value instead of resurrecting on the next merge; display paths
   * already exclude deleted rows via `getUserBookmarks`, so the row vanishes
   * immediately locally. Autosaves stay local-only and are hard-deleted.
   */
  async deleteUserBookmark(id: number): Promise<void> {
    if (typeof id !== 'number' || Number.isNaN(id)) return;
    const db = await this.db;
    const bookmark = await db.get('userBookmark', id);
    if (!bookmark) return;
    if (bookmark.isAutosave) {
      await db.delete('userBookmark', id);
      this.userBookmarksChanged$.next();
      return;
    }
    const book = bookmark.dataId ? await db.get('data', bookmark.dataId) : undefined;
    let syncId = bookmark.syncId;
    if (!syncId && book?.title) {
      syncId = await computeBookmarkSyncId(
        book.title,
        bookmark.exploredCharCount,
        bookmark.createdAt
      );
    }
    const now = Date.now();
    await db.put('userBookmark', {
      ...bookmark,
      syncId,
      deleted: true,
      deletedAt: now,
      lastModified: now
    });
    if (book?.title) {
      await db.put('lastModified', {
        title: book.title,
        dataType: StorageDataType.USER_BOOKMARKS,
        lastModifiedValue: now
      });
    }
    this.userBookmarksChanged$.next();
  }

  /**
   * User-bookmark sync: per-`syncId` last-write-wins over the *whole* row,
   * including `deleted`/`deletedAt` — deletion is an ordinary field value,
   * not a special branch, so removals converge fleet-wide (including to a
   * device that was dormant for weeks) instead of resurrecting. Rows without
   * `syncId` fall back to the legacy fuzzy match until backfill completes,
   * converging on the lexicographically-smaller ID on cross-match. Local
   * auto-increment ids are never used for matching. Overwrite mode (one-shot
   * recovery only) replaces the manual set wholesale.
   */
  async storeUserBookmarks(
    title: string,
    bookmarks: BooksDbUserBookmarkData[],
    saveBehavior: ReplicationSaveBehavior,
    lastModified?: number
  ): Promise<void> {
    if (!title) return;
    const book = await this.getDataByTitle(title);
    if (!book || !book.id) return;

    const dataId = book.id;
    const db = await this.db;

    // All async crypto (deterministic ID derivation) happens ahead of the
    // transaction: awaiting non-IDB promises inside an IDB transaction risks
    // autocommit. Both sides are stamped here; the tx below is pure IDB.
    const stamped = await Promise.all(
      bookmarks.map(async (bm) => {
        if (bm.syncId || bm.isAutosave) return bm;
        return {
          ...bm,
          syncId: await computeBookmarkSyncId(title, bm.exploredCharCount, bm.createdAt)
        };
      })
    );
    const existingList = await db.getAllFromIndex('userBookmark', 'dataId', dataId).catch(() => []);
    // Backfill existing rows missing syncIds (same deterministic derivation
    // — converges without coordination).
    const backfilledIds = new Set<number>();
    for (const existing of existingList) {
      if (!existing.syncId && !existing.isAutosave && existing.id !== undefined) {
        existing.syncId = await computeBookmarkSyncId(
          title,
          existing.exploredCharCount,
          existing.createdAt
        );
        backfilledIds.add(existing.id);
      }
    }

    const tx = db.transaction(['userBookmark', 'lastModified'], 'readwrite');

    try {
      const ubStore = tx.objectStore('userBookmark');
      const lmStore = tx.objectStore('lastModified');
      const isOverwrite = saveBehavior === ReplicationSaveBehavior.Overwrite;

      if (isOverwrite) {
        const index = ubStore.index('dataId');
        let cursor = await index.openCursor(dataId);
        while (cursor) {
          if (!cursor.value.isAutosave) {
            await cursor.delete();
          }
          cursor = await cursor.continue();
        }

        for (const bm of stamped) {
          const { id: _ignored, ...bmWithoutId } = bm;
          await ubStore.add({
            ...bmWithoutId,
            dataId
          });
        }
      } else {
        // Persist backfills first so the merge below matches by syncId.
        // Only rows actually assigned an ID above are rewritten.
        for (const existing of existingList) {
          if (existing.id !== undefined && backfilledIds.has(existing.id)) {
            await ubStore.put(existing);
          }
        }

        for (const incoming of stamped) {
          const match = existingList.find((e) => isSameBookmark(e, incoming));

          if (match && match.id !== undefined) {
            const convergent = adoptConvergentSyncId(match, incoming);
            if ((incoming.lastModified || 0) > (match.lastModified || 0)) {
              await ubStore.put({
                ...incoming,
                syncId: convergent || incoming.syncId,
                id: match.id,
                dataId
              });
            } else if (convergent && convergent !== match.syncId) {
              // Same timestamp, divergent IDs from a legacy cross-match:
              // adopt the smaller ID and republish once so both sides
              // converge on one identity.
              await ubStore.put({ ...match, syncId: convergent });
            }
          } else {
            const { id: _ignored, ...incomingWithoutId } = incoming;
            await ubStore.add({
              ...incomingWithoutId,
              dataId
            });
          }
        }
      }

      // Down-sync carries its own timestamps; only fall back to now when the
      // payload has none, so a download doesn't dirty the marker and trigger
      // an immediate up-sync loop.
      const fromBookmarks = Math.max(0, ...bookmarks.map((b) => b.lastModified || 0));
      const newLastModified = lastModified || fromBookmarks || Date.now();

      await lmStore.put({
        title,
        dataType: StorageDataType.USER_BOOKMARKS,
        lastModifiedValue: newLastModified
      });

      await tx.done;
      this.userBookmarksChanged$.next();
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
  }

  async putAudioBook(audioBook: BooksDbAudioBook) {
    if (!audioBook?.title) return;
    const db = await this.db;

    return db.put('audioBook', audioBook);
  }

  async putSubtitleData(subtitleData: BooksDbSubtitleData) {
    if (!subtitleData?.title) return;
    const db = await this.db;

    return db.put('subtitle', subtitleData);
  }

  async putLastItem(dataId: number) {
    if (typeof dataId !== 'number' || Number.isNaN(dataId)) return;
    const db = await this.db;
    const result = await db.put('lastItem', { dataId }, LAST_ITEM_KEY);
    this.lastItemChanged$.next();
    return result;
  }

  async deleteLastItem() {
    const db = await this.db;
    await db.delete('lastItem', LAST_ITEM_KEY);
    this.lastItemChanged$.next();
  }

  /**
   * Factory-reset helper: clears every object store in a single transaction.
   * Data only — the schema and append-only migration history are untouched.
   * Callers must reload the app afterwards so in-memory stores rehydrate.
   */
  async clearAll(): Promise<void> {
    const db = await this.db;
    const storeNames = Array.from(db.objectStoreNames) as StoreNames<BooksDb>[];
    if (!storeNames.length) return;
    const tx = db.transaction(storeNames, 'readwrite');
    await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()));
    await tx.done;
  }

  private async deleteSingleData(
    db: IDBPDatabase<BooksDb>,
    dataId: number,
    title: string | undefined,
    cachedData: { bookmarkIds: Set<number>; lastItem: number | undefined },
    shouldDeleteStatistics: boolean
  ) {
    const storeNames: (
      | 'data'
      | 'bookmark'
      | 'userBookmark'
      | 'statistic'
      | 'statisticContribution'
      | 'statisticRemoteContribution'
      | 'lastItem'
      | 'lastModified'
      | 'audioBook'
      | 'subtitle'
      | 'handle'
    )[] = ['data', 'userBookmark', 'audioBook', 'subtitle', 'handle', 'lastModified'];
    const shouldDeleteLastItem = cachedData.lastItem === dataId;
    const shouldDeleteBookmark = cachedData.bookmarkIds.has(dataId);

    let bookTitle = title;

    if (shouldDeleteLastItem) {
      storeNames.push('lastItem');
    }

    if (shouldDeleteBookmark) {
      storeNames.push('bookmark');
    }

    if (shouldDeleteStatistics) {
      storeNames.push('statistic');
      storeNames.push('statisticContribution');
      storeNames.push('statisticRemoteContribution');
    }

    const tx = db.transaction(storeNames, 'readwrite');

    try {
      if (!bookTitle) {
        bookTitle = (await tx.objectStore('data').get(dataId))?.title;
      }

      if (shouldDeleteLastItem) {
        await tx.objectStore('lastItem').delete(LAST_ITEM_KEY);
      }

      if (shouldDeleteBookmark) {
        await tx.objectStore('bookmark').delete(dataId);
      }

      const userBookmarkStore = tx.objectStore('userBookmark');
      const userBookmarkIndex = userBookmarkStore.index('dataId');
      let userBookmarkCursor = await userBookmarkIndex.openCursor(dataId);
      while (userBookmarkCursor) {
        await userBookmarkCursor.delete();
        userBookmarkCursor = await userBookmarkCursor.continue();
      }

      if (shouldDeleteStatistics && bookTitle) {
        await tx.objectStore('statistic').delete(IDBKeyRange.bound([bookTitle], [bookTitle, []]));
        await tx
          .objectStore('statisticContribution')
          .delete(IDBKeyRange.bound([bookTitle], [bookTitle, []]));
        await deleteRemoteRowsForBook(tx.objectStore('statisticRemoteContribution'), bookTitle);
        await tx.objectStore('lastModified').delete([bookTitle, StorageDataType.STATISTICS]);
      }

      if (bookTitle) {
        await tx.objectStore('audioBook').delete(bookTitle);
        await tx.objectStore('subtitle').delete(bookTitle);
        await tx.objectStore('handle').delete(IDBKeyRange.bound([bookTitle], [bookTitle, []]));
        // Removing a book from one device must not delete its tags
        // fleet-wide: drop the local tag attribution so future publishes
        // carry no entry for it, and never publish an empty-list removal.
        await tx.objectStore('lastModified').delete([bookTitle, StorageDataType.BOOK_TAGS]);
      }

      await tx.objectStore('data').delete(dataId);
      await tx.done;

      this.userBookmarksChanged$.next();

      if (shouldDeleteLastItem) {
        this.lastItemChanged$.next();
      }
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }

    replicationProgress$.next({ progressToAdd: 1 });

    return dataId;
  }

  async getStorageSources() {
    const db = await this.db;

    return db.getAll('storageSource');
  }

  async saveStorageSource(
    storageSource: BooksDbStorageSource,
    oldName: string,
    isSyncTarget: boolean,
    isStorageSourceDefault: boolean
  ) {
    if (!storageSource?.name) {
      throw new Error('Storage source name is required');
    }
    const db = await this.db;
    const tx = db.transaction(['storageSource'], 'readwrite');

    try {
      const store = tx.objectStore('storageSource');

      if (oldName && storageSource.name !== oldName) {
        await store.delete(oldName);
      }

      if (storageSource.name === oldName) {
        await store.put(storageSource);
      } else {
        await store.add(storageSource);
      }

      await tx.done;

      if (isSyncTarget) {
        syncTarget$.next(storageSource.name);
      } else if (oldName) {
        syncTarget$.next('');
      }

      if (isStorageSourceDefault) {
        setStorageSourceDefault(storageSource.name, storageSource.type);
      } else if (oldName) {
        setStorageSourceDefault('', storageSource.type);
      }
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async deleteStorageSource(
    toDelete: BooksDbStorageSource,
    wasSyncTarget: boolean,
    wasStorageSourceDefault: boolean
  ) {
    if (!toDelete?.name) return;
    const db = await this.db;

    await db.delete('storageSource', toDelete.name);

    if (wasSyncTarget) {
      syncTarget$.next('');
    }

    if (wasStorageSourceDefault) {
      setStorageSourceDefault('', toDelete.type);
    }
  }

  async getStatisticsForBook(bookTitle: string) {
    if (!bookTitle) {
      return [];
    }
    const db = await this.db;

    return db.getAll('statistic', IDBKeyRange.bound([bookTitle], [bookTitle, []]));
  }

  async getStatisticForCompletedBook(bookTitle: string) {
    if (!bookTitle) {
      return undefined;
    }
    const db = await this.db;

    return db.getFromIndex('statistic', 'completedBook', [1, bookTitle]);
  }

  async getStatisticsForTimeWindow(startDate: string, endDate: string) {
    if (!startDate || !endDate) {
      return [];
    }
    const db = await this.db;

    return db.getAllFromIndex('statistic', 'dateKey', IDBKeyRange.bound(startDate, endDate));
  }

  async getStatisticsUntilDate(bookTitle: string, maxDate: string) {
    if (!bookTitle || !maxDate) {
      return [];
    }
    const db = await this.db;

    const results = await db.getAllFromIndex(
      'statistic',
      'dateKey',
      IDBKeyRange.upperBound(maxDate)
    );

    return results.filter((result) => result.title === bookTitle);
  }

  async storeStatistics(
    bookTitle: string,
    statistics: BooksDbStatistic[],
    saveBehavior: ReplicationSaveBehavior,
    statisticsMergeMode: MergeMode,
    currentLastModified = Date.now()
  ) {
    if (!bookTitle) return;
    const db = await this.db;

    let statisticsToStore: BooksDbStatistic[] = statistics;
    let newStatisticModified = currentLastModified;

    if (statisticsMergeMode === MergeMode.MERGE) {
      const existingStatistics = await this.getStatisticsForBook(bookTitle);

      statisticsToStore = mergeStatistics(
        statistics,
        existingStatistics,
        saveBehavior === ReplicationSaveBehavior.NewOnly
      );
    }

    ({ newStatisticModified, statisticsToStore } = updateStatisticToStore(
      statisticsToStore,
      newStatisticModified
    ));

    const isLocalWrite = statisticsMergeMode === MergeMode.LOCAL;

    // P3: local tracker writes are this device's own raw cumulative reading.
    // They land in `statisticContribution` and the display row is recomputed
    // as a fold of local + cached remote contributions, so a local flush can
    // never clobber another device's folded sums. Before an identity exists
    // (never synced), fall back to a direct display write.
    if (isLocalWrite) {
      const wroteContributions = await this.storeLocalContributions(bookTitle, statisticsToStore);
      if (wroteContributions) {
        await this.refoldAllFromStores();
        return;
      }
    }

    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');

    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      // Tracker flushes carry partial day keys; only the sync-merge path
      // replaces the whole book scope.
      if (!isLocalWrite) {
        tasks.push(
          limiter(async () => {
            try {
              await statisticsStore.delete(IDBKeyRange.bound([bookTitle], [bookTitle, []]));
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        );
      }

      statisticsToStore
        .filter(
          (statistic) =>
            statistic && typeof statistic.dateKey === 'string' && statistic.dateKey.length > 0
        )
        .forEach((statistic) =>
          tasks.push(
            limiter(async () => {
              try {
                await statisticsStore.put({ ...statistic, title: bookTitle });
              } catch (error: any) {
                limiter.clearQueue();

                throw error;
              }
            })
          )
        );

      tasks.push(
        limiter(async () => {
          try {
            await lastModifiedStore.put({
              title: bookTitle,
              dataType: StorageDataType.STATISTICS,
              lastModifiedValue: newStatisticModified
            });
          } catch (error: any) {
            limiter.clearQueue();

            throw error;
          }
        })
      );

      await Promise.all(tasks);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  /**
   * Write this device's own contribution rows (one IndexedDB transaction).
   * Display rows are derived afterwards via `refoldAllFromStores`, never here.
   * Returns false when no device identity exists yet (caller falls back to a
   * direct display write).
   */
  private async storeLocalContributions(
    bookTitle: string,
    statistics: BooksDbStatistic[]
  ): Promise<boolean> {
    // INVARIANT: `statistics` must be this device's OWN rows only, never
    // folded display rows. Display rows include remote + legacy sources; writing
    // them here copies peer reading into our contribution and the next refold
    // double-counts it (cross-device time/char inflation). The tracker seeds its
    // write model via getOwnStatisticsForBook() to uphold this.
    const db = await this.db;
    const tx = db.transaction(
      ['statisticContribution', 'statisticSyncState', 'deviceIdentity'],
      'readwrite'
    );

    try {
      const identity = await tx.objectStore('deviceIdentity').get(0);
      const deviceId = identity?.deviceId;
      if (!deviceId) {
        try {
          tx.abort();
          await tx.done;
        } catch (_) {
          // no-op
        }
        return false;
      }

      const contributionStore = tx.objectStore('statisticContribution');
      const syncStateStore = tx.objectStore('statisticSyncState');
      const stateKey = `contribution-revision-${deviceId}`;
      const state = await syncStateStore.get(stateKey);
      const nextRevision = (state?.revisionByFile?.['local'] || 0) + 1;

      for (const statistic of statistics) {
        if (!statistic?.dateKey) continue;
        const existing = await contributionStore.get([bookTitle, statistic.dateKey]);
        const contribution: BooksDbStatisticContribution = {
          ...statistic,
          title: bookTitle,
          deviceId,
          year: getYearFromDateKey(statistic.dateKey),
          revision: Math.max(existing?.revision || 0, nextRevision)
        };
        await contributionStore.put(contribution);
      }

      await syncStateStore.put({
        id: stateKey,
        updatedAt: Date.now(),
        revisionByFile: { ...(state?.revisionByFile || {}), local: nextRevision }
      });
      await tx.done;
      return true;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async updateStatistic(newStatistic: BookStatistic) {
    if (!newStatistic?.title || !newStatistic?.dateKey) {
      throw new Error('Invalid statistic data');
    }
    const db = await this.db;

    const existingStatistic = await db.get('statistic', [newStatistic.title, newStatistic.dateKey]);

    if (!existingStatistic) {
      throw new Error('Unable to find record in the database');
    }

    const lastModified = newStatistic.lastStatisticModified || Date.now();

    // Manual edits are local reading: mirror them into the contribution store
    // and recompute the display row as a fold, so remote sums survive the edit.
    const identity = await db.get('deviceIdentity', 0);
    if (!identity?.deviceId) {
      await db.put('statistic', {
        ...existingStatistic,
        charactersRead: newStatistic.charactersRead,
        readingTime: newStatistic.readingTime,
        minReadingSpeed: newStatistic.minReadingSpeed,
        altMinReadingSpeed: newStatistic.altMinReadingSpeed,
        lastReadingSpeed: newStatistic.lastReadingSpeed,
        maxReadingSpeed: newStatistic.maxReadingSpeed,
        lastStatisticModified: lastModified
      });
      await db.put('lastModified', {
        title: newStatistic.title,
        dataType: StorageDataType.STATISTICS,
        lastModifiedValue: lastModified
      });
      return;
    }

    const tx = db.transaction(['statisticContribution', 'statisticSyncState'], 'readwrite');
    try {
      const contributionStore = tx.objectStore('statisticContribution');
      const existingContribution = await contributionStore.get([
        newStatistic.title,
        newStatistic.dateKey
      ]);
      const base = existingContribution || {
        ...getDefaultStatistic(newStatistic.title, newStatistic.dateKey),
        deviceId: identity.deviceId,
        year: getYearFromDateKey(newStatistic.dateKey),
        revision: 0
      };
      await contributionStore.put({
        ...base,
        charactersRead: newStatistic.charactersRead,
        readingTime: newStatistic.readingTime,
        minReadingSpeed: newStatistic.minReadingSpeed,
        altMinReadingSpeed: newStatistic.altMinReadingSpeed,
        lastReadingSpeed: newStatistic.lastReadingSpeed,
        maxReadingSpeed: newStatistic.maxReadingSpeed,
        lastStatisticModified: lastModified,
        deviceId: identity.deviceId,
        year: getYearFromDateKey(newStatistic.dateKey),
        revision: (existingContribution?.revision || 0) + 1
      } as BooksDbStatisticContribution);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
    await this.refoldAllFromStores();
  }

  /**
   * Manual "add activity" deltas are local reading: accumulate them into this
   * device's own contribution, then recompute display as a fold. Without an
   * identity yet, keep the legacy display-additive behavior.
   */
  async upsertStatistic(statistic: BooksDbStatistic) {
    if (!statistic?.title || !statistic?.dateKey) {
      throw new Error('Invalid statistic data');
    }
    const db = await this.db;
    const identity = await db.get('deviceIdentity', 0);
    const lastModified = statistic.lastStatisticModified || Date.now();

    if (!identity?.deviceId) {
      await this.upsertDisplayStatistic(statistic, lastModified);
      return;
    }

    const tx = db.transaction(['statisticContribution'], 'readwrite');
    try {
      const contributionStore = tx.objectStore('statisticContribution');
      const existing = await contributionStore.get([statistic.title, statistic.dateKey]);
      const base =
        existing ||
        ({
          ...getDefaultStatistic(statistic.title, statistic.dateKey),
          deviceId: identity.deviceId,
          year: getYearFromDateKey(statistic.dateKey),
          revision: 0
        } as BooksDbStatisticContribution);
      const updatedTime = (base.readingTime || 0) + (statistic.readingTime || 0);
      const updatedChars = (base.charactersRead || 0) + (statistic.charactersRead || 0);
      const speed = updatedTime ? Math.ceil((3600 * updatedChars) / updatedTime) : 0;
      const merged: BooksDbStatisticContribution = {
        ...base,
        ...statistic,
        title: statistic.title,
        dateKey: statistic.dateKey,
        readingTime: updatedTime,
        charactersRead: updatedChars,
        lastReadingSpeed: speed,
        maxReadingSpeed: Math.max(base.maxReadingSpeed || 0, speed),
        minReadingSpeed: base.minReadingSpeed ? Math.min(base.minReadingSpeed, speed) : speed,
        altMinReadingSpeed: base.altMinReadingSpeed
          ? Math.min(base.altMinReadingSpeed, speed)
          : speed,
        lookupCount: (base.lookupCount || 0) + (statistic.lookupCount || 0),
        sessionCount: (base.sessionCount || 0) + (statistic.sessionCount || 0),
        longestSessionSeconds: Math.max(
          base.longestSessionSeconds || 0,
          statistic.longestSessionSeconds || 0
        ),
        maxProgress: Math.max(base.maxProgress || 0, statistic.maxProgress || 0),
        lastStatisticModified: lastModified,
        deviceId: identity.deviceId,
        year: getYearFromDateKey(statistic.dateKey),
        revision: (base.revision || 0) + 1
      };
      if (statistic.readingTimeByHour || base.readingTimeByHour) {
        merged.readingTimeByHour = sumHourlyArrays(
          base.readingTimeByHour,
          statistic.readingTimeByHour
        );
      }
      if (statistic.charactersByHour || base.charactersByHour) {
        merged.charactersByHour = sumHourlyArrays(
          base.charactersByHour,
          statistic.charactersByHour
        );
      }
      if (statistic.lookupsByHour || base.lookupsByHour) {
        merged.lookupsByHour = sumHourlyArrays(base.lookupsByHour, statistic.lookupsByHour);
      }
      if (statistic.readingTimeByProfile || base.readingTimeByProfile) {
        merged.readingTimeByProfile = sumProfileTimes(
          base.readingTimeByProfile,
          statistic.readingTimeByProfile
        );
      }
      await contributionStore.put(merged);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
    await this.refoldAllFromStores();
  }

  private async upsertDisplayStatistic(statistic: BooksDbStatistic, lastModified: number) {
    const db = await this.db;
    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');

    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');

      let existingStatistic = await statisticsStore.get([statistic.title, statistic.dateKey]);

      if (existingStatistic) {
        const updatedTime = (existingStatistic.readingTime || 0) + (statistic.readingTime || 0);
        const updatedChars =
          (existingStatistic.charactersRead || 0) + (statistic.charactersRead || 0);
        const speed = updatedTime ? Math.ceil((3600 * updatedChars) / updatedTime) : 0;

        existingStatistic = {
          ...existingStatistic,
          readingTime: updatedTime,
          charactersRead: updatedChars,
          lastReadingSpeed: speed,
          maxReadingSpeed: Math.max(existingStatistic.maxReadingSpeed || 0, speed),
          minReadingSpeed: existingStatistic.minReadingSpeed
            ? Math.min(existingStatistic.minReadingSpeed, speed)
            : speed,
          altMinReadingSpeed: existingStatistic.altMinReadingSpeed
            ? Math.min(existingStatistic.altMinReadingSpeed, speed)
            : speed,
          lastStatisticModified: lastModified
        };
        await statisticsStore.put(existingStatistic);
      } else {
        const speed = statistic.readingTime
          ? Math.ceil((3600 * statistic.charactersRead) / statistic.readingTime)
          : 0;
        const newRecord: BooksDbStatistic = {
          ...getDefaultStatistic(statistic.title, statistic.dateKey),
          ...statistic,
          lastReadingSpeed: speed,
          maxReadingSpeed: speed,
          minReadingSpeed: speed,
          altMinReadingSpeed: speed,
          lastStatisticModified: lastModified
        };
        await statisticsStore.put(newRecord);
      }

      await lastModifiedStore.put({
        title: statistic.title,
        dataType: StorageDataType.STATISTICS,
        lastModifiedValue: lastModified
      });

      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
  }

  /**
   * Statistics v2 (P3): read this device's own raw contributions.
   * Sync publishes these rows; it never publishes the folded display rows.
   */
  async getStatisticContributions(): Promise<BooksDbStatisticContribution[]> {
    const db = await this.db;
    return db.getAll('statisticContribution');
  }

  async getStatisticContributionsForBook(title: string): Promise<BooksDbStatisticContribution[]> {
    if (!title) return [];
    const db = await this.db;
    return db.getAll('statisticContribution', IDBKeyRange.bound([title], [title, []]));
  }

  /**
   * This device's own raw contribution rows for one book — the only correct
   * seed for the reading tracker's write model. The folded `statistic` display
   * rows include remote + legacy sources and must never seed the write model:
   * flushing them back via `storeLocalContributions` copies peer reading into
   * our own contribution, and the next `refoldAllFromStores` sums it twice
   * (multi-device inflation: each device open adds one generation).
   *
   * Returns [] when no device identity exists yet (never synced); callers
   * should then fall back to display rows for pre-sync continuity.
   */
  async getOwnStatisticsForBook(title: string): Promise<BooksDbStatisticContribution[]> {
    if (!title) return [];
    const db = await this.db;
    const identity = await db.get('deviceIdentity', 0).catch(() => undefined);
    const deviceId = identity?.deviceId;
    if (!deviceId) return [];
    const rows = await db.getAll('statisticContribution', IDBKeyRange.bound([title], [title, []]));
    return rows.filter((row) => row.deviceId === deviceId);
  }

  /** True once this device has a stable sync identity (i.e. has synced). */
  async hasDeviceIdentity(): Promise<boolean> {
    const db = await this.db;
    const identity = await db.get('deviceIdentity', 0).catch(() => undefined);
    return !!identity?.deviceId;
  }

  async getStatisticContributionsForYear(year: number): Promise<BooksDbStatisticContribution[]> {
    if (!year) return [];
    const db = await this.db;
    return db.getAllFromIndex('statisticContribution', 'year', year);
  }

  async getStatisticSyncState(id: string): Promise<BooksDbStatisticSyncState | undefined> {
    if (!id) return undefined;
    const db = await this.db;
    return db.get('statisticSyncState', id);
  }

  async putStatisticSyncState(state: BooksDbStatisticSyncState): Promise<void> {
    if (!state?.id) return;
    const db = await this.db;
    await db.put('statisticSyncState', state);
  }

  /** P4 local marker: legacy history has been baselined once on this device. */
  async isLegacyStatisticsMigrationComplete(): Promise<boolean> {
    const db = await this.db;
    const state = await db.get('statisticSyncState', LEGACY_MIGRATION_STATE_ID);
    return !!state?.legacyMigrationCompletedAt;
  }

  async markLegacyStatisticsMigrationComplete(baselineDeviceId = 'legacy-cloud'): Promise<void> {
    const db = await this.db;
    const existing = await db.get('statisticSyncState', LEGACY_MIGRATION_STATE_ID);
    await db.put('statisticSyncState', {
      id: LEGACY_MIGRATION_STATE_ID,
      updatedAt: Date.now(),
      legacyMigrationCompletedAt: existing?.legacyMigrationCompletedAt || Date.now(),
      legacyBaselineDeviceId: existing?.legacyBaselineDeviceId || baselineDeviceId,
      revisionByFile: existing?.revisionByFile || {}
    });
  }

  /**
   * Recompute folded display rows from the local contribution store plus
   * downloaded remote contribution lists. Never writes the contribution
   * store — that ordering is what prevents double-counting (P3).
   * Returns the folded rows written.
   */
  async refoldDisplayStatistics(
    remoteContributions: BooksDbStatistic[][] = []
  ): Promise<BooksDbStatistic[]> {
    const db = await this.db;
    const localContributions = await db.getAll('statisticContribution');
    const folded = foldStatisticContributions([localContributions, ...remoteContributions]);
    if (!folded.length) return [];

    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');
    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const touchedTitles = new Set<string>();
      for (const row of folded) {
        await statisticsStore.put(row);
        touchedTitles.add(row.title);
      }
      for (const title of touchedTitles) {
        const rowsForTitle = folded.filter((row) => row.title === title);
        const lastModifiedValue = Math.max(
          0,
          ...rowsForTitle.map((row) => row.lastStatisticModified || 0)
        );
        await lastModifiedStore.put({
          title,
          dataType: StorageDataType.STATISTICS,
          lastModifiedValue: lastModifiedValue || Date.now()
        });
      }
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
    return folded;
  }

  async getAllDisplayStatistics(): Promise<BooksDbStatistic[]> {
    const db = await this.db;
    return db.getAll('statistic');
  }

  /**
   * Build this device's publish payloads: one stable per-year file each.
   * Rows without real reading are local placeholders only and never published.
   */
  async getOwnContributionFiles(deviceId: string): Promise<StatisticContributionFile[]> {
    if (!deviceId) return [];
    const db = await this.db;
    const rows = await db.getAll('statisticContribution');
    return groupContributionsByYear(
      deviceId,
      rows.filter((row) => row.deviceId === deviceId)
    );
  }

  /**
   * Persist downloaded remote contribution files into the remote cache, then
   * recompute display. Each file replaces its device's cached rows, so a
   * re-pull of identical files is a no-op. Rows stamped with our own
   * deviceId are ignored — the local store is authoritative for them.
   */
  async storeRemoteContributionFiles(files: StatisticContributionFile[]): Promise<void> {
    const valid = (files || []).filter(
      (file) => file && typeof file.deviceId === 'string' && Array.isArray(file.rows)
    );
    if (!valid.length) return;
    const db = await this.db;
    const identity = await db.get('deviceIdentity', 0);
    const localDeviceId = identity?.deviceId;
    const now = Date.now();
    const tx = db.transaction(['statisticRemoteContribution'], 'readwrite');
    try {
      const store = tx.objectStore('statisticRemoteContribution');
      for (const file of valid) {
        if (localDeviceId && file.deviceId === localDeviceId) continue;
        const existingKeys = await store.index('byDevice').getAllKeys(file.deviceId);
        for (const key of existingKeys) {
          await store.delete(key);
        }
        for (const row of file.rows) {
          if (!row?.title || !row?.dateKey) continue;
          const cached: BooksDbRemoteStatisticContribution = {
            ...row,
            deviceId: file.deviceId,
            year: getYearFromDateKey(row.dateKey),
            revision: row.revision || file.revision || 0,
            cachedAt: now
          };
          await store.put(cached);
        }
      }
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
  }

  /**
   * Recompute every display row from the local contribution store plus the
   * cached remote store. Display rows with no contribution source (legacy
   * zero-reading placeholders) are preserved as-is; anything else absent
   * from the fold is stale and removed.
   */
  async refoldAllFromStores(): Promise<BooksDbStatistic[]> {
    const db = await this.db;
    const [local, remote, display] = await Promise.all([
      db.getAll('statisticContribution'),
      db.getAll('statisticRemoteContribution'),
      db.getAll('statistic')
    ]);
    const identity = await db.get('deviceIdentity', 0);
    const localDeviceId = identity?.deviceId;
    const remoteForFold = localDeviceId
      ? remote.filter((row) => row.deviceId !== localDeviceId)
      : remote;
    const folded = foldStatisticContributions([local, remoteForFold]);
    const foldedKeys = new Set(folded.map((row) => `${row.title}::${row.dateKey}`));

    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');
    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const touchedTitles = new Set<string>();
      for (const row of folded) {
        await statisticsStore.put(row);
        touchedTitles.add(row.title);
      }
      for (const row of display) {
        const key = `${row.title}::${row.dateKey}`;
        if (!foldedKeys.has(key)) {
          await statisticsStore.delete([row.title, row.dateKey]);
          touchedTitles.add(row.title);
        }
      }
      for (const title of touchedTitles) {
        const remaining = await statisticsStore.getAll(IDBKeyRange.bound([title], [title, []]));
        if (!remaining.length) {
          await lastModifiedStore.delete([title, StorageDataType.STATISTICS]);
          continue;
        }
        await lastModifiedStore.put({
          title,
          dataType: StorageDataType.STATISTICS,
          lastModifiedValue:
            Math.max(0, ...remaining.map((row) => row.lastStatisticModified || 0)) || Date.now()
        });
      }
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
    return folded;
  }

  /**
   * P4: seed unattributed legacy history as a single baseline source so it is
   * folded exactly once. Replaces any previous baseline seed (single-baseline
   * invariant after the migration tie-break). Callers must hold the migration
   * gate — this method only writes and refolds.
   */
  async seedLegacyBaseline(rows: BooksDbStatistic[], sourceTag: string): Promise<number> {
    const valid = (rows || []).filter((row) => row?.title && row?.dateKey);
    const db = await this.db;
    const tx = db.transaction(['statisticRemoteContribution'], 'readwrite');
    try {
      const store = tx.objectStore('statisticRemoteContribution');
      const index = store.index('byDevice');
      let cursor = await index.openCursor();
      while (cursor) {
        if (cursor.value.deviceId.startsWith(LEGACY_BASELINE_DEVICE_PREFIX)) {
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      for (const row of valid) {
        const cached: BooksDbRemoteStatisticContribution = {
          ...getDefaultStatistic(row.title, row.dateKey),
          ...row,
          deviceId: `${LEGACY_BASELINE_DEVICE_PREFIX}${sourceTag}`,
          year: getYearFromDateKey(row.dateKey),
          revision: 1,
          cachedAt: Date.now()
        };
        await store.put(cached);
      }
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
    await this.refoldAllFromStores();
    return valid.length;
  }

  async clearRemoteContributionsForBook(title: string): Promise<void> {
    if (!title) return;
    const db = await this.db;
    const keys = await db.getAllKeysFromIndex(
      'statisticRemoteContribution',
      'byBook',
      IDBKeyRange.bound([title], [title, []])
    );
    if (!keys.length) return;
    const tx = db.transaction(['statisticRemoteContribution'], 'readwrite');
    try {
      const store = tx.objectStore('statisticRemoteContribution');
      for (const key of keys) {
        await store.delete(key);
      }
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }
      throw error;
    }
  }

  async clearZombieStatistics() {
    try {
      const db = await this.db;
      const books = await db.getAll('data');
      const titles = new Set(books.map((book) => book.title));
      const statistics = await db.getAll('statistic');
      const lastModifiedForStatistics = await db.getAll('lastModified');
      const statisticsToDelete: BooksDbStatistic[] = [];
      const lastModifiedItemsToDelete = new Set<string>();

      for (let index = 0, { length } = statistics; index < length; index += 1) {
        const entry = statistics[index];

        if (!titles.has(entry.title)) {
          statisticsToDelete.push(entry);
        }
      }

      for (let index = 0, { length } = lastModifiedForStatistics; index < length; index += 1) {
        const entry = lastModifiedForStatistics[index];

        if (!titles.has(entry.title)) {
          lastModifiedItemsToDelete.add(entry.title);
        }
      }

      await this.deleteStatistics(statisticsToDelete, [...lastModifiedItemsToDelete]);
    } catch (error: any) {
      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Failure',
            message: `Error on Deletion: ${error.message}`
          }
        }
      ]);
    }
  }

  async deleteStatistics(statistics: BooksDbStatistic[], lastModifiedTitlesToDelete: string[]) {
    if (!statistics.length && !lastModifiedTitlesToDelete.length) {
      return;
    }

    const db = await this.db;
    const tx = db.transaction(
      ['statistic', 'statisticContribution', 'statisticRemoteContribution', 'lastModified'],
      'readwrite'
    );
    const titlesToDelete = new Set<string>();

    try {
      const statisticsStore = tx.objectStore('statistic');
      const contributionStore = tx.objectStore('statisticContribution');
      const remoteStore = tx.objectStore('statisticRemoteContribution');
      const lastModifiedStore = tx.objectStore('lastModified');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      for (let index = 0, { length } = lastModifiedTitlesToDelete; index < length; index += 1) {
        titlesToDelete.add(lastModifiedTitlesToDelete[index]);
      }

      statistics.forEach((statistic) =>
        tasks.push(
          limiter(async () => {
            try {
              if (statistic?.title && statistic?.dateKey) {
                titlesToDelete.add(statistic.title);
                await statisticsStore.delete([statistic.title, statistic.dateKey]);
                await contributionStore.delete([statistic.title, statistic.dateKey]);
                await deleteRemoteRowsForDay(remoteStore, statistic.title, statistic.dateKey);
              }
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      [...titlesToDelete].forEach((titleToDelete) =>
        tasks.push(
          limiter(async () => {
            try {
              if (titleToDelete) {
                await lastModifiedStore.delete([titleToDelete, StorageDataType.STATISTICS]);
                await deleteRemoteRowsForBook(remoteStore, titleToDelete);
              }
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      await Promise.all(tasks);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async deleteStatisticEntries(
    bookTitles: string[],
    checkExistingData: boolean,
    startDateString = '',
    endDateString = ''
  ) {
    const validTitles = bookTitles.filter((t) => typeof t === 'string' && t.trim().length > 0);
    if (!validTitles.length || (startDateString && !endDateString)) {
      throw new Error('Received invalid Arguments for deleteStatisticEntries');
    }

    const db = await this.db;
    const tx = db.transaction(
      ['statistic', 'statisticContribution', 'statisticRemoteContribution', 'lastModified'],
      'readwrite'
    );

    try {
      const statisticsStore = tx.objectStore('statistic');
      const contributionStore = tx.objectStore('statisticContribution');
      const remoteStore = tx.objectStore('statisticRemoteContribution');
      const lastModifiedStore = tx.objectStore('lastModified');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];
      const dates: string[] = [];
      const lastModifiedValue = Date.now();
      const hadDataMap = new Map<string, boolean>();

      if (startDateString) {
        // eslint-disable-next-line prefer-const
        let { referenceDate, dateString } = advanceDateDays(getDate(startDateString), 0);

        while (dateString <= endDateString) {
          dates.push(dateString);
          ({ dateString } = advanceDateDays(referenceDate));
        }
      }

      validTitles.forEach((bookTitle) => {
        if (dates.length) {
          dates
            .filter((dateKey) => typeof dateKey === 'string' && dateKey.length > 0)
            .forEach((dateKey) => {
              tasks.push(
                limiter(async () => {
                  try {
                    await statisticsStore.delete([bookTitle, dateKey]);
                    await contributionStore.delete([bookTitle, dateKey]);
                    await deleteRemoteRowsForDay(remoteStore, bookTitle, dateKey);
                  } catch (error: any) {
                    limiter.clearQueue();

                    throw error;
                  }
                })
              );
            });
        } else {
          tasks.push(
            limiter(async () => {
              try {
                const keyRange = IDBKeyRange.bound([bookTitle], [bookTitle, []]);

                if (checkExistingData && !hadDataMap.has(bookTitle)) {
                  const hadData = !!(await statisticsStore.getKey(keyRange));

                  hadDataMap.set(bookTitle, hadData);
                }

                await statisticsStore.delete(keyRange);
                await contributionStore.delete(keyRange);
                await deleteRemoteRowsForBook(remoteStore, bookTitle);
              } catch (error: any) {
                limiter.clearQueue();

                throw error;
              }
            })
          );
        }

        tasks.push(
          limiter(async () => {
            try {
              if (!checkExistingData || hadDataMap.get(bookTitle)) {
                await lastModifiedStore.put({
                  title: bookTitle,
                  dataType: StorageDataType.STATISTICS,
                  lastModifiedValue
                });
              }
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        );
      });

      await Promise.all(tasks);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async getReadingGoals() {
    const db = await this.db;

    return db.getAll('readingGoal');
  }

  async getOpenReadingGoals() {
    const db = await this.db;

    return db.getAllFromIndex('readingGoal', 'goalEndDate', '');
  }

  async getCurrentClosedReadingGoal(referenceDate: string) {
    if (!referenceDate) {
      return undefined;
    }
    const db = await this.db;
    const readingGoals = await db.getAll('readingGoal', IDBKeyRange.upperBound(referenceDate));

    return readingGoals.find((readingGoal) => readingGoal.goalEndDate >= referenceDate);
  }

  async getReadingGoalsForDateWindow(startDate: string, newStartDate = '', endDate = '') {
    const readingGoals = await this.getReadingGoals();

    if (newStartDate) {
      return readingGoals.filter(
        (readingGoal) =>
          !readingGoal.goalEndDate ||
          (startDate >= readingGoal.goalStartDate && startDate <= readingGoal.goalEndDate) ||
          (readingGoal.goalStartDate >= startDate &&
            (!endDate || readingGoal.goalStartDate <= endDate)) ||
          (newStartDate >= readingGoal.goalStartDate && newStartDate <= readingGoal.goalEndDate) ||
          readingGoal.goalStartDate >= newStartDate
      );
    }

    return readingGoals.filter(
      (readingGoal) =>
        !readingGoal.goalEndDate ||
        (startDate >= readingGoal.goalStartDate && startDate <= readingGoal.goalEndDate) ||
        (readingGoal.goalStartDate >= startDate &&
          (!endDate || readingGoal.goalStartDate <= endDate))
    );
  }

  async updateReadingGoals(
    readingGoalsToDelete: string[],
    readingGoalsToInsert: BooksDbReadingGoal[]
  ) {
    const validDeletions = readingGoalsToDelete.filter(
      (readingGoal) => typeof readingGoal === 'string' && readingGoal.length > 0
    );
    const validInsertions = readingGoalsToInsert.filter(
      (readingGoal) =>
        readingGoal &&
        typeof readingGoal.goalStartDate === 'string' &&
        readingGoal.goalStartDate.length > 0
    );

    if (!validDeletions.length && !validInsertions.length) {
      return;
    }

    const db = await this.db;
    const tx = db.transaction(['readingGoal'], 'readwrite');

    try {
      const store = tx.objectStore('readingGoal');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      validDeletions.forEach((readingGoal) =>
        tasks.push(
          limiter(async () => {
            try {
              await store.delete(readingGoal);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      validInsertions.forEach((readingGoal) =>
        tasks.push(
          limiter(async () => {
            try {
              await store.put(readingGoal);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      await Promise.all(tasks);
      await tx.done;

      lastReadingGoalsModified$.next(Date.now());
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async storeReadingGoals(
    readingGoals: BooksDbReadingGoal[],
    saveBehavior: ReplicationSaveBehavior,
    readingGoalsMergeMode: MergeMode,
    lastGoalModified: number
  ) {
    const db = await this.db;

    let readingGoalsToStore: BooksDbReadingGoal[] = readingGoals;
    let newReadingGoalModified = lastGoalModified;

    if (readingGoalsMergeMode === MergeMode.MERGE) {
      const existingReadingGoals = await this.getReadingGoals();

      ({ readingGoalsToStore, newReadingGoalModified } = mergeReadingGoals(
        readingGoals,
        existingReadingGoals,
        saveBehavior === ReplicationSaveBehavior.NewOnly,
        newReadingGoalModified
      ));
    }

    const tx = db.transaction(['readingGoal'], 'readwrite');

    try {
      const readingGoalStore = tx.objectStore('readingGoal');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      readingGoalsToStore.sort(readingGoalSortFunction);

      tasks.push(
        limiter(async () => {
          try {
            await readingGoalStore.clear();
          } catch (error: any) {
            limiter.clearQueue();

            throw error;
          }
        })
      );

      readingGoalsToStore
        .filter(
          (readingGoal) =>
            readingGoal &&
            typeof readingGoal.goalStartDate === 'string' &&
            readingGoal.goalStartDate.length > 0
        )
        .forEach((readingGoal) =>
          tasks.push(
            limiter(async () => {
              try {
                await readingGoalStore.put(readingGoal);
              } catch (error: any) {
                limiter.clearQueue();

                throw error;
              }
            })
          )
        );

      await Promise.all(tasks);
      await tx.done;

      lastReadingGoalsModified$.next(newReadingGoalModified);

      const currentUserGoal = await getCurrentReadingGoal();

      readingGoal$.next(currentUserGoal);
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async deleteReadingGoal(dateKey?: string) {
    const db = await this.db;

    if (typeof dateKey === 'string' && dateKey.length > 0) {
      await db.delete('readingGoal', dateKey);
    } else if (dateKey === undefined) {
      await db.clear('readingGoal');
    }

    lastReadingGoalsModified$.next(Date.now());
  }

  async getAudioBook(title: string) {
    if (!title) return undefined;
    const db = await this.db;

    return db.get('audioBook', title);
  }

  async getSubtitleData(title: string) {
    if (!title) return undefined;
    const db = await this.db;

    return db.get('subtitle', title);
  }
}
