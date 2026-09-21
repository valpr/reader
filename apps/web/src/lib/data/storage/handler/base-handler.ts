/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BookCardProps } from '$lib/components/book-card/book-card-props';
import type { BookTagsDict } from '$lib/data/book-tags';
import {
  currentDbVersion,
  type BooksDbBookData,
  type BooksDbBookmarkData,
  type BooksDbStatistic,
  type BooksDbReadingGoal,
  type BooksDbAudioBook,
  type BooksDbSubtitleData,
  type BooksDbUserBookmarkData
} from '$lib/data/database/books-db/versions/books-db';
import type { Section } from '$lib/data/database/books-db/versions/v4/books-db-v4';
import { storageRootName } from '$lib/data/env';
import { MergeMode } from '$lib/data/merge-mode';
import type { ReaderProfile, StatisticsSyncSection } from '$lib/data/profiles/profile-types';
import type { ThemeOption } from '$lib/data/theme-option';
import { InternalStorageSources, type StorageKey } from '$lib/data/storage/storage-types';
import { exporterVersion } from '$lib/functions/replication/replicator';
import type {
  StatisticContributionFile,
  StatisticMigrationMarker
} from '$lib/functions/statistic-v2';
import { throwIfAborted } from '$lib/functions/replication/replication-error';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import {
  replicationProgress$,
  type ReplicationContext,
  type ReplicationDeleteResult
} from '$lib/functions/replication/replication-progress';
import pLimit from 'p-limit';
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  type Entry
} from '@zip.js/zip.js';

export enum FilePrefix {
  AUDIO_BOOK = 'audioBook_',
  SUBTITLE = 'subtitles_',
  USER_BOOKMARKS = 'userBookmarks_'
}

export interface ExternalFile {
  id: string;
  name: string;
}

export abstract class BaseStorageHandler {
  abstract updateSettings(
    window: Window,
    isForBrowser: boolean,
    saveBehavior: string,
    statisticsMergeMode: MergeMode,
    readingGoalsMergeMode: MergeMode,
    cacheStorageData: boolean,
    askForStorageUnlock: boolean,
    storageSourceName: string
  ): void;

  abstract getBookList(): Promise<BookCardProps[]>;

  abstract checkHasData(): Promise<{ connected: boolean; hasData: boolean }>;

  abstract clearData(clearAll?: boolean): void;

  abstract prepareBookForReading(context: ReplicationContext): Promise<number>;

  abstract updateLastRead(book: BooksDbBookData, context: ReplicationContext): Promise<void>;

  abstract getFilenameForRecentCheck(
    fileIdentifier: string,
    context?: ReplicationContext
  ): Promise<string | undefined>;

