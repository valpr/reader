/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type {
  BooksDbAudioBook,
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic,
  BooksDbStatisticContribution,
  BooksDbSubtitleData,
  BooksDbUserBookmarkData
} from '$lib/data/database/books-db/versions/books-db';
import {
  dictFromEntries,
  entriesFromDict,
  isBookTagsPayloadUnchanged,
  maxEntryModifiedAt,
  mergeTagEntries,
  mergeTagEntriesWithDict,
  mergeTagsTitles,
  type BookTagEntries,
  type BookTagsDict,
  type BookTagsSyncPayload
} from '$lib/data/book-tags';
import { logger } from '$lib/data/logger';
import { MergeMode } from '$lib/data/merge-mode';
import { mergeProfiles, newerStatisticsSettingsSection } from '$lib/data/profiles/profile-manager';
import type {
  ReaderProfile,
  ReaderProfilesSyncPayload,
  StatisticsSyncSection
} from '$lib/data/profiles/profile-types';
import { mergeReadingGoals, readingGoalSortFunction } from '$lib/data/reading-goal';
import type { ThemeOption } from '$lib/data/theme-option';
import {
  areUserBookmarkArraysEqual,
  mergeUserBookmarkArrays
} from '$lib/data/user-bookmarks-merge';
import {
  BaseStorageHandler,
  FilePrefix,
  type ExternalFile
} from '$lib/data/storage/handler/base-handler';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import {
  StorageOAuthManager,
  StorageConnectionState,
  setConnectionState,
  storageOAuthTokens
} from '$lib/data/storage/storage-oauth-manager';
import { StorageKey } from '$lib/data/storage/storage-types';
import { database, markPendingCloudSync } from '$lib/data/store';
import {
  convertAuthErrorResponse,
  ConflictError,
  handleErrorDuringReplication,
  withConflictRetry
} from '$lib/functions/replication/error-handler';
import { AbortError, throwIfAborted } from '$lib/functions/replication/replication-error';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import { mergeStatistics, updateStatisticToStore } from '$lib/functions/statistic-util';
import { isPositionNewerThan } from '$lib/functions/position-util';
import {
  getMigrationMarkerFileName,
  isContributionFile,
  isContributionFileName,
  isMigrationMarkerFileName,
  isStatisticMigrationMarker,
  mergeLegacySnapshotRows,
  parseContributionFileName,
  parseMigrationMarkerFileName,
  type StatisticContributionFile,
  type StatisticMigrationMarker
} from '$lib/functions/statistic-v2';
import pLimit from 'p-limit';

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: XMLHttpRequestBodyInit | null | undefined;
  trackDownload?: boolean;
  trackUpload?: boolean;
  skipAuth?: boolean;
  /**
   * When true, auth may open a popup / show login dialogs. Defaults to false
   * so background sync never steals focus; explicit reconnect flows pass true
   * via a pre-opened window instead (see StorageOAuthManager.reconnect).
   */
  allowInteractiveAuth?: boolean;
}

function isProfilesPayload(value: unknown): value is ReaderProfilesSyncPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as ReaderProfilesSyncPayload).profiles)
  );
}

function isBookTagsPayload(value: unknown): value is BookTagsSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as BookTagsSyncPayload;
  // v2 files always carry the mirror, but accept entries-only payloads too
  // so a mirror-less writer is never treated as an empty library.
  return typeof payload.tagsByTitle === 'object' || typeof payload.entries === 'object';
}

function mergeProfilesPayloads(payloads: ReaderProfilesSyncPayload[]): ReaderProfilesSyncPayload {
  let profiles: ReaderProfile[] = [];
  let lastModified = 0;
  let customThemes: Record<string, ThemeOption> | undefined;
  let statisticsSettings: StatisticsSyncSection | undefined;

  for (const payload of payloads) {
    const result = mergeProfiles(profiles, payload.profiles || [], false, lastModified);
    profiles = result.mergedProfiles;
    lastModified = Math.max(lastModified, result.newLastModified, payload.lastModified || 0);
    if (payload.customThemes) {
      customThemes = { ...(customThemes || {}), ...payload.customThemes };
    }
    statisticsSettings = newerStatisticsSettingsSection(
      statisticsSettings,
      payload.statisticsSettings
    );
  }

  return { version: 1, lastModified, profiles, customThemes, statisticsSettings };
}

export abstract class ApiStorageHandler extends BaseStorageHandler {
  protected abstract setInternalSettings(storageSourceName: string): void;

  protected abstract ensureTitle(
    name?: string,
    parent?: string,
    readOnly?: boolean
  ): Promise<string>;

  protected abstract getExternalFiles(
    remoteTitleId: string,
    title: string
  ): Promise<ExternalFile[]>;

  protected abstract setRootFiles(): Promise<void>;

  protected abstract listRootFilesByPrefix(prefix: string): Promise<ExternalFile[]>;

  protected abstract retrieve(
    file: ExternalFile,
    typeToRetrieve: XMLHttpRequestResponseType,
    progressBase?: number
  ): Promise<any>;

  protected abstract upload(
    folderId: string,
    name: string,
    files: ExternalFile[],
    externalFile: ExternalFile | undefined,
    data: Blob | string | undefined,
    rootFilePrefix: string | undefined,
    progressBase: number | undefined,
    title: string
  ): Promise<ExternalFile>;

  protected abstract executeDelete(id: string): Promise<void>;

  protected authManager: StorageOAuthManager;

  protected rootId = '';

  protected titleToId = new Map<string, string>();

  protected titleToFiles = new Map<string, ExternalFile[]>();

  constructor(storageType: StorageKey, window: Window, refreshEndpoint: string) {
    super(window, storageType);
    this.authManager = new StorageOAuthManager(this.storageType, refreshEndpoint);
  }

  updateSettings(
    window: Window,
    isForBrowser: boolean,
    saveBehavior: ReplicationSaveBehavior,
    statisticsMergeMode: MergeMode,
    readingGoalsMergeMode: MergeMode,
    cacheStorageData: boolean,
    askForStorageUnlock: boolean,
    storageSourceName: string
  ) {
    this.window = window;
    this.isForBrowser = isForBrowser;
    this.saveBehavior = saveBehavior;
    this.cacheStorageData = cacheStorageData;
    this.askForStorageUnlock = askForStorageUnlock;
    this.statisticsMergeMode = statisticsMergeMode;
    this.readingGoalsMergeMode = readingGoalsMergeMode;
    this.setInternalSettings(storageSourceName);
  }

  clearData(clearAll = true) {
    this.titleToFiles.clear();
    this.rootFiles.clear();
    this.rootFileListFetched = false;

    if (clearAll) {
      this.rootId = '';
      this.titleToId.clear();
      this.titleToBookCard.clear();
      this.dataListFetched = false;
    }
  }

  /**
   * Force the next `getBookList()` to refetch presence metadata from the
   * server instead of serving the in-memory cache. Uses a full clear so
   * remotely deleted titles are pruned too (`getBookList()` only adds).
   * Metadata-only: folder listing + file names/thumbnails, no blob download.
   */
  invalidateBookListCache() {
    this.clearData(true);
  }

