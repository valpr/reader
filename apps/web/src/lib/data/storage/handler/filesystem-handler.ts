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
import { database, fsStorageSource$ } from '$lib/data/store';
import {
  mergeTagsDicts,
  mergeTagsTitles,
  type BookTagsDict,
  type BookTagsSyncPayload
} from '$lib/data/book-tags';
import { mergeProfiles, newerStatisticsSettingsSection } from '$lib/data/profiles/profile-manager';
import type {
  ReaderProfile,
  ReaderProfilesSyncPayload,
  StatisticsSyncSection
} from '$lib/data/profiles/profile-types';
import { mergeReadingGoals, readingGoalSortFunction } from '$lib/data/reading-goal';
import type { ThemeOption } from '$lib/data/theme-option';
import { mergeStatistics, updateStatisticToStore } from '$lib/functions/statistic-util';

import { BaseStorageHandler, FilePrefix } from '$lib/data/storage/handler/base-handler';
import type { BookCardProps } from '$lib/components/book-card/book-card-props';
import { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { StorageKey } from '$lib/data/storage/storage-types';
import StorageUnlock from '$lib/components/storage-unlock.svelte';
import {
  isRemoteContext,
  type StorageUnlockAction
} from '$lib/data/storage/storage-source-manager';
import { dialogManager } from '$lib/data/dialog-manager';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import pLimit from 'p-limit';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import { throwIfAborted } from '$lib/functions/replication/replication-error';

export class FilesystemStorageHandler extends BaseStorageHandler {
  private rootDirectory: FileSystemDirectoryHandle | undefined;

  private titleToDirectory = new Map<string, FileSystemDirectoryHandle>();

  private titleToFiles = new Map<string, FileSystemFileHandle[]>();

  private rootFileHandles = new Map<string, FileSystemFileHandle>();

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
    this.statisticsMergeMode = statisticsMergeMode;
    this.readingGoalsMergeMode = readingGoalsMergeMode;
    this.cacheStorageData = cacheStorageData;
    this.askForStorageUnlock = askForStorageUnlock;

    const newStorageSource = storageSourceName || fsStorageSource$.getValue();

    if (newStorageSource !== this.storageSourceName) {
      this.clearData();
    }

    this.storageSourceName = newStorageSource;
  }

  async getBookList() {
    if (!this.dataListFetched) {
      database.listLoading$.next(true);

      const rootDirectory = await this.ensureRoot();
      const directories = (await FilesystemStorageHandler.list(
        rootDirectory,
        true
      )) as FileSystemDirectoryHandle[];

      await this.setTitleData(directories);

      this.dataListFetched = true;
    }

    return [...this.titleToBookCard.values()];
  }

  async checkHasData(): Promise<{ connected: boolean; hasData: boolean }> {
    const fsSource = this.storageSourceName || fsStorageSource$.getValue();
    if (!fsSource || !(this.window && 'showDirectoryPicker' in this.window)) {
      return { connected: false, hasData: false };
    }
    return { connected: true, hasData: true };
  }

  clearData(clearAll = true) {
    this.titleToFiles.clear();
    this.rootFileHandles.clear();
    this.rootFiles.clear();
    this.rootFileListFetched = false;

    if (clearAll) {
      this.rootDirectory = undefined;
      this.titleToDirectory.clear();
      this.titleToBookCard.clear();
      this.dataListFetched = false;
    }
  }

  async prepareBookForReading(context: ReplicationContext): Promise<number> {
    const book = await database.getDataByTitle(context.title);

    let idToReturn = 0;
    let data: Omit<BooksDbBookData, 'id'> | undefined = book;

    if (!data || !data.elementHtml) {
      const { file } = await this.getExternalFile('bookdata_', 1, context);

      data = file
        ? data || {
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

    if (!data) {
      throw new Error('No local or external book data found');
    }

    if (data.storageSource !== this.storageSourceName) {
      data.storageSource = this.storageSourceName;

      idToReturn = await getStorageHandler(
        this.window,
        StorageKey.BROWSER,
        undefined,
        true,
        this.cacheStorageData,
        ReplicationSaveBehavior.Overwrite
      ).saveBook(data, true, false, context);
    } else if (book?.id) {
      idToReturn = book.id;
    }

    return idToReturn;
  }

  async updateLastRead(book: BooksDbBookData, context: ReplicationContext) {
    const { file, files, rootDirectory } = await this.getExternalFile('bookdata_', 1, context);

    if (!file) {
      return;
    }

    const bookData = await file.getFile();
    const filename = BaseStorageHandler.getBookFileName(book);
    const { characters, lastBookModified, lastBookOpen } =
      BaseStorageHandler.getBookMetadata(filename);

    await this.writeFile(
      rootDirectory,
      filename,
      bookData,
      files,
      file,
      0.4,
      undefined,
      context.title
    );

    this.addBookCard(context.title, { characters, lastBookModified, lastBookOpen });
  }

  async getFilenameForRecentCheck(fileIdentifier: string, context?: ReplicationContext) {
    if (this.saveBehavior === ReplicationSaveBehavior.Overwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    if (!this.validRootFiles.includes(fileIdentifier) && !context) {
      return undefined;
    }

    const { file } = this.validRootFiles.includes(fileIdentifier)
      ? await this.getRootFile(fileIdentifier)
      : await this.getExternalFile(fileIdentifier, 1, context!);

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

    const { file } = await this.getExternalFile('bookdata_', 1, context);

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

    const { file } = await this.getExternalFile('progress_', 1, context);

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

    const { file } = await this.getExternalFile('statistics_', 1, context);

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

    const { file } = await this.getExternalFile(FilePrefix.AUDIO_BOOK, 1, context);

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

    const { file } = await this.getExternalFile(FilePrefix.SUBTITLE, 1, context);

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

    const { file } = await this.getExternalFile(FilePrefix.USER_BOOKMARKS, 1, context);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getUserBookmarksMetadata,
      'lastUserBookmarksModified',
      referenceFilename,
      file?.name
    );
  }

  async getBook(context: ReplicationContext) {
    const { file } = await this.getExternalFile(
      'bookdata_',
      this.isForBrowser ? 0.4 : 0.8,
      context
    );

    if (!file) {
      return undefined;
    }

    const bookFile = await file.getFile();

    return this.isForBrowser ? this.extractBookData(bookFile, bookFile.name, 0.6) : bookFile;
  }

  async getProgress(context: ReplicationContext) {
    const { file } = await this.getExternalFile(
      'progress_',
      this.isForBrowser ? 0.6 : 0.8,
      context
    );

    if (!file) {
      return undefined;
    }

    const progressFile = await file.getFile();

    if (this.isForBrowser) {
      const progress = JSON.parse(await FilesystemStorageHandler.readFileObject(progressFile));

      BaseStorageHandler.reportProgress(0.4);
      return progress;
    }

    return progressFile;
  }

  async getStatistics(context: ReplicationContext) {
    const { file } = await this.getExternalFile('statistics_', 0.6, context);

    if (!file) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }

    const statisticsFile = await file.getFile();
    const statisticsFileData = await FilesystemStorageHandler.readFileObject(statisticsFile);
    const statistics = JSON.parse(statisticsFileData);

    BaseStorageHandler.reportProgress(0.4);

    return {
      statistics,
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

    const { file } = await this.getExternalFile('cover_', 0.8, context);

    if (!file) {
      return undefined;
    }

    const cover = await file.getFile();

    return cover;
  }

  async getReadingGoals() {
    const { file } = await this.getRootFile(BaseStorageHandler.readingGoalsFilePrefix, 0.6);

    if (!file) {
      return { readingGoals: undefined, lastGoalModified: 0 };
    }

    const readingGoalsFile = await file.getFile();
    const readingGoalsFileData = await FilesystemStorageHandler.readFileObject(readingGoalsFile);
    const readingGoals = JSON.parse(readingGoalsFileData);

    BaseStorageHandler.reportProgress(0.4);

    return {
      readingGoals,
      lastGoalModified: BaseStorageHandler.getReadingGoalsMetadata(file.name).lastGoalModified
    };
  }

  async getProfiles() {
    const { file } = await this.getRootFile(BaseStorageHandler.profilesFilePrefix, 0.6);

    if (!file) {
      return {
        profiles: undefined,
        customThemes: undefined,
        statisticsSettings: undefined,
        lastProfilesModified: 0
      };
    }

    const profilesFile = await file.getFile();
    const profilesFileData = await FilesystemStorageHandler.readFileObject(profilesFile);
    const payload = JSON.parse(profilesFileData) as ReaderProfilesSyncPayload;

    BaseStorageHandler.reportProgress(0.4);

    return {
      profiles: payload?.profiles,
      customThemes: payload?.customThemes,
      statisticsSettings: payload?.statisticsSettings,
      lastProfilesModified: BaseStorageHandler.getProfilesMetadata(file.name).lastProfilesModified
    };
  }

  async getBookTags() {
    const { file } = await this.getRootFile(BaseStorageHandler.bookTagsFilePrefix, 0.6);

    if (!file) {
      return { tags: undefined, titles: undefined, lastTagsModified: 0 };
    }

    const tagsFile = await file.getFile();
    const tagsFileData = await FilesystemStorageHandler.readFileObject(tagsFile);
    const payload = JSON.parse(tagsFileData) as BookTagsSyncPayload;

    BaseStorageHandler.reportProgress(0.4);

    return {
      tags: payload?.tagsByTitle,
      titles: payload?.titles,
      lastTagsModified: BaseStorageHandler.getBookTagsMetadata(file.name).lastTagsModified
    };
  }

  async getAudioBook(context: ReplicationContext) {
    const { file } = await this.getExternalFile(
      FilePrefix.AUDIO_BOOK,
      this.isForBrowser ? 0.6 : 0.8,
      context
    );

    if (!file) {
      return undefined;
    }

    const audioBookFile = await file.getFile();

    if (this.isForBrowser) {
      const audioBook = JSON.parse(await FilesystemStorageHandler.readFileObject(audioBookFile));

      BaseStorageHandler.reportProgress(0.4);
      return audioBook;
    }

    return audioBookFile;
  }

  async getSubtitleData(context: ReplicationContext) {
    const { file } = await this.getExternalFile(
      FilePrefix.SUBTITLE,
      this.isForBrowser ? 0.6 : 0.8,
      context
    );

    if (!file) {
      return undefined;
    }

    const subtitleDataFile = await file.getFile();

    if (this.isForBrowser) {
      const subtitleData = JSON.parse(
        await FilesystemStorageHandler.readFileObject(subtitleDataFile)
      );

      BaseStorageHandler.reportProgress(0.4);
      return subtitleData;
    }

    return subtitleDataFile;
  }

  async getUserBookmarks(context: ReplicationContext) {
    const { file } = await this.getExternalFile(
      FilePrefix.USER_BOOKMARKS,
      this.isForBrowser ? 0.6 : 0.8,
      context
    );

    if (!file) {
      return undefined;
    }

    const ubFile = await file.getFile();

    if (this.isForBrowser) {
      const ub = JSON.parse(await FilesystemStorageHandler.readFileObject(ubFile));

      BaseStorageHandler.reportProgress(0.4);
      return ub;
    }

    return ubFile;
  }

  async saveBook(
    data: Omit<BooksDbBookData, 'id'> | File,
    skipTimestampFallback = true,
    _removeStorageContext = true,
    context: ReplicationContext
  ) {
    const ctx = context;
    const isFile = data instanceof File;
    const { file, files, rootDirectory } = await this.getExternalFile('bookdata_', 0.2, context);
    const filename = BaseStorageHandler.getBookFileName(
      data,
      file && skipTimestampFallback ? '' : file?.name
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

    let bookData;

    if (isFile) {
      bookData = data;
      BaseStorageHandler.reportProgress(0.2);
    } else {
      bookData = await this.zipBookData(data, 0.4);
    }

    await this.writeFile(
      rootDirectory,
      filename,
      bookData,
      files,
      file,
      isFile ? 0.6 : 0.4,
      undefined,
      ctx.title
    );

    this.addBookCard(ctx.title, { characters, lastBookModified, lastBookOpen });

    return 0;
  }

  async saveProgress(data: BooksDbBookmarkData | File, context: ReplicationContext) {
    const ctx = context;
    const filename = BaseStorageHandler.getProgressFileName(data);
    const { lastBookmarkModified, progress } = BaseStorageHandler.getProgressMetadata(filename);
    const { file, files, rootDirectory } = await this.getExternalFile('progress_', 0.4, context);

    await this.writeFile(
      rootDirectory,
      filename,
      data instanceof File ? data : JSON.stringify(data),
      files,
      file,
      0.6,
      undefined,
      ctx.title
    );

    this.addBookCard(ctx.title, { lastBookmarkModified, progress });
  }

  async saveUserBookmarks(data: BooksDbUserBookmarkData[] | File, context: ReplicationContext) {
    const filename = BaseStorageHandler.getUserBookmarksFileName(data);
    const { file, files, rootDirectory } = await this.getExternalFile(
      FilePrefix.USER_BOOKMARKS,
      0.4,
      context
    );

    await this.writeFile(
      rootDirectory,
      filename,
      data instanceof File ? data : JSON.stringify(data),
      files,
      file,
      0.6,
      undefined,
      context.title
    );
  }

  async saveStatistics(
    statistics: BooksDbStatistic[],
    lastStatisticModified: number,
    context: ReplicationContext
  ) {
    const ctx = context;
    const isMerge = this.statisticsMergeMode === MergeMode.MERGE;
    const { file, files, rootDirectory } = await this.getExternalFile('statistics_', 0.4, context);

    let statisticsToStore: BooksDbStatistic[] = statistics;
    let newStatisticModified = lastStatisticModified;

    if (isMerge) {
      let existingData = [];

      if (file) {
        const existingDataFile = await file.getFile();

        existingData = JSON.parse(await FilesystemStorageHandler.readFileObject(existingDataFile));
      }

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

    await this.writeFile(
      rootDirectory,
      filename,
      JSON.stringify(statisticsToStore),
      files,
      file,
      0.6,
      undefined,
      ctx.title
    );

    this.addBookCard(ctx.title, {});
  }

  async saveCover(data: Blob | undefined, context: ReplicationContext) {
    if (!data) {
      BaseStorageHandler.reportProgress();
      return;
    }

    const ctx = context;
    const { file, files, rootDirectory } = await this.getExternalFile('cover_', 0.4, context);

    if (!file) {
      const filename = await BaseStorageHandler.getCoverFileName(data);

      await this.writeFile(
        rootDirectory,
        filename,
        data,
        files,
        undefined,
        0.6,
        undefined,
        ctx.title
      );
    }

    if (this.titleToBookCard.has(ctx.title)) {
      this.addBookCard(ctx.title, { imagePath: data });
    }
  }

  async saveReadingGoals(readingGoals: BooksDbReadingGoal[], lastGoalModified: number) {
    const isMerge = this.readingGoalsMergeMode === MergeMode.MERGE;
    const { file, rootDirectory } = await this.getRootFile(
      BaseStorageHandler.readingGoalsFilePrefix,
      0.4
    );

    let readingGoalsToStore: BooksDbReadingGoal[] = readingGoals;
    let newReadingGoalModified = lastGoalModified;

    if (isMerge) {
      let existingData = [];

      if (file) {
        const existingDataFile = await file.getFile();

        existingData = JSON.parse(await FilesystemStorageHandler.readFileObject(existingDataFile));
      }

      ({ readingGoalsToStore, newReadingGoalModified } = mergeReadingGoals(
        readingGoals,
        existingData,
        this.saveBehavior === ReplicationSaveBehavior.NewOnly,
        lastGoalModified
      ));
    }

    readingGoalsToStore.sort(readingGoalSortFunction);

    const filename = BaseStorageHandler.getReadingGoalsFileName(newReadingGoalModified);

    await this.writeFile(
      rootDirectory,
      filename,
      JSON.stringify(readingGoalsToStore),
      [],
      file,
      0.6,
      BaseStorageHandler.readingGoalsFilePrefix
    );
  }

  async saveProfiles(
    profiles: ReaderProfile[],
    lastProfilesModified: number,
    customThemes?: Record<string, ThemeOption>,
    statisticsSettings?: StatisticsSyncSection
  ) {
    const isMerge = this.profilesMergeMode === MergeMode.MERGE;
    const { file, rootDirectory } = await this.getRootFile(
      BaseStorageHandler.profilesFilePrefix,
      0.4
    );

    let profilesToStore: ReaderProfile[] = profiles;
    let newProfilesModified = lastProfilesModified;
    let customThemesToStore = customThemes;
    let statisticsSettingsToStore = statisticsSettings;

    if (isMerge) {
      let existingPayload: ReaderProfilesSyncPayload | undefined;

      if (file) {
        const existingDataFile = await file.getFile();
        existingPayload = JSON.parse(
          await FilesystemStorageHandler.readFileObject(existingDataFile)
        ) as ReaderProfilesSyncPayload;
      }

      const result = mergeProfiles(
        existingPayload?.profiles || [],
        profiles,
        this.saveBehavior === ReplicationSaveBehavior.NewOnly,
        lastProfilesModified
      );
      profilesToStore = result.mergedProfiles;
      newProfilesModified = result.newLastModified;
      if (existingPayload?.customThemes) {
        customThemesToStore = {
          ...existingPayload.customThemes,
          ...(customThemes || {})
        };
      }
      statisticsSettingsToStore = newerStatisticsSettingsSection(
        existingPayload?.statisticsSettings,
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

    await this.writeFile(
      rootDirectory,
      filename,
      JSON.stringify(payload),
      [],
      file,
      0.6,
      BaseStorageHandler.profilesFilePrefix
    );
  }

  async saveBookTags(
    tags: BookTagsDict | File,
    titles: Record<string, string> | undefined,
    lastTagsModified: number
  ) {
    const isOverwrite = this.saveBehavior === ReplicationSaveBehavior.Overwrite;
    const { file, rootDirectory } = await this.getRootFile(
      BaseStorageHandler.bookTagsFilePrefix,
      0.4
    );

    let tagsToStore: BookTagsDict = tags instanceof File ? {} : tags;
    let titlesToStore = titles;
    let newTagsModified = lastTagsModified;

    if (!isOverwrite && file) {
      const existingDataFile = await file.getFile();
      const existingPayload = JSON.parse(
        await FilesystemStorageHandler.readFileObject(existingDataFile)
      ) as BookTagsSyncPayload;

      tagsToStore = mergeTagsDicts(existingPayload?.tagsByTitle, tagsToStore);
      titlesToStore = mergeTagsTitles(existingPayload?.titles, titlesToStore);
      newTagsModified = Math.max(
        existingPayload?.lastModified || 0,
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

    await this.writeFile(
      rootDirectory,
      filename,
      JSON.stringify(payload),
      [],
      file,
      0.6,
      BaseStorageHandler.bookTagsFilePrefix
    );
  }

  async saveAudioBook(data: BooksDbAudioBook | File, context: ReplicationContext) {
    const filename = BaseStorageHandler.getAudioBookFileName(data);
    const { file, files, rootDirectory } = await this.getExternalFile(
      FilePrefix.AUDIO_BOOK,
      0.4,
      context
    );

    await this.writeFile(
      rootDirectory,
      filename,
      data instanceof File ? data : JSON.stringify(data),
      files,
      file,
      0.6,
      undefined,
      context.title
    );
  }

  async saveSubtitleData(data: BooksDbSubtitleData | File, context: ReplicationContext) {
    const filename = BaseStorageHandler.getSubtitleDataFileName(data);
    const { file, files, rootDirectory } = await this.getExternalFile(
      FilePrefix.SUBTITLE,
      0.4,
      context
    );

    await this.writeFile(
      rootDirectory,
      filename,
      data instanceof File ? data : JSON.stringify(data),
      files,
      file,
      0.6,
      undefined,
      context.title
    );
  }

  async deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics = true
  ) {
    const rootDirectory = await this.ensureRoot();
    const deleted: number[] = [];
    const deletionLimiter = pLimit(1);
    const deleteTasks: Promise<void>[] = [];

    let error = '';

    replicationProgress$.next({ progressBase: 1, maxProgress: booksToDelete.length });

    booksToDelete.forEach((bookToDelete) =>
      deleteTasks.push(
        deletionLimiter(async () => {
          try {
            throwIfAborted(cancelSignal);

            const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(bookToDelete);
            const directory = await rootDirectory
              .getDirectoryHandle(sanitizedTitle, { create: false })
              .catch(() => undefined);

            if (directory) {
              const entries = (await FilesystemStorageHandler.list(
                directory
              )) as FileSystemFileHandle[];
              const statisticsEntries = entries.filter((entry) =>
                entry.name.startsWith('statistics_')
              );
              const keepStatistics = keepLocalStatistics && statisticsEntries.length > 0;
              const entriesToDelete = keepStatistics
                ? entries.filter((entry) => !entry.name.startsWith('statistics_'))
                : entries;

              for (let index = 0; index < entriesToDelete.length; index += 1) {
                throwIfAborted(cancelSignal);
                await directory.removeEntry(entriesToDelete[index].name).catch(() => {
                  // Stale cache entry; continue with the rest.
                });
              }

              if (keepStatistics) {
                this.titleToDirectory.set(bookToDelete, directory);
                this.titleToFiles.set(bookToDelete, statisticsEntries);
              } else {
                await rootDirectory.removeEntry(sanitizedTitle, { recursive: true }).catch(() => {
                  // Directory may already be empty/removed after file deletes.
                });
                this.titleToDirectory.delete(bookToDelete);
                this.titleToFiles.delete(bookToDelete);
              }
            } else {
              this.titleToDirectory.delete(bookToDelete);
              this.titleToFiles.delete(bookToDelete);
            }

            const deletedId = this.titleToBookCard.get(bookToDelete)?.id;

            if (deletedId) {
              deleted.push(deletedId);
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

    if (!error) {
      this.dataListFetched = false;
    }

    return { error, deleted };
  }

  async deleteBookProgressAndStats(title: string): Promise<void> {
    const rootDirectory = await this.ensureRoot();
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(title);
    const directory = await rootDirectory
      .getDirectoryHandle(sanitizedTitle, { create: false })
      .catch(() => undefined);

    if (!directory) return;

    const entries = (await FilesystemStorageHandler.list(directory)) as FileSystemFileHandle[];
    const progressFiles = entries.filter(
      (f) => f.name.startsWith('progress_') || f.name.startsWith('statistics_')
    );

    for (const file of progressFiles) {
      await directory.removeEntry(file.name).catch(() => {});
    }

    if (this.titleToFiles.has(title)) {
      const remainingFiles = (this.titleToFiles.get(title) || []).filter(
        (f) => !f.name.startsWith('progress_') && !f.name.startsWith('statistics_')
      );
      this.titleToFiles.set(title, remainingFiles);
    }

    if (this.titleToBookCard.has(title)) {
      this.addBookCard(title, { progress: 0, lastBookmarkModified: 0 });
    }
  }

  private async ensureRoot(
    askForStorageUnlock = this.askForStorageUnlock
  ): Promise<FileSystemDirectoryHandle> {
    try {
      if (this.rootDirectory) {
        await FilesystemStorageHandler.verifyPermission(this.rootDirectory);

        return this.rootDirectory;
      }

      const db = await database.db;
      const storageSource = await db.get('storageSource', this.storageSourceName);

      if (!storageSource) {
        throw new Error(`No storage source with name ${this.storageSourceName} found`);
      }

      const handleData = storageSource.data;

      if (handleData instanceof ArrayBuffer || isRemoteContext(handleData)) {
        throw new Error('Wrong filesystem handle type');
      }

      if (!handleData.directoryHandle) {
        throw new Error('Filesystem handle not found');
      }

      await FilesystemStorageHandler.verifyPermission(handleData.directoryHandle);

      this.rootDirectory = handleData.directoryHandle;
    } catch (error: any) {
      if (
        error.message.includes('activation is required') &&
        (!this.rootDirectory || askForStorageUnlock)
      ) {
        await new Promise<StorageUnlockAction | undefined>((resolver) => {
          dialogManager.dialogs$.next([
            {
              component: StorageUnlock,
              props: {
                description: 'You are trying to access data on your filesystem',
                action: 'Please grant permissions in the next dialog',
                requiresSecret: false,
                resolver
              },
              disableCloseOnClick: true
            }
          ]);
        });

        return this.ensureRoot(false);
      }

      throw error;
    }

    return this.rootDirectory;
  }

  private async setTitleData(directories: FileSystemDirectoryHandle[], clearDataOnError = true) {
    const listLimiter = pLimit(1);
    const listTasks: Promise<void>[] = [];

    directories.forEach((directory) =>
      listTasks.push(
        listLimiter(async () => {
          try {
            const files = (await FilesystemStorageHandler.list(
              directory
            )) as FileSystemFileHandle[];

            if (!files.length) {
              return;
            }

            const bookCard: BookCardProps = {
              id: BaseStorageHandler.getDummyId(),
              title: BaseStorageHandler.desanitizeFilename(directory.name),
              imagePath: '',
              characters: 0,
              lastBookModified: 0,
              lastBookOpen: 0,
              progress: 0,
              lastBookmarkModified: 0,
              isPlaceholder: false
            };
            const fileLimiter = pLimit(1);
            const fileTasks: Promise<void>[] = [];

            files.forEach((file) =>
              fileTasks.push(
                fileLimiter(async () => {
                  try {
                    if (file.name.startsWith('bookdata_')) {
                      const metadata = BaseStorageHandler.getBookMetadata(file.name);

                      bookCard.characters = metadata.characters;
                      bookCard.lastBookModified = metadata.lastBookModified;
                      bookCard.lastBookOpen = metadata.lastBookOpen;
                    } else if (file.name.startsWith('progress_')) {
                      const metadata = BaseStorageHandler.getProgressMetadata(file.name);

                      bookCard.lastBookmarkModified = metadata.lastBookmarkModified;
                      bookCard.progress = metadata.progress;
                    } else if (file.name.startsWith('cover_')) {
                      bookCard.imagePath = await file.getFile();
                    }
                  } catch (error) {
                    fileLimiter.clearQueue();
                    throw error;
                  }
                })
              )
            );

            await Promise.all(fileTasks);

            const title = bookCard.title;

            // A folder without a bookdata_ file is not a book (e.g. a
            // leftover statistics-only archive after deletion, or an
            // orphaned cover). Keep the directory/files cached so stats can
            // still merge on re-import, but don't surface a library card.
            const hasBookData = files.some((file) => file.name.startsWith('bookdata_'));

            this.titleToDirectory.set(title, directory);
            this.titleToFiles.set(title, files);

            if (hasBookData) {
              this.titleToBookCard.set(title, bookCard);
            } else {
              this.titleToBookCard.delete(title);
            }
          } catch (error) {
            listLimiter.clearQueue();
            throw error;
          }
        })
      )
    );

    await Promise.all(listTasks).catch((error) => {
      if (clearDataOnError) {
        this.clearData();
      }

      throw error;
    });
  }

  private async getExternalFile(
    fileIdentifier: string,
    progressBase = 0.4,
    context: ReplicationContext
  ) {
    const ctx = context;
    const progressPerStep = progressBase / 2;
    const rootDirectory = await this.ensureRoot();

    BaseStorageHandler.reportProgress(progressPerStep);

    const files = await this.getExternalFiles(rootDirectory, ctx.title);
    const file = files.find((entry) => entry.name.startsWith(fileIdentifier));

    BaseStorageHandler.reportProgress(progressPerStep);

    return { file, files, rootDirectory };
  }

  private async getRootFile(fileIdentifier: string, progressBase = 1) {
    const progressPerStep = progressBase / 2;
    const rootDirectory = await this.ensureRoot();

    BaseStorageHandler.reportProgress(progressPerStep);

    await this.setRootFiles(rootDirectory);

    return { file: this.rootFileHandles.get(fileIdentifier), rootDirectory };
  }

  private async getExternalFiles(
    rootHandle: FileSystemDirectoryHandle,
    title: string
  ): Promise<FileSystemFileHandle[]> {
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(title);

    if ((!this.cacheStorageData || !this.dataListFetched) && !this.titleToFiles.has(title)) {
      const directory = await rootHandle
        .getDirectoryHandle(sanitizedTitle, { create: false })
        .catch(() => {
          // no-op
        });

      if (directory) {
        await this.setTitleData([directory], false);
      }
    }

    return this.titleToFiles.get(title) || [];
  }

  private async setRootFiles(rootHandle: FileSystemDirectoryHandle) {
    if ((!this.cacheStorageData || !this.rootFileListFetched) && !this.rootFiles.size) {
      const files = (await FilesystemStorageHandler.list(rootHandle)) as FileSystemFileHandle[];

      for (let index = 0, { length } = files; index < length; index += 1) {
        const file = files[index];

        for (
          let index2 = 0, { length: length2 } = this.validRootFiles;
          index2 < length2;
          index2 += 1
        ) {
          const validRootFile = this.validRootFiles[index2];

          if (file.name.startsWith(validRootFile)) {
            this.rootFileHandles.set(validRootFile, file);
          }
        }
      }

      this.rootFileListFetched = true;
    }
  }

  private async writeFile(
    rootDirectory: FileSystemDirectoryHandle,
    filename: string,
    data: any,
    files: FileSystemFileHandle[],
    file: FileSystemFileHandle | undefined,
    progressBase = 0.4,
    rootFilePrefix?: string,
    title?: string
  ) {
    const progressPerStep = progressBase / 2;
    if (!rootFilePrefix && !title) {
      throw new Error('writeFile requires a title for book-scoped writes');
    }
    const sanitizedTitle = title ? BaseStorageHandler.sanitizeForFilename(title) : '';
    const directory = rootFilePrefix
      ? rootDirectory
      : this.titleToDirectory.get(title as string) ||
        (await rootDirectory.getDirectoryHandle(sanitizedTitle, { create: true }));
    const savedFile = await directory.getFileHandle(filename, { create: true });
    const writer = await savedFile.createWritable();

    await writer.write(data);
    await writer.close();

    BaseStorageHandler.reportProgress(progressPerStep);

    if (file) {
      if (!(await savedFile.isSameEntry(file))) {
        await directory.removeEntry(file.name);
      }

      if (!rootFilePrefix) {
        const titleFiles = files.filter((entry) => entry.name !== file.name);
        titleFiles.push(savedFile);

        this.titleToFiles.set(title as string, titleFiles);
      }
    } else if (!rootFilePrefix) {
      files.push(savedFile);

      this.titleToFiles.set(title as string, files);
    }

    if (rootFilePrefix) {
      this.rootFileHandles.set(rootFilePrefix, savedFile);
    } else {
      this.titleToDirectory.set(title as string, directory);
    }

    BaseStorageHandler.reportProgress(progressPerStep);
  }

  static readFileObject(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener('load', () => {
        resolve(reader.result as string);
      });

      reader.addEventListener('error', () => {
        reject(new Error(`Error reading file ${file.name}`));
      });

      reader.readAsText(file);
    });
  }

  private static async verifyPermission(handle: FileSystemDirectoryHandle) {
    const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };

    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }

    if ((await handle.requestPermission(options)) === 'granted') {
      return true;
    }

    throw new Error('No permissions granted to access filesystem');
  }

  private static async list(directory: FileSystemDirectoryHandle, listDirectories = false) {
    const entries: (FileSystemDirectoryHandle | FileSystemFileHandle)[] = [];
    const listIterator = directory.values();

    let entry = await listIterator.next();

    while (!entry.done) {
      if (entry.value.kind === 'directory' && listDirectories) {
        entries.push(entry.value);
      } else if (entry.value.kind === 'file' && !listDirectories) {
        entries.push(entry.value);
      }

      entry = await listIterator.next();
    }

    return entries;
  }
}
