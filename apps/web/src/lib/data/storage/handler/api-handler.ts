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
  BooksDbSubtitleData,
  BooksDbUserBookmarkData
} from '$lib/data/database/books-db/versions/books-db';
import {
  mergeTagsDicts,
  mergeTagsTitles,
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
  handleErrorDuringReplication
} from '$lib/functions/replication/error-handler';
import { AbortError, throwIfAborted } from '$lib/functions/replication/replication-error';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import { mergeStatistics, updateStatisticToStore } from '$lib/functions/statistic-util';
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
    const { titleId, files, file } = await this.getExternalFile(
      'bookdata_',
      '',
      0.2,
      false,
      context
    );

    if (!file) {
      return;
    }

    const filename = BaseStorageHandler.getBookFileName(book);
    const { characters, lastBookModified, lastBookOpen } =
      BaseStorageHandler.getBookMetadata(filename);

    await this.upload(titleId, filename, files, file, undefined, '', undefined, context.title);

    this.addBookCard(context.title, { characters, lastBookModified, lastBookOpen });
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
      const { lastBookModified, lastBookOpen } =
        BaseStorageHandler.getBookMetadata(referenceFilename);
      const { lastBookModified: existingBookModified, lastBookOpen: existingBookOpen } =
        BaseStorageHandler.getBookMetadata(file.name);

      isPresentAndUpToDate = !!(
        existingBookModified &&
        lastBookModified &&
        existingBookModified >= lastBookModified &&
        (existingBookOpen || 0) >= (lastBookOpen || 0)
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
    const { file, data } = await this.getExternalFile('progress_', 'json', 1, true, context);

    if (!file) {
      return undefined;
    }

    return this.isForBrowser
      ? data
      : new File([new Blob([JSON.stringify(data)])], file.name, { type: 'application/json' });
  }

  async getUserBookmarks(context: ReplicationContext) {
    const { file, data } = await this.getExternalFile(
      FilePrefix.USER_BOOKMARKS,
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
      return { tags: undefined, titles: undefined, lastTagsModified: 0 };
    }

    const payload = data as BookTagsSyncPayload;

    return {
      tags: payload.tagsByTitle,
      titles: payload.titles,
      lastTagsModified: BaseStorageHandler.getBookTagsMetadata(file.name).lastTagsModified
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
      const { lastBookModified: existingBookModified, lastBookOpen: existingBookOpen } =
        BaseStorageHandler.getBookMetadata(file.name);

      if (
        existingBookModified &&
        lastBookModified &&
        existingBookModified >= lastBookModified &&
        (existingBookOpen || 0) >= (lastBookOpen || 0)
      ) {
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

    await this.upload(titleId, filename, files, file, progressData, '', undefined, ctx.title);

    this.addBookCard(ctx.title, { lastBookmarkModified, progress });
  }

  async saveUserBookmarks(data: File | BooksDbUserBookmarkData[], context: ReplicationContext) {
    const ctx = context;
    const filename = BaseStorageHandler.getUserBookmarksFileName(data);
    const bookmarksData = data instanceof File ? data : JSON.stringify(data);
    const { titleId, files, file } = await this.getExternalFile(
      FilePrefix.USER_BOOKMARKS,
      '',
      0.2,
      false,
      ctx
    );

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
  }

  async saveProfiles(
    profiles: ReaderProfile[],
    lastProfilesModified: number,
    customThemes?: Record<string, ThemeOption>,
    statisticsSettings?: StatisticsSyncSection
  ) {
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
  }

  async saveBookTags(
    tags: BookTagsDict | File,
    titles: Record<string, string> | undefined,
    lastTagsModified: number
  ) {
    const isOverwrite = this.saveBehavior === ReplicationSaveBehavior.Overwrite;
    const { file, data: existingData } = await this.getRootFile(
      BaseStorageHandler.bookTagsFilePrefix,
      isOverwrite ? '' : 'json',
      0.2
    );

    let tagsToStore: BookTagsDict = tags instanceof File ? {} : tags;
    let titlesToStore = titles;
    let newTagsModified = lastTagsModified;

    if (!isOverwrite && existingData) {
      const existingPayload = existingData as BookTagsSyncPayload;
      tagsToStore = mergeTagsDicts(existingPayload.tagsByTitle, tagsToStore);
      titlesToStore = mergeTagsTitles(existingPayload.titles, titlesToStore);
      newTagsModified = Math.max(
        existingPayload.lastModified || 0,
        lastTagsModified || 0,
        Date.now()
      );
    }

    const filename = BaseStorageHandler.getBookTagsFileName(newTagsModified || Date.now());
    const payload: BookTagsSyncPayload = {
      version: 1,
      lastModified: newTagsModified || Date.now(),
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
      this.rootFiles.set(rootFilePrefix, { id, name });
    } else if (remoteFile) {
      const titleFiles = files.map((file) => {
        const updatedFile = file;
        if (file.name === remoteFile.name) {
          updatedFile.name = name;
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