  async hasLocalBookData(context: ReplicationContext): Promise<boolean> {
    const data = await database.getDataByTitle(context.title);

    return !!data?.elementHtml;
  }

  async prepareBookForReading(context: ReplicationContext): Promise<number> {
    const data = await database.getDataByTitle(context.title);

    let idToReturn = 0;
    let bookData: Omit<BooksDbBookData, 'id'> | undefined = data;

    if (!bookData || !bookData.elementHtml) {
      const { file } = await this.getExternalFile('bookdata_', '', 1, true, context);

      bookData = file
        ? bookData || {
            title: context.title,
            styleSheet: '',
            elementHtml: '',
            blobs: {},
            coverImage: '',
            hasThumb: true,
            characters: 0,
            sections: [],
            lastBookModified: 0,
            lastBookOpen: 0,
            storageSource: undefined
          }
        : undefined;
    }

    if (!bookData) {
      throw new Error('No local or external book data found');
    }

    if (bookData.storageSource !== this.storageSourceName) {
      bookData.storageSource = this.storageSourceName;

      idToReturn = await getStorageHandler(
        this.window,
        StorageKey.BROWSER,
        undefined,
        true,
        this.cacheStorageData,
        ReplicationSaveBehavior.Overwrite
      ).saveBook(bookData, true, false, context);
    } else if (data?.id) {
      idToReturn = data.id;
    }

    return idToReturn;
  }

  async updateLastRead(book: BooksDbBookData, context: ReplicationContext) {
    // Recency is intentionally device-local. Updating it must not rewrite the
    // book payload in cloud storage.
    void book;
    void context;
  }

  async getFilenameForRecentCheck(fileIdentifier: string, context?: ReplicationContext) {
    if (this.saveBehavior === ReplicationSaveBehavior.Overwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    if (!this.validRootFiles.includes(fileIdentifier) && !context) {
      BaseStorageHandler.completeStep();
      return undefined;
    }

    const { file } = this.validRootFiles.includes(fileIdentifier)
      ? await this.getRootFile(fileIdentifier)
      : await this.getExternalFile(fileIdentifier, '', 1, true, context!);

    BaseStorageHandler.completeStep();

    return file?.name;
  }

  async isBookPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getExternalFile('bookdata_', '', 1, true, context);

    let isPresentAndUpToDate = false;

    if (file) {
      const { lastBookModified } = BaseStorageHandler.getBookMetadata(referenceFilename);
      const { lastBookModified: existingBookModified } = BaseStorageHandler.getBookMetadata(
        file.name
      );

      isPresentAndUpToDate = !!(
        existingBookModified &&
        lastBookModified &&
        existingBookModified >= lastBookModified
      );
    }

    BaseStorageHandler.completeStep();

    return isPresentAndUpToDate;
  }

