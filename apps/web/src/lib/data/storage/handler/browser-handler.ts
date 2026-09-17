/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BaseStorageHandler, FilePrefix } from '$lib/data/storage/handler/base-handler';
import { normalizeTagList, normalizeTagTitle, type BookTagsDict } from '$lib/data/book-tags';
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
  activeProfileId$,
  customThemes$,
  database,
  lastBookTagsModified$,
  lastProfilesModified$,
  lastReadingGoalsModified$,
  lastStatisticsSettingsModified$,
  readerProfiles$
} from '$lib/data/store';
import {
  applyProfile,
  applyStatisticsSettings,
  getStatisticsSettingsSection,
  mergeProfiles
} from '$lib/data/profiles/profile-manager';
import type { ReaderProfile, StatisticsSyncSection } from '$lib/data/profiles/profile-types';
import type { ThemeOption } from '$lib/data/theme-option';
import { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { StorageDataType } from '$lib/data/storage/storage-types';

export class BrowserStorageHandler extends BaseStorageHandler {
  updateSettings(
    window: Window,
    isForBrowser: boolean,
    saveBehavior: ReplicationSaveBehavior,
    statisticsMergeMode: MergeMode,
    readingGoalsMergeMode: MergeMode
  ) {
    this.window = window;
    this.isForBrowser = isForBrowser;
    this.saveBehavior = saveBehavior;
    this.statisticsMergeMode = statisticsMergeMode;
    this.readingGoalsMergeMode = readingGoalsMergeMode;
  }

  async getBookList() {
    if (!this.dataListFetched) {
      database.listLoading$.next(true);

      try {
        const db = await database.db;
        const data = await db.getAll('data');

        for (let index = 0, { length } = data; index < length; index += 1) {
          const book = data[index];

          this.addBookCard(book.title, {
            id: book.id,
            imagePath: book.coverImage || '',
            characters: BaseStorageHandler.getBookCharacters(
              book.characters || 0,
              book.sections || []
            ),
            lastBookModified: book.lastBookModified || 0,
            lastBookOpen: book.lastBookOpen || 0,
            isPlaceholder: !book.elementHtml,
            tags: book.tags || []
          });
        }

        this.dataListFetched = true;
      } catch (error) {
        this.clearData();
        throw error;
      }
    }

    return [...this.titleToBookCard.values()];
  }

  async checkHasData(): Promise<{ connected: boolean; hasData: boolean }> {
    try {
      const db = await database.db;
      const count = await db.count('data');
      return { connected: true, hasData: count > 0 };
    } catch {
      return { connected: true, hasData: true };
    }
  }

  clearData(clearAll = true) {
    if (clearAll) {
      this.titleToBookCard.clear();
      this.dataListFetched = false;
    }
  }

  async prepareBookForReading() {
    const book = this.currentContext.id
      ? await database.getData(this.currentContext.id)
      : await database.getDataByTitle(this.currentContext.title);

    if (!book) {
      throw new Error('No local book data found');
    }

    if (!book.elementHtml) {
      throw new Error(
        `Placeholder books should be opened from their original source${
          book.storageSource ? ` - last source: ${book.storageSource}` : ''
        }`
      );
    }

    if (book.storageSource) {
      await database.upsertData(book, ReplicationSaveBehavior.Overwrite);
    }

    return book.id;
  }

  async updateLastRead(book: BooksDbBookData) {
    if (!book || typeof book.id !== 'number') return;
    const filename = BaseStorageHandler.getBookFileName(book);
    const { characters, lastBookModified, lastBookOpen } =
      BaseStorageHandler.getBookMetadata(filename);
    const db = await database.db;

    await db.put('data', book);

    this.addBookCard(this.currentContext.title, { characters, lastBookModified, lastBookOpen });
  }

  async getFilenameForRecentCheck(fileIdentifier: string) {
    if (this.saveBehavior === ReplicationSaveBehavior.Overwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    let fileName: string | undefined;

    if (fileIdentifier === 'bookdata_') {
      const book = await database.getDataByTitle(this.currentContext.title);

      fileName = book ? BaseStorageHandler.getBookFileName(book) : undefined;
    } else if (fileIdentifier === 'progress_') {
      const progress = await this.getProgress();

      fileName = progress ? BaseStorageHandler.getProgressFileName(progress) : undefined;
    } else if (fileIdentifier === 'statistics_') {
      const lastStatisticModifed = await database.getLastModifiedForType(
        this.currentContext.title,
        StorageDataType.STATISTICS
      );

      fileName = lastStatisticModifed
        ? BaseStorageHandler.getStatisticsFileName([], lastStatisticModifed)
        : undefined;
    } else if (fileIdentifier === BaseStorageHandler.readingGoalsFilePrefix) {
      const lastGoalModified = lastReadingGoalsModified$.getValue();

      fileName = lastGoalModified
        ? BaseStorageHandler.getReadingGoalsFileName(lastGoalModified)
        : undefined;
    } else if (fileIdentifier === BaseStorageHandler.bookTagsFilePrefix) {
      const lastTagsModified = lastBookTagsModified$.getValue();

      fileName = lastTagsModified
        ? BaseStorageHandler.getBookTagsFileName(lastTagsModified)
        : undefined;
    } else if (fileIdentifier === FilePrefix.AUDIO_BOOK) {
      const audioBook = await this.getAudioBook();

      fileName = audioBook ? BaseStorageHandler.getAudioBookFileName(audioBook) : undefined;
    } else if (fileIdentifier === FilePrefix.SUBTITLE) {
      const subtitleData = await this.getSubtitleData();

      fileName = subtitleData
        ? BaseStorageHandler.getSubtitleDataFileName(subtitleData)
        : undefined;
    }

    BrowserStorageHandler.reportProgress(0.5);
    BrowserStorageHandler.completeStep();

    return fileName;
  }

  async isBookPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const book = await database.getDataByTitle(this.currentContext.title);

    BrowserStorageHandler.reportProgress(0.5);

    let isPresentAndUpToDate = false;

    // Placeholders (no elementHtml) are metadata only and must never count
    // as up-to-date, otherwise replication skips the real DATA copy.
    if (book && book.elementHtml) {
      const { lastBookModified, lastBookOpen } =
        BaseStorageHandler.getBookMetadata(referenceFilename);
      const { lastBookModified: existingBookModified, lastBookOpen: existingBookOpen } = book;

      isPresentAndUpToDate = !!(
        existingBookModified &&
        lastBookModified &&
        existingBookModified >= lastBookModified &&
        (existingBookOpen || 0) >= (lastBookOpen || 0)
      );
    }

    BrowserStorageHandler.reportProgress(0.5);
    return isPresentAndUpToDate;
  }

  async isProgressPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const progress = await this.getProgress();
    const fileName = progress ? BaseStorageHandler.getProgressFileName(progress) : undefined;

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getProgressMetadata,
      'lastBookmarkModified',
      referenceFilename,
      fileName
    );
  }

  async areStatisticsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const existingLastModified = await database.getLastModifiedForType(
      this.currentContext.title,
      StorageDataType.STATISTICS
    );
    const fileName = existingLastModified
      ? BaseStorageHandler.getStatisticsFileName([], existingLastModified)
      : undefined;

    BaseStorageHandler.reportProgress();

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getStatisticsMetadata,
      'lastStatisticModified',
      referenceFilename,
      fileName
    );
  }

  async isAudioBookPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();

      return false;
    }

    const audioBook = await this.getAudioBook();
    const fileName = audioBook ? BaseStorageHandler.getAudioBookFileName(audioBook) : undefined;

    return BaseStorageHandler.checkIsPresentAndUpToDate<BooksDbAudioBook>(
      BaseStorageHandler.getAudioBookMetadata,
      'lastAudioBookModified',
      referenceFilename,
      fileName
    );
  }

  async isSubtitleDataPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();

      return false;
    }

    const subtitleData = await this.getSubtitleData();
    const fileName = subtitleData
      ? BaseStorageHandler.getSubtitleDataFileName(subtitleData)
      : undefined;

    return BaseStorageHandler.checkIsPresentAndUpToDate<BooksDbSubtitleData>(
      BaseStorageHandler.getSubtitleDataMetadata,
      'lastSubtitleDataModified',
      referenceFilename,
      fileName
    );
  }

  async isUserBookmarksPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();

      return false;
    }

    const bookmarks = await this.getUserBookmarks();
    const existingLastModified = await database.getLastModifiedForType(
      this.currentContext.title,
      StorageDataType.USER_BOOKMARKS
    );
    const fileName =
      Array.isArray(bookmarks) && bookmarks.length
        ? BaseStorageHandler.getUserBookmarksFileName(bookmarks, existingLastModified)
        : undefined;

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getUserBookmarksMetadata,
      'lastUserBookmarksModified',
      referenceFilename,
      fileName
    );
  }

  async getBook() {
    const book = this.currentContext.id
      ? await database.getData(this.currentContext.id)
      : await database.getDataByTitle(this.currentContext.title);

    BaseStorageHandler.reportProgress();

    return book;
  }

  async getProgress() {
    const dataId =
      this.currentContext.id || (await database.getDataByTitle(this.currentContext.title))?.id;

    BaseStorageHandler.reportProgress(0.5);

    const progress = dataId ? await database.getBookmark(dataId) : undefined;

    return progress;
  }

  async getUserBookmarks() {
    const dataId =
      this.currentContext.id || (await database.getDataByTitle(this.currentContext.title))?.id;

    BaseStorageHandler.reportProgress(0.5);

    const bookmarks = dataId ? await database.getUserBookmarks(dataId) : [];

    return bookmarks.filter((b) => !b.isAutosave);
  }

  async getStatistics() {
    const statistics = await database.getStatisticsForBook(this.currentContext.title);

    BaseStorageHandler.reportProgress(0.5);

    const lastStatisticModified = await database.getLastModifiedForType(
      this.currentContext.title,
      StorageDataType.STATISTICS
    );

    if (!lastStatisticModified) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }

    return { statistics, lastStatisticModified };
  }

  async getCover() {
    const cover =
      this.currentContext.imagePath instanceof Blob ? this.currentContext.imagePath : undefined;

    BaseStorageHandler.reportProgress();

    return cover;
  }

  async getAudioBook() {
    const audioBook = await database.getAudioBook(this.currentContext.title);

    BaseStorageHandler.reportProgress();

    return audioBook;
  }

  async getSubtitleData() {
    const subtitleData = await database.getSubtitleData(this.currentContext.title);

    BaseStorageHandler.reportProgress();

    return subtitleData;
  }

  async saveBook(
    data: Omit<BooksDbBookData, 'id'> | File,
    skipTimestampFallback = true,
    removeStorageContext = true
  ) {
    let idToReturn = 0;

    if (!(data instanceof File)) {
      const storedBookData = await database.upsertData(
        data,
        this.saveBehavior,
        skipTimestampFallback,
        removeStorageContext
      );

      idToReturn = storedBookData.id;
      this.addBookCard(data.title, {
        id: storedBookData.id,
        characters: BaseStorageHandler.getBookCharacters(
          storedBookData.characters || 0,
          storedBookData.sections || []
        ),
        lastBookModified: storedBookData.lastBookModified || 0,
        lastBookOpen: storedBookData.lastBookOpen || 0,
        isPlaceholder: !storedBookData.elementHtml,
        tags: storedBookData.tags || []
      });
    }

    BaseStorageHandler.reportProgress();

    return idToReturn;
  }

  async saveProgress(data: BooksDbBookmarkData | File) {
    if (data instanceof File) {
      BaseStorageHandler.reportProgress();

      return;
    }

    const dataId =
      this.currentContext.id || (await database.getDataByTitle(this.currentContext.title))?.id;

    BaseStorageHandler.reportProgress(0.5);

    if (dataId) {
      const bookmarkData = data;

      bookmarkData.dataId = dataId;

      await database.putBookmark(bookmarkData);
    }
  }

  async saveUserBookmarks(data: BooksDbUserBookmarkData[] | File) {
    if (data instanceof File) {
      BaseStorageHandler.reportProgress();

      return;
    }

    BaseStorageHandler.reportProgress(0.5);

    await database.storeUserBookmarks(this.currentContext.title, data, this.saveBehavior);
  }

  async saveStatistics(data: BooksDbStatistic[], lastStatisticModified: number) {
    await database.storeStatistics(
      this.currentContext.title,
      data,
      this.saveBehavior,
      this.statisticsMergeMode,
      lastStatisticModified
    );

    BaseStorageHandler.reportProgress();
  }

  async saveReadingGoals(data: BooksDbReadingGoal[], lastGoalModified: number) {
    await database.storeReadingGoals(
      data,
      this.saveBehavior,
      this.readingGoalsMergeMode,
      lastGoalModified
    );

    BaseStorageHandler.reportProgress();
  }

  async saveProfiles(
    data: ReaderProfile[],
    lastProfilesModified: number,
    remoteCustomThemes?: Record<string, ThemeOption>,
    remoteStatisticsSettings?: StatisticsSyncSection
  ) {
    const isMerge = this.profilesMergeMode === MergeMode.MERGE;
    const localProfiles = readerProfiles$.getValue() || [];
    let profilesToStore = data;
    let newProfilesModified = lastProfilesModified;

    if (isMerge) {
      const result = mergeProfiles(
        localProfiles,
        data,
        this.saveBehavior === ReplicationSaveBehavior.NewOnly,
        lastProfilesModified
      );
      profilesToStore = result.mergedProfiles;
      newProfilesModified = result.newLastModified;
    }

    readerProfiles$.next(profilesToStore);
    lastProfilesModified$.next(newProfilesModified);

    if (remoteCustomThemes && typeof remoteCustomThemes === 'object') {
      customThemes$.next({
        ...(customThemes$.getValue() || {}),
        ...remoteCustomThemes
      });
    }

    // Whole-section LWW against the local marker; suppressed internally so
    // remote application never dirties the sync timestamps again.
    applyStatisticsSettings(remoteStatisticsSettings);

    const activeId = activeProfileId$.getValue();
    const activeProfile = profilesToStore.find((p) => p.id === activeId);
    if (activeProfile) {
      applyProfile(activeProfile);
    }

    BaseStorageHandler.reportProgress();
  }

  saveCover(data: Blob | undefined) {
    if (data instanceof Blob && this.titleToBookCard.has(this.currentContext.title)) {
      this.addBookCard(this.currentContext.title, { imagePath: data });
    }

    BaseStorageHandler.reportProgress();
    return Promise.resolve();
  }

  areReadingGoalsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return Promise.resolve(false);
    }

    const existingLastModified = lastReadingGoalsModified$.getValue();
    const fileName = existingLastModified
      ? BaseStorageHandler.getReadingGoalsFileName(existingLastModified)
      : undefined;

    BaseStorageHandler.reportProgress();

    return Promise.resolve(
      BaseStorageHandler.checkIsPresentAndUpToDate(
        BaseStorageHandler.getReadingGoalsMetadata,
        'lastGoalModified',
        referenceFilename,
        fileName
      )
    );
  }

  async getReadingGoals() {
    const readingGoals = await database.getReadingGoals();
    const lastGoalModified = lastReadingGoalsModified$.getValue();

    BaseStorageHandler.reportProgress();

    if (!lastGoalModified) {
      return { readingGoals: undefined, lastGoalModified: 0 };
    }

    return { readingGoals, lastGoalModified };
  }

  areProfilesPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return Promise.resolve(false);
    }

    const existingLastModified = lastProfilesModified$.getValue();
    const fileName = existingLastModified
      ? BaseStorageHandler.getProfilesFileName(existingLastModified)
      : undefined;

    BaseStorageHandler.reportProgress();

    return Promise.resolve(
      BaseStorageHandler.checkIsPresentAndUpToDate(
        BaseStorageHandler.getProfilesMetadata,
        'lastProfilesModified',
        referenceFilename,
        fileName
      )
    );
  }

  async getProfiles() {
    const profiles = readerProfiles$.getValue();
    const lastProfilesModified = lastProfilesModified$.getValue();
    const customThemes = customThemes$.getValue();
    const statisticsSettings = getStatisticsSettingsSection();

    BaseStorageHandler.reportProgress();

    if (
      !lastProfilesModified &&
      (!profiles || !profiles.length) &&
      !lastStatisticsSettingsModified$.getValue()
    ) {
      return {
        profiles: undefined,
        customThemes: undefined,
        statisticsSettings: undefined,
        lastProfilesModified: 0
      };
    }

    return { profiles, customThemes, statisticsSettings, lastProfilesModified };
  }

  areBookTagsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return Promise.resolve(false);
    }

    const existingLastModified = lastBookTagsModified$.getValue();
    const fileName = existingLastModified
      ? BaseStorageHandler.getBookTagsFileName(existingLastModified)
      : undefined;

    BaseStorageHandler.reportProgress();

    return Promise.resolve(
      BaseStorageHandler.checkIsPresentAndUpToDate(
        BaseStorageHandler.getBookTagsMetadata,
        'lastTagsModified',
        referenceFilename,
        fileName
      )
    );
  }

  async getBookTags() {
    const db = await database.db;
    const books = await db.getAll('data');
    const tagsByTitle: BookTagsDict = {};
    const titles: Record<string, string> = {};

    for (const book of books) {
      const tags = normalizeTagList(book.tags);
      if (!tags.length) continue;
      const key = normalizeTagTitle(book.title);
      tagsByTitle[key] = normalizeTagList([...(tagsByTitle[key] || []), ...tags]);
      if (!titles[key]) titles[key] = book.title;
    }

    BaseStorageHandler.reportProgress();

    if (!Object.keys(tagsByTitle).length) {
      return { tags: undefined, titles: undefined, lastTagsModified: 0 };
    }

    let lastTagsModified = lastBookTagsModified$.getValue();
    if (!lastTagsModified) {
      lastTagsModified = Date.now();
      lastBookTagsModified$.next(lastTagsModified);
    }

    return { tags: tagsByTitle, titles, lastTagsModified };
  }

  async saveBookTags(
    data: BookTagsDict | File,
    _titles: Record<string, string> | undefined,
    lastTagsModified: number
  ) {
    if (data instanceof File) {
      BaseStorageHandler.reportProgress();
      return;
    }

    BaseStorageHandler.reportProgress(0.5);

    // Tags are additive sets: union per title, unless the save behavior is
    // Overwrite (export "replace"), in which case the incoming dict wins so
    // tag deletions propagate.
    const isOverwrite = this.saveBehavior === ReplicationSaveBehavior.Overwrite;
    const db = await database.db;
    const books = await db.getAll('data');

    for (const book of books) {
      const incoming = normalizeTagList(data[normalizeTagTitle(book.title)]);
      const current = normalizeTagList(book.tags);

      if (!incoming.length) {
        if (isOverwrite && current.length) {
          await db.put('data', { ...book, tags: [] });
          this.addBookCard(book.title, { tags: [] });
        }
        continue;
      }

      const merged = isOverwrite ? incoming : normalizeTagList([...current, ...incoming]);

      if (JSON.stringify(merged) !== JSON.stringify(current)) {
        await db.put('data', { ...book, tags: merged });
        this.addBookCard(book.title, { tags: merged });
      }
    }

    lastBookTagsModified$.next(lastTagsModified || Date.now());
    database.dataListChanged$.next(this);
  }

  async saveAudioBook(data: BooksDbAudioBook | File) {
    if (data instanceof File) {
      BaseStorageHandler.reportProgress();

      return;
    }

    await database.putAudioBook(data);
  }

  async saveSubtitleData(data: BooksDbSubtitleData | File) {
    if (data instanceof File) {
      BaseStorageHandler.reportProgress();

      return;
    }

    await database.putSubtitleData(data);
  }

  async deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics: boolean
  ) {
    const ids: number[] = [];
    const idToTitle = new Map<number, string>();

    for (let index = 0, { length } = booksToDelete; index < length; index += 1) {
      const bookData = this.titleToBookCard.get(booksToDelete[index]);

      if (bookData) {
        ids.push(bookData.id);
        idToTitle.set(bookData.id, bookData.title);
      }
    }

    const { error, deleted } = await database
      .deleteData(ids, idToTitle, cancelSignal, keepLocalStatistics)
      .catch((catchedError) => ({ error: catchedError.message, deleted: [] }));

    for (let index = 0, { length } = deleted; index < length; index += 1) {
      const result = deleted[index];

      this.titleToBookCard.delete(idToTitle.get(result) || '');
    }

    if (deleted.length) {
      database.dataListChanged$.next(this);
    }

    return { error, deleted };
  }
}