  abstract isBookPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ): Promise<boolean>;

  abstract isProgressPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ): Promise<boolean>;

  abstract areStatisticsPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ): Promise<boolean>;

  abstract areReadingGoalsPresentAndUpToDate(
    referenceFilename: string | undefined
  ): Promise<boolean>;

  abstract areProfilesPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;

  abstract areBookTagsPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;

  abstract isAudioBookPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ): Promise<boolean>;

  abstract isSubtitleDataPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ): Promise<boolean>;

  abstract isUserBookmarksPresentAndUpToDate(
    referenceFilename: string | undefined,
    context: ReplicationContext
  ): Promise<boolean>;

  abstract getBook(
    context: ReplicationContext
  ): Promise<Omit<BooksDbBookData, 'id'> | File | undefined>;

  abstract getProgress(
    context: ReplicationContext
  ): Promise<BooksDbBookmarkData | File | undefined>;

  abstract getUserBookmarks(
    context: ReplicationContext
  ): Promise<BooksDbUserBookmarkData[] | File | undefined>;

  abstract getStatistics(context: ReplicationContext): Promise<{
    statistics: BooksDbStatistic[] | undefined;
    lastStatisticModified: number;
  }>;

  abstract getCover(context: ReplicationContext): Promise<Blob | undefined>;

  abstract getReadingGoals(): Promise<{
    readingGoals: BooksDbReadingGoal[] | undefined;
    lastGoalModified: number;
  }>;

  abstract getProfiles(): Promise<{
    profiles: ReaderProfile[] | undefined;
    customThemes?: Record<string, ThemeOption>;
    statisticsSettings?: StatisticsSyncSection;
    lastProfilesModified: number;
  }>;

  abstract getBookTags(): Promise<{
    tags: BookTagsDict | undefined;
    titles: Record<string, string> | undefined;
    lastTagsModified: number;
  }>;

  abstract getAudioBook(context: ReplicationContext): Promise<BooksDbAudioBook | File | undefined>;

  abstract getSubtitleData(
    context: ReplicationContext
  ): Promise<BooksDbSubtitleData | File | undefined>;

  abstract saveBook(
    data: Omit<BooksDbBookData, 'id'> | File,
    skipTimestampFallback: boolean | undefined,
    removeStorageContext: boolean | undefined,
    context: ReplicationContext
  ): Promise<number>;

  abstract saveProgress(
    data: BooksDbBookmarkData | File,
    context: ReplicationContext
  ): Promise<void>;

  abstract saveUserBookmarks(
    data: BooksDbUserBookmarkData[] | File,
    context: ReplicationContext
  ): Promise<void>;

  abstract saveStatistics(
    data: BooksDbStatistic[],
    lastStatisticModified: number,
    context: ReplicationContext
  ): Promise<void>;

  /**
   * Statistics v2 (P3/P4): stable per-device/year contribution files plus the
   * per-device migration markers. Role-dependent by handler kind:
   * - Browser (local): list returns this device's own publish payloads;
   *   save folds the given remote files into the display store.
   * - Cloud/filesystem (remote): list reads every v2 file; save overwrites
   *   each file in place under its stable name.
   * - Backup: list reads the import zip's v2 entries; save appends v2 entries
   *   to the export zip (no-op while importing).
   * Legacy per-book `statistics_*` snapshots are intentionally outside this
   * surface; see `listLegacyStatisticSnapshots` for the one-time migration read.
   */
  abstract listContributionFiles(): Promise<StatisticContributionFile[]>;

  abstract writeContributionFiles(files: StatisticContributionFile[]): Promise<void>;

  abstract listMigrationMarkers(): Promise<StatisticMigrationMarker[]>;

  abstract writeMigrationMarker(marker: StatisticMigrationMarker): Promise<void>;

  /**
   * One-time migration read (P4): unattributed legacy per-book snapshots.
   * Only consulted when the local display is empty and no migration marker
   * exists yet — established devices already carry the merged history.
   */
  abstract listLegacyStatisticSnapshots(): Promise<BooksDbStatistic[][]>;

  abstract saveCover(data: Blob | undefined, context: ReplicationContext): Promise<void>;

  abstract saveReadingGoals(data: BooksDbReadingGoal[], lastGoalModified: number): Promise<void>;

  abstract saveProfiles(
    data: ReaderProfile[],
    lastProfilesModified: number,
    customThemes?: Record<string, ThemeOption>,
    statisticsSettings?: StatisticsSyncSection
  ): Promise<void>;

  abstract saveBookTags(
    tags: BookTagsDict | File,
    titles: Record<string, string> | undefined,
    lastTagsModified: number
  ): Promise<void>;

  abstract saveAudioBook(data: BooksDbAudioBook | File, context: ReplicationContext): Promise<void>;

  abstract saveSubtitleData(
    data: BooksDbSubtitleData | File,
    context: ReplicationContext
  ): Promise<void>;

  abstract deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics: boolean
  ): Promise<ReplicationDeleteResult>;

  abstract deleteBookProgressAndStats(title: string): Promise<void>;

  static rootName = storageRootName;

  static readingGoalsFilePrefix = 'ttu-user-goals_';

  static profilesFilePrefix = 'ttu-user-profiles_';

  static bookTagsFilePrefix = 'ttu-book-tags_';

  /** Statistics v2: one stable file per device per year (P3). */
  static contributionFilePrefix = 'statistics_v2_';

  storageType: StorageKey;

  protected window: Window;

  protected storageSourceName: string = InternalStorageSources.INTERNAL_DEFAULT;

  protected isForBrowser = false;

  protected cacheStorageData = false;

  protected saveBehavior = ReplicationSaveBehavior.NewOnly;

  protected statisticsMergeMode = MergeMode.MERGE;

  protected readingGoalsMergeMode = MergeMode.MERGE;

  protected profilesMergeMode = MergeMode.MERGE;

  protected askForStorageUnlock = true;

  protected dataListFetched = false;

  protected rootFileListFetched = false;

  protected titleToBookCard = new Map<string, BookCardProps>();

  protected rootFiles = new Map<string, ExternalFile>();

  protected validRootFiles = [
    BaseStorageHandler.readingGoalsFilePrefix,
    BaseStorageHandler.profilesFilePrefix,
    BaseStorageHandler.bookTagsFilePrefix,
    BaseStorageHandler.contributionFilePrefix
  ];

  constructor(window: Window, storageType: StorageKey) {
    this.window = window;
    this.storageType = storageType;
  }

  static getBookCharacters(characterAmount: number, sections: Section[]) {
    if (characterAmount) {
      return characterAmount;
    }

    const lastSection = [...sections]
      .reverse()
      .find((section) => section.startCharacter !== undefined && section.characters !== undefined);

    let characters = 0;

    if (lastSection?.startCharacter && lastSection.characters) {
      characters = lastSection.startCharacter + lastSection.characters;
    }

    return characters;
  }

  static reportProgress(progressToAdd = 1) {
    replicationProgress$.next({ progressToAdd });
  }

  static completeStep() {
    replicationProgress$.next({ completeStep: true });
  }

  isCacheDisabled() {
    return !this.cacheStorageData;
  }

  getCurrentStorageSource() {
    return this.storageSourceName;
  }

  static getStatisticsMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastStatisticModified: +parts[3],
      charactersRead: +parts[4],
      readingTime: +parts[5],
      minReadingSpeed: +parts[6],
      altMinReadingSpeed: +parts[7],
      lastReadingSpeed: +parts[8],
      maxReadingSpeed: +parts[9],
      averageReadingTime: +parts[10],
      averageWeightedRedingTime: +parts[11],
      averageCharactersRead: +parts[12],
      averageWeightedCharatersRead: +parts[13],
      averageReadingSpeed: +parts[14],
      averageWeightedReadingSpeed: +parts[15],
      finishDate: parts[16] || 'na'
    };
  }

  static getStatisticsFileName(statistics: BooksDbStatistic[], lastStatisticModified: number) {
    let readingTime = 0;
    let charactersRead = 0;
    let minReadingSpeed = 0;
    let altMinReadingSpeed = 0;
    let maxReadingSpeed = 0;
    let weightedSum = 0;
    let validReadingDays = 0;
    let finishDate = 'na';

    for (let index = 0, { length } = statistics; index < length; index += 1) {
      const statistic = statistics[index];

      readingTime += statistic.readingTime;
      charactersRead += statistic.charactersRead;
      minReadingSpeed = minReadingSpeed
        ? Math.min(minReadingSpeed, statistic.minReadingSpeed)
        : statistic.minReadingSpeed;
      altMinReadingSpeed = altMinReadingSpeed
        ? Math.min(altMinReadingSpeed, statistic.altMinReadingSpeed)
        : statistic.altMinReadingSpeed;
      maxReadingSpeed = Math.max(maxReadingSpeed, statistic.lastReadingSpeed);
      weightedSum += statistic.readingTime * statistic.charactersRead;

      if (statistic.readingTime) {
        validReadingDays += 1;
      }

      if (statistic.completedData) {
        if (finishDate === 'na') {
          finishDate = statistic.dateKey;
        } else {
          finishDate =
            statistic.completedData.dateKey > finishDate
              ? statistic.completedData.dateKey
              : finishDate;
        }
      }
    }

    const averageReadingTime = validReadingDays ? Math.ceil(readingTime / validReadingDays) : 0;
    const averageWeightedReadingTime = charactersRead ? Math.ceil(weightedSum / charactersRead) : 0;
    const averageCharactersRead = validReadingDays
      ? Math.ceil(charactersRead / validReadingDays)
      : 0;
    const averageWeightedCharactersRead = readingTime ? Math.ceil(weightedSum / readingTime) : 0;
    const lastReadingSpeed = readingTime ? Math.ceil((3600 * charactersRead) / readingTime) : 0;
    const averageReadingSpeed = averageReadingTime
      ? Math.ceil((3600 * averageCharactersRead) / averageReadingTime)
      : 0;
    const averageWeightedReadingSpeed = averageWeightedReadingTime
      ? Math.ceil((3600 * averageWeightedCharactersRead) / averageWeightedReadingTime)
      : 0;

    return `statistics_${exporterVersion}_${currentDbVersion}_${lastStatisticModified}_${charactersRead}_${readingTime}_${minReadingSpeed}_${altMinReadingSpeed}_${lastReadingSpeed}_${maxReadingSpeed}_${averageReadingTime}_${averageWeightedReadingTime}_${averageCharactersRead}_${averageWeightedCharactersRead}_${averageReadingSpeed}_${averageWeightedReadingSpeed}_${finishDate}.json`;
  }

  static getReadingGoalsFileName(lastGoalModified: number) {
    return `${BaseStorageHandler.readingGoalsFilePrefix}${exporterVersion}_${currentDbVersion}_${lastGoalModified}.json`;
  }

  static getProfilesFileName(lastProfilesModified: number) {
    return `${BaseStorageHandler.profilesFilePrefix}${exporterVersion}_${currentDbVersion}_${lastProfilesModified}.json`;
  }

  static getBookTagsFileName(lastTagsModified: number) {
    return `${BaseStorageHandler.bookTagsFilePrefix}${exporterVersion}_${currentDbVersion}_${lastTagsModified}.json`;
  }

  /**
   * Statistics v2 stable filename (P3): content changes in place, the name
   * never does, so file count stays bounded at devices x years.
   */
  static getContributionFileName(deviceId: string, year: number) {
    return `${BaseStorageHandler.contributionFilePrefix}${deviceId}_${year}.json`;
  }

  static parseContributionFileName(filename: string) {
    const match = /^statistics_v2_(.+)_(\\d{4})\\.json$/.exec(filename);
    if (!match) return undefined;
    return { deviceId: match[1], year: Number.parseInt(match[2], 10) };
  }

  static getImageMimeTypeFromExtension(value: string) {
    const extension = value.split('.').pop()?.toLowerCase() || '';

    switch (extension) {
      case 'svg':
        return `image/svg+xml`;
      case 'png':
      case 'gif':
      case 'bmp':
      case 'webp':
        return `image/${extension}`;
      default:
        return 'image/jpeg';
    }
  }

  protected static checkIsPresentAndUpToDate<T>(
    functionToCall: (_: string) => any,
    keyToCheck: keyof T,
    referenceFilename: string,
    name?: string
  ) {
    let isPresentAndUpToDate = false;

    if (name) {
      const lastModifiedValue = functionToCall(referenceFilename)[keyToCheck];
      const existingLastModifiedValue = functionToCall(name)[keyToCheck];

      isPresentAndUpToDate = !!(
        existingLastModifiedValue &&
        lastModifiedValue &&
        existingLastModifiedValue >= lastModifiedValue
      );
    }

    BaseStorageHandler.completeStep();

    return isPresentAndUpToDate;
  }

  protected addBookCard(title: string, dataToAdd: Record<string, any>) {
    const bookCard: BookCardProps = {
      ...(this.titleToBookCard.get(title) || {
        id: BaseStorageHandler.getDummyId(),
        title,
        imagePath: '',
        characters: 0,
        lastBookModified: 0,
        lastBookOpen: 0,
        progress: 0,
        lastBookmarkModified: 0,
        isPlaceholder: false
      }),
      ...dataToAdd
    };

    this.titleToBookCard.set(title, bookCard);
  }

  protected async zipBookData(
    bookdata: Omit<BooksDbBookData, 'id'>,
    progressBase = 1,
    cancelSignal?: AbortSignal
  ) {
    const zipWriter = new ZipWriter(new BlobWriter('application/zip'));
    const blobsToZip = [];
    const blobEntries = [...Object.entries(bookdata.blobs)];
    const staticDataToZip: Array<
      Exclude<
        keyof Omit<BooksDbBookData, 'id'>,
        | 'blobs'
        | 'hasThumb'
        | 'coverImage'
        | 'characters'
        | 'lastBookModified'
        | 'lastBookOpen'
        | 'storageSource'
      >
    > = ['title', 'styleSheet', 'elementHtml', 'htmlBackup', 'sections', 'tags'];
    const staticData: Record<string, string | string[] | Section[] | undefined> = {};
    const limiter = pLimit(1);
    const cover = bookdata.coverImage;
    const isBlobCover = cover instanceof Blob;
    const filesInScope = blobEntries.length + staticDataToZip.length + (isBlobCover ? 1 : 0);
    const progressPerStep = progressBase / filesInScope;

    for (let index = 0, { length } = blobEntries; index < length; index += 1) {
      blobsToZip.push(
        limiter(async () => {
          const [name, blob] = blobEntries[index];

          await this.addDataToZip(`blobs/${name}`, blob, zipWriter, progressPerStep).catch(
            (error) => {
              limiter.clearQueue();
              throw error;
            }
          );
        })
      );
    }

    await Promise.all(blobsToZip);

    if (isBlobCover) {
      await this.addDataToZip(
        `cover.${await BaseStorageHandler.determineImageExtension(cover)}`,
        cover,
        zipWriter,
        progressPerStep
      );
    }

    for (let index = 0, { length } = staticDataToZip; index < length; index += 1) {
      throwIfAborted(cancelSignal);

      const dataProperty = staticDataToZip[index];

      staticData[dataProperty] = bookdata[dataProperty];
    }

    if (Object.keys(staticData).length) {
      await this.addDataToZip(
        'staticdata.json',
        JSON.stringify(staticData),
        zipWriter,
        progressPerStep
      );
    }

    const finalZip = await zipWriter.close();

    return finalZip;
  }

  protected async addDataToZip(
    name: string,
    data: string | Blob,
    writer: ZipWriter<Blob> | undefined,
    progressBase = 1,
    cancelSignal?: AbortSignal
  ) {
    throwIfAborted(cancelSignal);

    const zipWriter = writer || new ZipWriter(new BlobWriter('application/zip'));

    const progressState = { lastValue: 0, base: progressBase };

    if (data instanceof Blob) {
      await zipWriter.add(name, new BlobReader(data), {
        onprogress: (progress, total) =>
          BaseStorageHandler.reportFunction(progressState, progress, total)
      });
    } else if (data) {
      await zipWriter.add(name, new TextReader(data), {
        onprogress: (progress, total) =>
          BaseStorageHandler.reportFunction(progressState, progress, total)
      });
    }

    return zipWriter;
  }

  protected static reportFunction(
    state: { lastValue: number; base: number },
    progress: number,
    total: number
  ) {
    if (state.base) {
      const newProgress = progress / total;
      const progressDelta = newProgress - state.lastValue;

      state.lastValue = newProgress;

      BaseStorageHandler.reportProgress(progressDelta * state.base);
    }
  }

  protected async readFromZip(
    writer: BlobWriter,
    errorForNoRead: string,
    retrievedData: Entry,
    progressBase: number
  ): Promise<Blob>;
  protected async readFromZip(
    writer: TextWriter,
    errorForNoRead: string,
    retrievedData: Entry,
    progressBase: number
  ): Promise<string>;
  protected async readFromZip(
    writer: BlobWriter | TextWriter,
    errorForNoRead: string,
    retrievedData: Entry,
    progressBase = 1
  ) {
    const progressState = { lastValue: 0, base: progressBase };

    const zipData =
      writer instanceof BlobWriter
        ? await retrievedData.getData?.(writer, {
            onprogress: (progress, total) =>
              BaseStorageHandler.reportFunction(progressState, progress, total)
          })
        : await retrievedData.getData?.(writer, {
            onprogress: (progress, total) =>
              BaseStorageHandler.reportFunction(progressState, progress, total)
          });

    if (!zipData) {
      throw new Error(errorForNoRead);
    }

    return zipData;
  }

  protected async extractBookData(
    book: Blob,
    filename: string,
    progressBase = 1,
    cancelSignal?: AbortSignal
  ) {
    const bookreader = new ZipReader(new BlobReader(book));
    const bookDataEntries = await bookreader.getEntries();

    if (!bookDataEntries.length) {
      BaseStorageHandler.reportProgress(progressBase);

      return undefined;
    }

    const bookObject: Omit<BooksDbBookData, 'id'> = {
      title: '',
      styleSheet: '',
      elementHtml: '',
      blobs: {} as Record<string, Blob>,
      coverImage: '',
      hasThumb: true,
      characters: 0,
      sections: [],
      tags: [],
      lastBookModified: 0,
      lastBookOpen: 0
    };

    const bookObjectTransforms = [];
    const limiter = pLimit(1);
    const progressPerStep = progressBase / bookDataEntries.length;

    for (let index = 0, { length } = bookDataEntries; index < length; index += 1) {
      bookObjectTransforms.push(
        limiter(async () => {
          try {
            throwIfAborted(cancelSignal);

            const entry = bookDataEntries[index];

            if (entry.filename === 'staticdata.json') {
              const staticData = JSON.parse(
                await this.readFromZip(
                  new TextWriter(),
                  'Unable to read Static Data',
                  entry,
                  progressPerStep
                )
              ) as Omit<
                BooksDbBookData,
                | 'id'
                | 'blobs'
                | 'hasThumb'
                | 'coverImage'
                | 'lastBookModified'
                | 'lastBookOpen'
                | 'storageSource'
              >;

              if (!staticData.elementHtml) {
                throw new Error(`Invalid bookdata - empty element html`);
              }

              const { characters, lastBookModified, lastBookOpen } =
                BaseStorageHandler.getBookMetadata(filename);

              bookObject.title = staticData.title;
              bookObject.elementHtml = staticData.elementHtml;
              bookObject.styleSheet = staticData.styleSheet || '';
              bookObject.sections = staticData.sections || [];
              bookObject.tags = Array.isArray(staticData.tags) ? staticData.tags : [];
              bookObject.characters = BaseStorageHandler.getBookCharacters(
                characters || 0,
                bookObject.sections
              );
              bookObject.lastBookModified = lastBookModified;
              bookObject.lastBookOpen = lastBookOpen;

              if (staticData.htmlBackup) {
                bookObject.htmlBackup = staticData.htmlBackup;
              }
            } else if (entry.filename.startsWith('blobs/')) {
              const imagePath = entry.filename.replace('blobs/', '');
              const existingBlobEntries = bookObject.blobs || {};

              existingBlobEntries[imagePath] = await this.readFromZip(
                new BlobWriter(BaseStorageHandler.getImageMimeTypeFromExtension(imagePath)),
                'Unable to read blob data',
                entry,
                progressPerStep
              );
              bookObject.blobs = existingBlobEntries;
            } else if (entry.filename.startsWith('cover.')) {
              bookObject.coverImage = await this.readFromZip(
                new BlobWriter(BaseStorageHandler.getImageMimeTypeFromExtension(entry.filename)),
                'Unable to read cover data',
                entry,
                progressPerStep
              );
            }
          } catch (error) {
            limiter.clearQueue();
            throw error;
          }
        })
      );
    }

    await Promise.all(bookObjectTransforms);

    return bookObject;
  }

  protected async extractAsJSON(entry: Entry, errorMessage: string, progressBase = 0.9) {
    if (!entry) {
      return undefined;
    }

    const jsonData = JSON.parse(
      await this.readFromZip(new TextWriter(), errorMessage, entry, progressBase)
    );

    return jsonData;
  }

  protected setRootFile(filename: string, file: ExternalFile) {
    for (let index = 0, { length } = this.validRootFiles; index < length; index += 1) {
      const validRootFile = this.validRootFiles[index];

      if (filename.startsWith(validRootFile)) {
        this.rootFiles.set(validRootFile, file);
      }
    }
  }

  protected static getDummyId() {
    return Math.floor(Date.now() * Math.random());
  }

  protected static sanitizeForFilename(title: string) {
    return title
      .replace(/[ ]$/, '~ttu-spc~')
      .replace(/[.]$/, '~ttu-dend~')
      .replace(/\*/g, '~ttu-star~')
      .replace(/[/?<>\\:*|%"]/g, (match) => encodeURIComponent(match));
  }

  protected static desanitizeFilename(title: string) {
    return decodeURIComponent(title)
      .replaceAll('~ttu-star~', '*')
      .replaceAll('~ttu-dend~', '.')
      .replaceAll('~ttu-spc~', ' ');
  }

  protected static getBookFileName(
    book: Omit<BooksDbBookData, 'id'> | File,
    existingFilename?: string
  ) {
    if (book instanceof File) {
      return book.name;
    }

    if (existingFilename) {
      const { characters, lastBookModified } = BaseStorageHandler.getBookMetadata(existingFilename);

      return `bookdata_${exporterVersion}_${currentDbVersion}_${
        characters ||
        BaseStorageHandler.getBookCharacters(book.characters || 0, book.sections || [])
      }_${book.lastBookModified || lastBookModified || 0}.zip`;
    }

    return `bookdata_${exporterVersion}_${currentDbVersion}_${BaseStorageHandler.getBookCharacters(
      book.characters || 0,
      book.sections || []
    )}_${book.lastBookModified || 0}.zip`;
  }

  protected static getProgressFileName(progress: BooksDbBookmarkData | File) {
    return progress instanceof File
      ? progress.name
      : `progress_${exporterVersion}_${currentDbVersion}_${progress.lastBookmarkModified || 0}_${
          progress.progress || 0
        }.json`;
  }

  protected static getAudioBookFileName(audioBook: BooksDbAudioBook | File) {
    return audioBook instanceof File
      ? audioBook.name
      : `${FilePrefix.AUDIO_BOOK}${exporterVersion}_${currentDbVersion}_${audioBook.lastAudioBookModified}_${audioBook.playbackPosition}.json`;
  }

  protected static getSubtitleDataFileName(data: BooksDbSubtitleData | File) {
    return data instanceof File
      ? data.name
      : `${FilePrefix.SUBTITLE}${exporterVersion}_${currentDbVersion}_${data.lastSubtitleDataModified}_${data.subtitleData.subtitles.length}.json`;
  }

  protected static getUserBookmarksFileName(
    userBookmarks: BooksDbUserBookmarkData[] | File,
    lastModified?: number
  ) {
    if (userBookmarks instanceof File) {
      return userBookmarks.name;
    }

    const modified =
      lastModified || Math.max(...userBookmarks.map((b) => b.lastModified || 0), Date.now());

    return `${FilePrefix.USER_BOOKMARKS}${exporterVersion}_${currentDbVersion}_${modified}_${userBookmarks.length}.json`;
  }

  protected static async getCoverFileName(cover: Blob) {
    const type = (await BaseStorageHandler.determineImageExtension(cover)) || 'jpeg';

    return `cover_${exporterVersion}_${currentDbVersion}.${type}`;
  }

  protected static getBookMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.zip$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      characters: +parts[3],
      lastBookModified: +parts[4],
      // v2 filenames deliberately omit device-local recency. Keep parsing
      // v1 filenames so existing cloud and backup files remain readable.
      lastBookOpen: Number.isFinite(+parts[5]) ? +parts[5] : 0
    };
  }

  protected static getProgressMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastBookmarkModified: +parts[3],
      progress: +parts[4]
    };
  }

  protected static getReadingGoalsMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastGoalModified: +parts[3]
    };
  }

  protected static getProfilesMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastProfilesModified: +parts[3]
    };
  }

  protected static getBookTagsMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastTagsModified: +parts[3]
    };
  }

  protected static getAudioBookMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastAudioBookModified: +parts[3],
      playbackPosition: +parts[4]
    };
  }

  protected static getSubtitleDataMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastSubtitleDataModified: +parts[3],
      subtitleCount: +parts[4]
    };
  }

  protected static getUserBookmarksMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastUserBookmarksModified: +parts[3],
      bookmarkCount: +parts[4]
    };
  }

  private static async determineImageExtension(cover: Blob) {
    if (cover.type) {
      return cover.type.replace('image/', '') || 'jpeg';
    }

    let buffer: Uint8Array;

    try {
      if (typeof cover.arrayBuffer === 'function') {
        buffer = new Uint8Array(await cover.arrayBuffer());
      } else {
        buffer = await this.readBufferForBlob(cover);
      }

      const magicBytes = buffer.slice(0, 4);

      let hexSignature = '';

      for (let index = 0, { length } = magicBytes; index < length; index += 1) {
        hexSignature += magicBytes[index].toString(16);
      }

      switch (true) {
        case /^89504e47/.test(hexSignature):
          return 'png';
        case /^47494638/.test(hexSignature):
          return 'gif';
        case /^424d/.test(hexSignature):
          return 'bmp';
        case /^52494646/.test(hexSignature):
          return 'webp';
        default:
          return 'jpeg';
      }
    } catch (_error) {
      return 'jpeg';
    }
  }

  private static readBufferForBlob(blob: Blob): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener('load', () => {
        resolve(new Uint8Array(reader.result as ArrayBuffer));
      });

      reader.addEventListener('error', () => {
        reject(new Error(`Error reading Blob`));
      });

      reader.readAsArrayBuffer(blob);
    });
  }
}