  async isProgressPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getExternalFile('progress_', '', 1, true, context);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getProgressMetadata,
      'lastBookmarkModified',
      referenceFilename,
      file?.name
    );
  }

  async areStatisticsPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getExternalFile('statistics_', '', 1, true, context);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getStatisticsMetadata,
      'lastStatisticModified',
      referenceFilename,
      file?.name
    );
  }

  async areReadingGoalsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getRootFile(BaseStorageHandler.readingGoalsFilePrefix);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getReadingGoalsMetadata,
      'lastGoalModified',
      referenceFilename,
      file?.name
    );
  }

  async areProfilesPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getRootFile(BaseStorageHandler.profilesFilePrefix);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getProfilesMetadata,
      'lastProfilesModified',
      referenceFilename,
      file?.name
    );
  }

  async areBookTagsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getRootFile(BaseStorageHandler.bookTagsFilePrefix);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getBookTagsMetadata,
      'lastTagsModified',
      referenceFilename,
      file?.name
    );
  }

  async isAudioBookPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();

      return false;
    }

    const { file } = await this.getExternalFile(FilePrefix.AUDIO_BOOK, '', 1, true, context);

    return BaseStorageHandler.checkIsPresentAndUpToDate<BooksDbAudioBook>(
      BaseStorageHandler.getAudioBookMetadata,
      'lastAudioBookModified',
      referenceFilename,
      file?.name
    );
  }

  async isSubtitleDataPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();

      return false;
    }

    const { file } = await this.getExternalFile(FilePrefix.SUBTITLE, '', 1, true, context);

    return BaseStorageHandler.checkIsPresentAndUpToDate<BooksDbSubtitleData>(
      BaseStorageHandler.getSubtitleDataMetadata,
      'lastSubtitleDataModified',
      referenceFilename,
      file?.name
    );
  }

  async isUserBookmarksPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();

      return false;
    }

    const { file } = await this.getExternalFile(FilePrefix.USER_BOOKMARKS, '', 1, true, context);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getUserBookmarksMetadata,
      'lastUserBookmarksModified',
      referenceFilename,
      file?.name
    );
  }

  async listFilesWithPrefix(
    prefix: string,
    context: ReplicationContext
  ): Promise<{ name: string; revision?: string }[]> {
    // Metadata-only (''): no body download, served from the warmed
    // titleToFiles cache when available. Every prefix match is returned so
    // duplicate files stay visible to exact-state sync gates.
    const { files } = await this.getExternalFile(prefix, '', 1, true, context);

    return (files || [])
      .filter((entry) => entry.name.startsWith(prefix))
      .map((entry) =>
        entry.revision === undefined
          ? { name: entry.name }
          : { name: entry.name, revision: entry.revision }
      );
  }

  async getBook(context: ReplicationContext) {
    const { file, data } = await this.getExternalFile(
      'bookdata_',
      'blob',
      this.isForBrowser ? 0.7 : 1,
      true,
      context
    );

    if (!file) {
      return undefined;
    }

    return this.isForBrowser
      ? this.extractBookData(data, file.name, 0.3)
      : new File([data], file.name, { type: 'application/zip' });
  }

  async getProgress(context: ReplicationContext) {
    const { file, files, data } = await this.getExternalFile('progress_', 'json', 1, true, context);

    if (!file) {
      return undefined;
    }

    // Duplicate-aware (M4): concurrent uploads can leave several progress_
    // files behind one name race; resolve to the deterministic
    // (modifiedAt, deviceId) winner instead of first-match.
    let winner = data;
    let winnerName = file.name;
    const dupes = (files || []).filter(
      (entry) => entry.name.startsWith('progress_') && entry.id !== file.id
    );
    for (const dupe of dupes) {
      try {
        const candidate = await this.retrieve(dupe, 'json', 0.2);
        if (isPositionNewerThan(candidate, winner)) {
          winner = candidate;
          winnerName = dupe.name;
        }
      } catch {
        // Unreadable duplicates lose by default.
      }
    }

    return this.isForBrowser
      ? winner
      : new File([new Blob([JSON.stringify(winner)])], winnerName, { type: 'application/json' });
  }

  async getUserBookmarks(context: ReplicationContext) {
    const { file, files, data } = await this.getExternalFile(
      FilePrefix.USER_BOOKMARKS,
      'json',
      1,
      true,
      context
    );

    if (!file) {
      return undefined;
    }

    // Union across duplicate files (P6): bookmarks merge by stable identity
    // downstream, so every file's rows participate rather than first-match.
    let combined = Array.isArray(data) ? data : [];
    let winnerName = file.name;
    const dupes = (files || []).filter(
      (entry) => entry.name.startsWith(FilePrefix.USER_BOOKMARKS) && entry.id !== file.id
    );
    for (const dupe of dupes) {
      try {
        const candidate = await this.retrieve(dupe, 'json', 0.2);
        if (Array.isArray(candidate) && candidate.length) {
          combined = [...combined, ...candidate];
          winnerName = dupe.name;
        }
      } catch {
        // Unreadable duplicates are skipped.
      }
    }

    return this.isForBrowser
      ? combined
      : new File([new Blob([JSON.stringify(combined)])], winnerName, {
          type: 'application/json'
        });
  }

  async getStatistics(context: ReplicationContext) {
    const { file, data } = await this.getExternalFile('statistics_', 'json', 1, true, context);

    if (!file) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }

    return {
      statistics: data,
      lastStatisticModified: BaseStorageHandler.getStatisticsMetadata(file.name)
        .lastStatisticModified
    };
  }

  async getCover(context: ReplicationContext) {
    const ctx = context;
    if (ctx.imagePath instanceof Blob) {
      BaseStorageHandler.reportProgress();

      return ctx.imagePath;
    }

    const { data } = await this.getExternalFile('cover_', 'blob', 1, true, ctx);

    return data;
  }

  async getReadingGoals() {
    const { file, data } = await this.getRootFile(
      BaseStorageHandler.readingGoalsFilePrefix,
      'json'
    );

    if (!file) {
      return { readingGoals: undefined, lastGoalModified: 0 };
    }

    return {
      readingGoals: data,
      lastGoalModified: BaseStorageHandler.getReadingGoalsMetadata(file.name).lastGoalModified
    };
  }

  async getProfiles() {
    const { file, data } = await this.getRootFile(BaseStorageHandler.profilesFilePrefix, 'json');

    if (!file || !data) {
      return {
        profiles: undefined,
        customThemes: undefined,
        statisticsSettings: undefined,
        lastProfilesModified: 0
      };
    }

    const payload = data as ReaderProfilesSyncPayload;
    return {
      profiles: payload.profiles,
      customThemes: payload.customThemes,
      statisticsSettings: payload.statisticsSettings,
      lastProfilesModified: BaseStorageHandler.getProfilesMetadata(file.name).lastProfilesModified
    };
  }

  async getBookTags() {
    const { file, data } = await this.getRootFile(BaseStorageHandler.bookTagsFilePrefix, 'json');

    if (!file || !data) {
      return { tags: undefined, titles: undefined, lastTagsModified: 0, entries: undefined };
    }

    const payload = data as BookTagsSyncPayload;
    // v1 files carry no entries and must stay that way downstream: the
    // file's global timestamp is always fresher than any real per-title
    // edit, so synthesizing entries from the mirror here would outrank
    // genuine removals in the target merge and resurrect them. Dict-only
    // sources take the preserve-existing path in saveBookTags instead.
    const entries = payload.entries;

    return {
      tags: payload.tagsByTitle || dictFromEntries(entries),
      titles: payload.titles,
      lastTagsModified: BaseStorageHandler.getBookTagsMetadata(file.name).lastTagsModified,
      entries
    };
  }

  async getAudioBook(context: ReplicationContext) {
    const { file, data } = await this.getExternalFile(
      FilePrefix.AUDIO_BOOK,
      'json',
      1,
      true,
      context
    );

    if (!file) {
      return undefined;
    }

    return this.isForBrowser
      ? data
      : new File([new Blob([JSON.stringify(data)])], file.name, { type: 'application/json' });
  }

  async getSubtitleData(context: ReplicationContext) {
    const { file, data } = await this.getExternalFile(
      FilePrefix.SUBTITLE,
      'json',
      1,
      true,
      context
    );

    if (!file) {
      return undefined;
    }

    return this.isForBrowser
      ? data
      : new File([new Blob([JSON.stringify(data)])], file.name, { type: 'application/json' });
  }

  async saveBook(
    data: Omit<BooksDbBookData, 'id'> | File,
    skipTimestampFallback = true,
    _removeStorageContext = true,
    context: ReplicationContext
  ) {
    const ctx = context;
    const { titleId, files, file } = await this.getExternalFile('bookdata_', '', 0.2, false, ctx);
    const filename = BaseStorageHandler.getBookFileName(
      data,
      skipTimestampFallback ? '' : file?.name
    );
    const { characters, lastBookModified, lastBookOpen } =
      BaseStorageHandler.getBookMetadata(filename);

    if (file && this.saveBehavior === ReplicationSaveBehavior.NewOnly) {
      const { lastBookModified: existingBookModified } = BaseStorageHandler.getBookMetadata(
        file.name
      );

      if (existingBookModified && lastBookModified && existingBookModified >= lastBookModified) {
        return 0;
      }
    }

    if (data instanceof File) {
      await this.upload(titleId, filename, files, file, data, '', undefined, ctx.title);
    } else {
      await this.upload(
        titleId,
        filename,
        files,
        file,
        await this.zipBookData(data, 0.2),
        '',
        0.6,
        ctx.title
      );
    }

    this.addBookCard(ctx.title, { characters, lastBookModified, lastBookOpen });

    return 0;
  }

  async saveProgress(data: File | BooksDbBookmarkData, context: ReplicationContext) {
    const ctx = context;
    const filename = BaseStorageHandler.getProgressFileName(data);
    const progressData = data instanceof File ? data : JSON.stringify(data);
    const { titleId, files, file } = await this.getExternalFile('progress_', '', 0.2, false, ctx);
    const { lastBookmarkModified, progress } = BaseStorageHandler.getProgressMetadata(filename);

    // Defensive write-skip (no extra fetch: both names are already in
    // hand). The replicator's isProgressPresentAndUpToDate gate normally
    // guarantees saveProgress only runs when the source is strictly newer,
    // so this only fires for direct callers or same-timestamp races. A
    // filename match means identical (lastBookmarkModified, progress) — the
    // only uncovered difference is deviceId, which is display-identical and
    // self-heals on the next real edit. File pass-through payloads keep the
    // previous copy-through behavior.
    if (!(data instanceof File) && file?.name) {
      const existing = BaseStorageHandler.getProgressMetadata(file.name);

      if (
        existing.lastBookmarkModified === lastBookmarkModified &&
        existing.progress === progress
      ) {
        this.addBookCard(ctx.title, { lastBookmarkModified, progress });
        return;
      }
    }

    await this.upload(titleId, filename, files, file, progressData, '', undefined, ctx.title);

    this.addBookCard(ctx.title, { lastBookmarkModified, progress });
  }

  async saveUserBookmarks(data: File | BooksDbUserBookmarkData[], context: ReplicationContext) {
    const ctx = context;
    const isOverwrite = this.saveBehavior === ReplicationSaveBehavior.Overwrite;
    // Merging needs the array form on both sides; a File payload (this
    // handler acting as a pass-through between two non-browser stores) skips
    // the merge and falls back to the previous copy-through behavior.
    const incoming = data instanceof File ? undefined : data;

    const {
      titleId,
      files,
      file,
      data: existingData
    } = await this.getExternalFile(
      FilePrefix.USER_BOOKMARKS,
      !isOverwrite && incoming ? 'json' : '',
      0.2,
      false,
      ctx
    );

    // Phase 0 fix (tag/bookmark deletion-sync plan): this used to upload
    // `data` as-is. A device publishing without every remote row downloaded
    // first — the push-only exit-sync path in particular — would silently
    // erase whatever the remote side held that the local array didn't. Read
    // the existing file and union by the same identity rule the IndexedDB
    // download path already uses, so publish only ever adds knowledge.
    // Overwrite mode (one-shot recovery) still replaces the file wholesale.
    const toStore: File | BooksDbUserBookmarkData[] =
      !isOverwrite && incoming && Array.isArray(existingData)
        ? mergeUserBookmarkArrays(incoming, existingData as BooksDbUserBookmarkData[])
        : data;

    // Canonical write-skip: the merge above already pulled in every remote
    // row, so if the merged array equals the remote file order-independently
    // there is nothing new to publish. Uploading anyway would mint a new
    // filename and break the "no-op re-sync writes nothing" criterion.
    if (
      !isOverwrite &&
      !(toStore instanceof File) &&
      Array.isArray(existingData) &&
      areUserBookmarkArraysEqual(toStore, existingData as BooksDbUserBookmarkData[])
    ) {
      return;
    }

    const filename = BaseStorageHandler.getUserBookmarksFileName(toStore);
    const bookmarksData = toStore instanceof File ? toStore : JSON.stringify(toStore);

    await this.upload(titleId, filename, files, file, bookmarksData, '', undefined, ctx.title);
  }

  async saveStatistics(
    statistics: BooksDbStatistic[],
    lastStatisticModified: number,
    context: ReplicationContext
  ) {
    const ctx = context;
    const isMerge = this.statisticsMergeMode === MergeMode.MERGE;
    const {
      titleId,
      files,
      file,
      data: existingData
    } = await this.getExternalFile('statistics_', isMerge ? 'json' : '', 0.2, false, ctx);

    let statisticsToStore: BooksDbStatistic[] = statistics;
    let newStatisticModified = lastStatisticModified;

    if (isMerge) {
      statisticsToStore = mergeStatistics(
        statistics,
        existingData,
        this.saveBehavior === ReplicationSaveBehavior.NewOnly
      );
    }

    ({ statisticsToStore, newStatisticModified } = updateStatisticToStore(
      statisticsToStore,
      newStatisticModified
    ));

    const filename = BaseStorageHandler.getStatisticsFileName(
      statisticsToStore,
      newStatisticModified
    );

    await this.upload(
      titleId,
      filename,
      files,
      file,
      JSON.stringify(statisticsToStore),
      '',
      undefined,
      ctx.title
    );

    this.addBookCard(ctx.title, {});
  }

  /**
   * Statistics v2 remote side (P3/P4): every contribution file is overwritten
   * in place under its stable name, so file count stays bounded and no
   * stale-name cleanup (and its create-then-delete race) is ever needed.
   */
  async listContributionFiles(): Promise<StatisticContributionFile[]> {
    await this.ensureTitle();
    const entries = await this.listRootFilesByPrefix(BaseStorageHandler.contributionFilePrefix);
    const files: StatisticContributionFile[] = [];

    for (const entry of entries) {
      if (!isContributionFileName(entry.name)) continue;
      try {
        const payload = await this.retrieve(entry, 'json', 0.2);
        if (isContributionFile(payload)) files.push(payload);
      } catch {
        // A single unreadable file must not fail the whole pull.
      }
    }

    return files;
  }

  async writeContributionFiles(contributionFiles: StatisticContributionFile[]): Promise<void> {
    if (!contributionFiles.length) return;
    await withConflictRetry('Statistic contributions', async () => {
      await this.ensureTitle();
      const existing = await this.listRootFilesByPrefix(BaseStorageHandler.contributionFilePrefix);

      for (const payload of contributionFiles) {
        if (!isContributionFile(payload)) continue;
        const name = BaseStorageHandler.getContributionFileName(payload.deviceId, payload.year);
        const match = existing.find((entry) => entry.name === name);
        await this.upload(
          this.rootId,
          name,
          existing,
          match,
          JSON.stringify(payload),
          BaseStorageHandler.contributionFilePrefix,
          undefined,
          ''
        );
      }
    });

    await this.reconcileContributionFiles().catch((error: unknown) => {
      logger.warn(`Contribution files reconcile deferred: ${(error as Error)?.message}`);
    });
  }

  async listMigrationMarkers(): Promise<StatisticMigrationMarker[]> {
    await this.ensureTitle();
    const entries = await this.listRootFilesByPrefix(BaseStorageHandler.contributionFilePrefix);
    const markers: StatisticMigrationMarker[] = [];

    for (const entry of entries) {
      if (!isMigrationMarkerFileName(entry.name)) continue;
      try {
        const payload = await this.retrieve(entry, 'json', 0.1);
        if (isStatisticMigrationMarker(payload)) markers.push(payload);
      } catch {
        // Ignore unreadable markers; the tie-break uses the readable ones.
      }
    }

    return markers;
  }

  async writeMigrationMarker(marker: StatisticMigrationMarker): Promise<void> {
    if (!isStatisticMigrationMarker(marker)) return;
    await withConflictRetry('Migration marker', async () => {
      await this.ensureTitle();
      const existing = await this.listRootFilesByPrefix(BaseStorageHandler.contributionFilePrefix);
      const name = getMigrationMarkerFileName(marker.deviceId);
      const match = existing.find((entry) => entry.name === name);
      await this.upload(
        this.rootId,
        name,
        existing,
        match,
        JSON.stringify(marker),
        BaseStorageHandler.contributionFilePrefix,
        undefined,
        ''
      );
    });

    await this.reconcileContributionFiles().catch((error: unknown) => {
      logger.warn(`Migration marker reconcile deferred: ${(error as Error)?.message}`);
    });
  }

  async listLegacyStatisticSnapshots(): Promise<BooksDbStatistic[][]> {
    const cards = await this.getBookList().catch(() => []);
    const snapshots: BooksDbStatistic[][] = [];

    for (const card of cards) {
      try {
        const { statistics } = await this.getStatistics({ title: card.title, imagePath: '' });
        if (statistics?.length) snapshots.push(statistics);
      } catch {
        // Best-effort migration read: skip unreadable books.
      }
    }

    return snapshots;
  }

  async saveCover(data: Blob | undefined, context: ReplicationContext) {
    const ctx = context;
    if (!data) {
      BaseStorageHandler.reportProgress();
      return;
    }

    const { titleId, files, file } = await this.getExternalFile('cover_', '', 0.2, false, ctx);

    if (!file?.id) {
      const filename = await BaseStorageHandler.getCoverFileName(data);

      await this.upload(titleId, filename, files, undefined, data, '', undefined, ctx.title);
    }

    if (this.titleToBookCard.has(ctx.title)) {
      this.addBookCard(ctx.title, { imagePath: data });
    }
  }

  async saveReadingGoals(readingGoals: BooksDbReadingGoal[], lastGoalModified: number) {
    await withConflictRetry('Reading goals', async (attemptNumber) => {
      if (attemptNumber > 1) await this.refreshRootFiles();
      const isMerge = this.readingGoalsMergeMode === MergeMode.MERGE;
      const { file, data: existingData } = await this.getRootFile(
        BaseStorageHandler.readingGoalsFilePrefix,
        isMerge ? 'json' : '',
        0.2
      );

      let readingGoalsToStore: BooksDbReadingGoal[] = readingGoals;
      let newReadingGoalModified = lastGoalModified;

      if (isMerge) {
        ({ readingGoalsToStore, newReadingGoalModified } = mergeReadingGoals(
          readingGoals,
          existingData,
          this.saveBehavior === ReplicationSaveBehavior.NewOnly,
          lastGoalModified
        ));
      }

      const filename = BaseStorageHandler.getReadingGoalsFileName(newReadingGoalModified);

      readingGoalsToStore.sort(readingGoalSortFunction);

      await this.upload(
        this.rootId,
        filename,
        [],
        file,
        JSON.stringify(readingGoalsToStore),
        BaseStorageHandler.readingGoalsFilePrefix,
        undefined,
        ''
      );
    });

    await this.reconcileSingletonRootFile(
      BaseStorageHandler.readingGoalsFilePrefix,
      (raw) => (Array.isArray(raw) ? (raw as BooksDbReadingGoal[]) : undefined),
      (goalLists) => {
        let merged: BooksDbReadingGoal[] = [];
        let modified = 0;
        for (const goals of goalLists) {
          const result = mergeReadingGoals(goals, merged, false, modified);
          merged = result.readingGoalsToStore;
          modified = result.newReadingGoalModified;
        }
        merged.sort(readingGoalSortFunction);
        return {
          name: BaseStorageHandler.getReadingGoalsFileName(modified),
          body: JSON.stringify(merged)
        };
      }
    ).catch((error: unknown) => {
      logger.warn(`Reading-goals reconcile deferred: ${(error as Error)?.message}`);
    });
  }

  async saveProfiles(
    profiles: ReaderProfile[],
    lastProfilesModified: number,
    customThemes?: Record<string, ThemeOption>,
    statisticsSettings?: StatisticsSyncSection
  ) {
    await withConflictRetry('Reader profiles', async (attemptNumber) => {
      if (attemptNumber > 1) await this.refreshRootFiles();
      const isMerge = this.profilesMergeMode === MergeMode.MERGE;
      const { file, data: existingData } = await this.getRootFile(
        BaseStorageHandler.profilesFilePrefix,
        isMerge ? 'json' : '',
        0.2
      );

      let profilesToStore: ReaderProfile[] = profiles;
      let newProfilesModified = lastProfilesModified;
      let customThemesToStore = customThemes;
      let statisticsSettingsToStore = statisticsSettings;

      if (isMerge && existingData) {
        const existingPayload = existingData as ReaderProfilesSyncPayload;
        const result = mergeProfiles(
          existingPayload.profiles || [],
          profiles,
          this.saveBehavior === ReplicationSaveBehavior.NewOnly,
          lastProfilesModified
        );
        profilesToStore = result.mergedProfiles;
        newProfilesModified = result.newLastModified;
        if (existingPayload.customThemes) {
          customThemesToStore = {
            ...existingPayload.customThemes,
            ...(customThemes || {})
          };
        }
        statisticsSettingsToStore = newerStatisticsSettingsSection(
          existingPayload.statisticsSettings,
          statisticsSettings
        );
      }

      const filename = BaseStorageHandler.getProfilesFileName(newProfilesModified);
      const payload: ReaderProfilesSyncPayload = {
        version: 1,
        lastModified: newProfilesModified,
        profiles: profilesToStore,
        customThemes: customThemesToStore,
        statisticsSettings: statisticsSettingsToStore
      };

      await this.upload(
        this.rootId,
        filename,
        [],
        file,
        JSON.stringify(payload),
        BaseStorageHandler.profilesFilePrefix,
        undefined,
        ''
      );
    });

    await this.reconcileSingletonRootFile(
      BaseStorageHandler.profilesFilePrefix,
      (raw) => (isProfilesPayload(raw) ? raw : undefined),
      (payloads) => {
        const merged = mergeProfilesPayloads(payloads);
        const payload: ReaderProfilesSyncPayload = {
          version: 1,
          lastModified: merged.lastModified,
          profiles: merged.profiles,
          customThemes: merged.customThemes,
          statisticsSettings: merged.statisticsSettings
        };
        return {
          name: BaseStorageHandler.getProfilesFileName(merged.lastModified),
          body: JSON.stringify(payload)
        };
      }
    ).catch((error: unknown) => {
      logger.warn(`Profiles reconcile deferred: ${(error as Error)?.message}`);
    });
  }

  async saveBookTags(
    tags: BookTagsDict | File,
    titles: Record<string, string> | undefined,
    lastTagsModified: number,
    entries?: BookTagEntries
  ) {
    await withConflictRetry('Book tags', async (attemptNumber) => {
      if (attemptNumber > 1) await this.refreshRootFiles();
      const isOverwrite = this.saveBehavior === ReplicationSaveBehavior.Overwrite;
      const { file, data: existingData } = await this.getRootFile(
        BaseStorageHandler.bookTagsFilePrefix,
        isOverwrite ? '' : 'json',
        0.2
      );
      const existingPayload = !isOverwrite
        ? (existingData as BookTagsSyncPayload | undefined)
        : undefined;

      // Per-title last-write-wins over `entries`. The dict is only a
      // fallback for timestamp-less (v1-shape) sources: unknown keys are
      // adopted, existing entries — including empty-list removals — are
      // preserved, because a union cannot tell a new tag from a stale copy
      // of a removed one. Overwrite mode replaces the set wholesale.
      let entriesToStore: BookTagEntries;
      let titlesToStore = titles;
      if (isOverwrite) {
        entriesToStore =
          entries || entriesFromDict(tags instanceof File ? {} : tags, lastTagsModified, '');
      } else if (tags instanceof File) {
        entriesToStore = existingPayload?.entries
          ? { ...existingPayload.entries }
          : entriesFromDict(existingPayload?.tagsByTitle, existingPayload?.lastModified || 0, '');
      } else if (entries) {
        entriesToStore = existingPayload
          ? mergeTagEntries(
              existingPayload.entries ||
                entriesFromDict(existingPayload.tagsByTitle, existingPayload.lastModified || 0, ''),
              entries
            )
          : { ...entries };
      } else {
        entriesToStore = existingPayload
          ? mergeTagEntriesWithDict(
              existingPayload.entries ||
                entriesFromDict(existingPayload.tagsByTitle, existingPayload.lastModified || 0, ''),
              tags,
              lastTagsModified || existingPayload.lastModified || 0,
              ''
            )
          : entriesFromDict(tags, lastTagsModified, '');
      }
      if (!isOverwrite && existingPayload) {
        titlesToStore = mergeTagsTitles(existingPayload.titles, titlesToStore);
      }

      // Entry timestamps are real edit times from updateBookTags; Date.now()
      // stays a last-resort fallback so a no-op sync never mints a new file.
      const newTagsModified =
        Math.max(
          maxEntryModifiedAt(entriesToStore),
          lastTagsModified || 0,
          existingPayload?.lastModified || 0
        ) || Date.now();

      // Mirror for v1 readers, regenerated fresh every publish.
      const tagsToStore = dictFromEntries(entriesToStore);

      if (!isOverwrite && existingPayload) {
        // Canonical write-skip: an identical merge reproduces the remote
        // file exactly. Skip the upload so a no-op sync leaves file bytes
        // and filename untouched.
        if (
          isBookTagsPayloadUnchanged(
            existingPayload,
            tagsToStore,
            titlesToStore,
            newTagsModified,
            entriesToStore
          )
        ) {
          return;
        }
      }

      const filename = BaseStorageHandler.getBookTagsFileName(newTagsModified || Date.now());
      const payload: BookTagsSyncPayload = {
        version: 2,
        lastModified: newTagsModified || Date.now(),
        entries: entriesToStore,
        tagsByTitle: tagsToStore,
        titles: titlesToStore
      };

      await this.upload(
        this.rootId,
        filename,
        [],
        file,
        JSON.stringify(payload),
        BaseStorageHandler.bookTagsFilePrefix,
        undefined,
        ''
      );
    });

    await this.reconcileSingletonRootFile(
      BaseStorageHandler.bookTagsFilePrefix,
      (raw) => (isBookTagsPayload(raw) ? raw : undefined),
      (payloads) => {
        let mergedEntries: BookTagEntries = {};
        let titles: Record<string, string> | undefined;
        let lastModified = 0;
        for (const payload of payloads) {
          mergedEntries = mergeTagEntries(
            mergedEntries,
            payload.entries || entriesFromDict(payload.tagsByTitle, payload.lastModified || 0, '')
          );
          titles = mergeTagsTitles(titles, payload.titles);
          lastModified = Math.max(
            lastModified,
            payload.lastModified || 0,
            maxEntryModifiedAt(payload.entries)
          );
        }
        const merged: BookTagsSyncPayload = {
          version: 2,
          lastModified,
          entries: mergedEntries,
          tagsByTitle: dictFromEntries(mergedEntries),
          titles
        };
        return {
          name: BaseStorageHandler.getBookTagsFileName(lastModified || Date.now()),
          body: JSON.stringify(merged)
        };
      }
    ).catch((error: unknown) => {
      logger.warn(`Book-tags reconcile deferred: ${(error as Error)?.message}`);
    });
  }

  async saveAudioBook(data: BooksDbAudioBook | File, context: ReplicationContext) {
    const ctx = context;
    const filename = BaseStorageHandler.getAudioBookFileName(data);
    const audioBookData = data instanceof File ? data : JSON.stringify(data);
    const { titleId, files, file } = await this.getExternalFile(
      FilePrefix.AUDIO_BOOK,
      '',
      0.2,
      false,
      ctx
    );

    await this.upload(titleId, filename, files, file, audioBookData, '', undefined, ctx.title);
  }

  async saveSubtitleData(data: BooksDbSubtitleData | File, context: ReplicationContext) {
    const ctx = context;
    const filename = BaseStorageHandler.getSubtitleDataFileName(data);
    const subtitleData = data instanceof File ? data : JSON.stringify(data);
    const { titleId, files, file } = await this.getExternalFile(
      FilePrefix.SUBTITLE,
      '',
      0.2,
      false,
      ctx
    );

    await this.upload(titleId, filename, files, file, subtitleData, '', undefined, ctx.title);
  }

  async deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics = true
  ) {
    await this.ensureTitle();

    let error = '';

    const deleted: number[] = [];
    const deletionLimiter = pLimit(1);
    const deleteTasks: Promise<void>[] = [];

    replicationProgress$.next({ progressBase: 1, maxProgress: booksToDelete.length });

    booksToDelete.forEach((bookToDelete) =>
      deleteTasks.push(
        deletionLimiter(async () => {
          try {
            throwIfAborted(cancelSignal);

            // The in-memory id map is only populated by getBookList(). A
            // cloud-only book (or a stale singleton after source switch)
            // may not have an entry, so resolve it from the remote before
            // treating the title as deleted. Otherwise we would clear the
            // local cache while the remote folder survives, and the next
            // server fetch resurrects the book.
            let externalId = this.titleToId.get(bookToDelete);

            if (!externalId && this.rootId) {
              try {
                externalId = await this.ensureTitle(bookToDelete, this.rootId, true);
              } catch {
                externalId = undefined;
              }
            }

            if (externalId) {
              // List the folder's children so a folder delete can't leave
              // orphaned files behind (notably cover_*, which would
              // otherwise resurrect the folder as a ghost library item).
              // statistics_* replicas are preserved when the keep-statistics
              // setting is on, matching local deletion semantics.
              let childFiles: ExternalFile[] = this.titleToFiles.get(bookToDelete) || [];

              if (!childFiles.length) {
                try {
                  childFiles = await this.getExternalFiles(externalId, bookToDelete);
                } catch {
                  childFiles = [];
                }
              }

              const statisticsFiles = childFiles.filter((entry) =>
                entry.name.startsWith('statistics_')
              );
              const keepStatistics = keepLocalStatistics && statisticsFiles.length > 0;
              const filesToDelete = keepStatistics
                ? childFiles.filter((entry) => !entry.name.startsWith('statistics_'))
                : childFiles;

              for (let index = 0; index < filesToDelete.length; index += 1) {
                throwIfAborted(cancelSignal);

                try {
                  await this.executeDelete(filesToDelete[index].id);
                } catch (childError) {
                  // A stale cache entry (already-deleted remote file)
                  // shouldn't block removal of the remaining files.
                  // Record it and continue; the folder delete below still
                  // runs unless preservation applies.
                  error = handleErrorDuringReplication(
                    childError,
                    `Error deleting ${bookToDelete}: `,
                    []
                  );
                }
              }

              if (keepStatistics) {
                // Keep the statistics replica as a hidden archive: the
                // library card is removed below, but the folder id and
                // stats files stay cached so future stats syncs and
                // same-title re-imports can still merge them.
                this.titleToFiles.set(bookToDelete, statisticsFiles);
              } else {
                await this.executeDelete(externalId);
                this.titleToFiles.delete(bookToDelete);
                this.titleToId.delete(bookToDelete);
              }
            } else {
              this.titleToFiles.delete(bookToDelete);
              this.titleToId.delete(bookToDelete);
            }

            const deletedBookCard = this.titleToBookCard.get(bookToDelete);

            if (deletedBookCard) {
              deleted.push(deletedBookCard.id);
            }

            this.titleToBookCard.delete(bookToDelete);

            database.dataListChanged$.next(this);

            BaseStorageHandler.reportProgress();
          } catch (err) {
            error = handleErrorDuringReplication(err, `Error deleting ${bookToDelete}: `, [
              deletionLimiter
            ]);
          }
        })
      )
    );

    await Promise.all(deleteTasks).catch(() => {});

    // Force the next getBookList() to verify against the server instead of
    // serving the just-mutated cache. If a remote delete failed, the refetch
    // re-adds the title so the library reflects server truth.
    if (!error) {
      this.dataListFetched = false;
    }

    return { error, deleted };
  }

  protected async request(
    url: string,
    options: RequestOptions = {},
    type: XMLHttpRequestResponseType = 'json',
    progressBase = 1
  ): Promise<any> {
    const interactive = options.allowInteractiveAuth ?? false;
    let token = '';
    try {
      token =
        (await (options.skipAuth
          ? Promise.resolve('')
          : this.authManager.getToken(
              this.window,
              this.storageSourceName,
              interactive ? this.askForStorageUnlock : false,
              undefined,
              undefined,
              undefined,
              { allowInteractive: interactive }
            ))) || '';
    } catch (error: any) {
      // Silent background auth failure: never pop up. Record intent so the UI
      // can offer in-app re-auth and auto-retry the sync afterwards.
      setConnectionState(this.storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
      markPendingCloudSync(this.storageSourceName, error?.message || 'auth failed');
      throw error;
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.responseType = type;

      xhr.addEventListener('abort', () => {
        reject(new AbortError());
      });

      if (options.trackDownload) {
        const progressState = { lastValue: 0, base: progressBase };

        xhr.onprogress = (event: ProgressEvent) => {
          if (event.lengthComputable) {
            BaseStorageHandler.reportFunction(progressState, event.loaded, event.total);
          }
        };
      }

      if (options.trackUpload) {
        const progressState = { lastValue: 0, base: progressBase };

        xhr.upload.onprogress = (event: ProgressEvent) => {
          if (event.lengthComputable) {
            BaseStorageHandler.reportFunction(progressState, event.loaded, event.total);
          }
        };
      }

      xhr.addEventListener(
        'readystatechange',
        async function stateHandler() {
          if (this.readyState === 4) {
            if (this.status >= 200 && this.status < 400) {
              resolve(this.response);
            } else {
              const errorMessage = await convertAuthErrorResponse(this);

              if (this.status === 401) {
                storageOAuthTokens.delete(self.storageSourceName);
                setConnectionState(self.storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
                markPendingCloudSync(self.storageSourceName, errorMessage || 'unauthorized');
                logger.error(errorMessage);
                reject(
                  new Error(
                    `Session expired for "${self.storageSourceName}". Please reconnect to resume syncing.`
                  )
                );
              } else if (this.status === 404) {
                logger.error(errorMessage);
                reject(new Error('Resource not found. Refresh your current tab and try again'));
              } else if (this.status === 412) {
                logger.warn(`Write conflict for "${self.storageSourceName}": ${errorMessage}`);
                reject(
                  new ConflictError(
                    `Cloud file changed during sync (${errorMessage || 'precondition failed'}).`
                  )
                );
              } else {
                reject(new Error(errorMessage));
              }
            }
          }
        },
        false
      );

      xhr.open(options.method || 'GET', url, true);

      if (options.headers) {
        const entries = Object.entries(options.headers);

        for (let index = 0, { length } = entries; index < length; index += 1) {
          const [headerName, headerValue] = entries[index];

          xhr.setRequestHeader(headerName, headerValue);
        }
      }

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(options.body || null);
    });
  }

  protected async getExternalFile(
    fileIdentifier: string,
    typeToRetrieve: XMLHttpRequestResponseType = '',
    progressBase = 1,
    readOnly = true,
    context: ReplicationContext
  ) {
    const ctx = context;
    const progressPerStep = progressBase / 5;

    await this.ensureTitle();

    BaseStorageHandler.reportProgress(progressPerStep);

    const titleId = await this.ensureTitle(ctx.title, this.rootId, readOnly);

    BaseStorageHandler.reportProgress(progressPerStep);

    if (!titleId) {
      return { titleId: '', file: undefined, files: [], data: undefined };
    }

    const files = await this.getExternalFiles(titleId, ctx.title);
    const file = files.find((entry) => entry.name.startsWith(fileIdentifier));

    BaseStorageHandler.reportProgress(progressPerStep);

    if (!file) {
      return { titleId, file: undefined, files, data: undefined };
    }

    let data;

    if (typeToRetrieve) {
      data = await this.retrieve(file, typeToRetrieve, progressPerStep * 2);
    }

    return { titleId, file, files, data };
  }

  protected async getRootFile(
    fileIdentifier: string,
    typeToRetrieve: XMLHttpRequestResponseType = '',
    progressBase = 1
  ) {
    const progressPerStep = progressBase / 3;

    await this.ensureTitle();

    BaseStorageHandler.reportProgress(progressPerStep);

    await this.setRootFiles();

    const file = this.rootFiles.get(fileIdentifier);

    BaseStorageHandler.reportProgress(progressPerStep);

    if (!file) {
      return { file: undefined, data: undefined };
    }

    let data;

    if (typeToRetrieve) {
      data = await this.retrieve(file, typeToRetrieve, progressPerStep);
    }

    return { file, data };
  }

  /**
   * Drop the cached singleton root entry so the next read re-lists from the
   * provider. Used before conflict-retry attempts: retrying against a stale
   * etag would 412 forever instead of converging.
   */
  protected async refreshRootFiles(): Promise<void> {
    this.rootFiles.clear();
    this.rootFileListFetched = false;
    await this.setRootFiles();
  }

  /**
   * List-and-reconcile fallback (M3): providers without enforced write
   * preconditions (Drive v3 documents none) can end up with two live files
   * for a should-be-singleton root type after concurrent creates. Merge every
   * same-prefix file deterministically, keep the lowest id, delete the rest.
   * Also runs where preconditions exist, as repair for races the fast path
   * can't see (e.g. create/create with different timestamp names).
   */
  protected async reconcileSingletonRootFile<T>(
    prefix: string,
    parse: (raw: unknown) => T | undefined,
    mergeAll: (items: T[]) => { name: string; body: string }
  ): Promise<void> {
    await this.ensureTitle();
    const files = await this.listRootFilesByPrefix(prefix);
    if (files.length < 2) return;

    const parsed: { file: ExternalFile; item: T }[] = [];
    for (const file of files) {
      try {
        const item = parse(await this.retrieve(file, 'json', 0.1));
        if (item !== undefined) parsed.push({ file, item });
      } catch {
        // Unreadable duplicates are left for the next pass.
      }
    }
    if (parsed.length < 2) return;

    const merged = mergeAll(parsed.map((entry) => entry.item));
    const winner = [...parsed].sort((a, b) => (a.file.id < b.file.id ? -1 : 1))[0];
    await this.upload(
      this.rootId,
      merged.name,
      files,
      winner.file,
      merged.body,
      prefix,
      undefined,
      ''
    );
    for (const entry of parsed) {
      if (entry.file.id === winner.file.id) continue;
      await this.executeDelete(entry.file.id).catch(() => {});
    }
    this.rootFiles.set(prefix, { id: winner.file.id, name: merged.name });
  }

  /**
   * Repair duplicate v2/marker files sharing one stable name or device.
   * Contribution rows are unioned by key (never summed — same-device rows
   * are one device's data seen twice); marker baselines merge with the old
   * non-additive legacy merge.
   */
  protected async reconcileContributionFiles(): Promise<void> {
    await this.ensureTitle();
    const files = await this.listRootFilesByPrefix(BaseStorageHandler.contributionFilePrefix);
    const byName = new Map<string, ExternalFile[]>();
    for (const file of files) {
      const list = byName.get(file.name);
      if (list) list.push(file);
      else byName.set(file.name, [file]);
    }

    for (const [name, dupes] of byName) {
      if (dupes.length < 2) continue;
      if (isContributionFileName(name)) {
        await this.reconcileContributionGroup(name, dupes, files);
      } else if (isMigrationMarkerFileName(name)) {
        await this.reconcileMarkerGroup(dupes, files);
      }
    }

    // Same-device markers under different names: keep the lowest id per
    // device so the migration tie-break sees one claim each.
    const markersByDevice = new Map<
      string,
      { file: ExternalFile; item: StatisticMigrationMarker }[]
    >();
    for (const file of files) {
      const deviceId = parseMigrationMarkerFileName(file.name);
      if (!deviceId) continue;
      try {
        const item = await this.retrieve(file, 'json', 0.1);
        if (!isStatisticMigrationMarker(item)) continue;
        const list = markersByDevice.get(deviceId);
        if (list) list.push({ file, item });
        else markersByDevice.set(deviceId, [{ file, item }]);
      } catch {
        // Skip unreadable markers.
      }
    }
    for (const [, group] of markersByDevice) {
      if (group.length < 2) continue;
      const winner = [...group].sort((a, b) => (a.file.id < b.file.id ? -1 : 1))[0];
      for (const entry of group) {
        if (entry.file.id === winner.file.id) continue;
        await this.executeDelete(entry.file.id).catch(() => {});
      }
    }
  }

  private async reconcileContributionGroup(
    name: string,
    dupes: ExternalFile[],
    files: ExternalFile[]
  ): Promise<void> {
    const parsed = parseContributionFileName(name);
    if (!parsed) return;
    const payloads: StatisticContributionFile[] = [];
    for (const file of dupes) {
      try {
        const payload = await this.retrieve(file, 'json', 0.1);
        if (isContributionFile(payload)) payloads.push(payload);
      } catch {
        // Skip unreadable duplicates.
      }
    }
    if (payloads.length < 2) return;

    const byKey = new Map<string, BooksDbStatisticContribution>();
    for (const payload of payloads) {
      for (const row of payload.rows) {
        if (!row?.title || !row?.dateKey) continue;
        const key = `${row.title}::${row.dateKey}`;
        const current = byKey.get(key);
        if (!current || (row.revision || 0) > (current.revision || 0)) {
          byKey.set(key, row);
        }
      }
    }
    const rows = [...byKey.values()];
    const merged: StatisticContributionFile = {
      format: payloads[0].format,
      version: payloads[0].version,
      deviceId: parsed.deviceId,
      year: parsed.year,
      revision: Math.max(0, ...payloads.map((payload) => payload.revision || 0)),
      rows
    };
    const winner = [...dupes].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    await this.upload(
      this.rootId,
      name,
      files,
      winner,
      JSON.stringify(merged),
      BaseStorageHandler.contributionFilePrefix,
      undefined,
      ''
    );
    for (const file of dupes) {
      if (file.id === winner.id) continue;
      await this.executeDelete(file.id).catch(() => {});
    }
  }

  private async reconcileMarkerGroup(dupes: ExternalFile[], files: ExternalFile[]): Promise<void> {
    const payloads: StatisticMigrationMarker[] = [];
    for (const file of dupes) {
      try {
        const payload = await this.retrieve(file, 'json', 0.1);
        if (isStatisticMigrationMarker(payload)) payloads.push(payload);
      } catch {
        // Skip unreadable duplicates.
      }
    }
    if (payloads.length < 2) return;

    const deviceId = payloads[0].deviceId;
    const merged: StatisticMigrationMarker = {
      format: payloads[0].format,
      version: payloads[0].version,
      deviceId,
      completedAt: Math.min(...payloads.map((payload) => payload.completedAt)),
      baselineRows: mergeLegacySnapshotRows(payloads.map((payload) => payload.baselineRows))
    };
    const winner = [...dupes].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    await this.upload(
      this.rootId,
      getMigrationMarkerFileName(deviceId),
      files,
      winner,
      JSON.stringify(merged),
      BaseStorageHandler.contributionFilePrefix,
      undefined,
      ''
    );
    for (const file of dupes) {
      if (file.id === winner.id) continue;
      await this.executeDelete(file.id).catch(() => {});
    }
  }

  protected updateAfterUpload(
    id: string,
    name: string,
    files: ExternalFile[],
    remoteFile: ExternalFile | undefined,
    extraData = {},
    rootFilePrefix: string | undefined,
    title: string
  ) {
    if (rootFilePrefix) {
      const { revision } = extraData as { revision?: string };
      this.rootFiles.set(
        rootFilePrefix,
        revision === undefined ? { id, name } : { id, name, revision }
      );
    } else if (remoteFile) {
      const { revision } = extraData as { revision?: string };
      const titleFiles = files.map((file) => {
        const updatedFile = file;
        if (file.name === remoteFile.name) {
          updatedFile.name = name;
          if (revision !== undefined) updatedFile.revision = revision;
        }

        return updatedFile;
      });

      this.titleToFiles.set(title, titleFiles);
    } else {
      files.push({ id, name, ...extraData });

      this.titleToFiles.set(title, files);
    }
  }

  async deleteBookProgressAndStats(title: string): Promise<void> {
    await this.ensureTitle();
    const titleId = await this.ensureTitle(title, this.rootId, true);
    if (!titleId) return;

    const files = await this.getExternalFiles(titleId, title);
    const progressFiles = files.filter(
      (f) => f.name.startsWith('progress_') || f.name.startsWith('statistics_')
    );

    for (const file of progressFiles) {
      try {
        await this.executeDelete(file.id);
      } catch (err) {
        logger.warn(`Failed to delete ${file.name} for ${title}:`, err);
      }
    }

    const remainingFiles = files.filter(
      (f) => !f.name.startsWith('progress_') && !f.name.startsWith('statistics_')
    );
    this.titleToFiles.set(title, remainingFiles);

    const card = this.titleToBookCard.get(title);
    if (card) {
      this.addBookCard(title, { progress: 0, lastBookmarkModified: 0 });
    }
  }
}
