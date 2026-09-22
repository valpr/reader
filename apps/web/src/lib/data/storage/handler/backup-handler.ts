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
import type { MergeMode } from '$lib/data/merge-mode';
import type {
  ReaderProfile,
  ReaderProfilesSyncPayload,
  StatisticsSyncSection
} from '$lib/data/profiles/profile-types';
import {
  dictFromEntries,
  entriesFromDict,
  type BookTagEntries,
  type BookTagsDict,
  type BookTagsSyncPayload
} from '$lib/data/book-tags';
import { readingGoalSortFunction } from '$lib/data/reading-goal';
import {
  getContributionFileName,
  getMigrationMarkerFileName,
  isContributionFile,
  isContributionFileName,
  isMigrationMarkerFileName,
  isStatisticMigrationMarker,
  type StatisticContributionFile,
  type StatisticMigrationMarker
} from '$lib/functions/statistic-v2';
import { BaseStorageHandler, FilePrefix } from '$lib/data/storage/handler/base-handler';
import type { ThemeOption } from '$lib/data/theme-option';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import { BlobReader, BlobWriter, ZipReader, type Entry, type ZipWriter } from '@zip.js/zip.js';

export class BackupStorageHandler extends BaseStorageHandler {
  private exportZipWriter: ZipWriter<Blob> | undefined;

  private importReader: ZipReader<Blob> | undefined;

  private importEntries: Entry[] = [];

  /** Stable v2 names already appended to the in-progress export zip. */
  private exportedV2Names = new Set<string>();

  getBookList() {
    return Promise.resolve([]);
  }

  checkHasData(): Promise<{ connected: boolean; hasData: boolean }> {
    return Promise.resolve({ connected: false, hasData: false });
  }

  prepareBookForReading(_context: ReplicationContext) {
    return Promise.resolve(0);
  }

  updateLastRead(_book: BooksDbBookData, _context: ReplicationContext) {
    return Promise.resolve();
  }

  isBookPresentAndUpToDate(_referenceFilename: string | undefined, _context: ReplicationContext) {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  isProgressPresentAndUpToDate(
    _referenceFilename: string | undefined,
    _context: ReplicationContext
  ) {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  isUserBookmarksPresentAndUpToDate(
    _referenceFilename: string | undefined,
    _context: ReplicationContext
  ) {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  areStatisticsPresentAndUpToDate(
    _referenceFilename: string | undefined,
    _context: ReplicationContext
  ) {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  areReadingGoalsPresentAndUpToDate() {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  areProfilesPresentAndUpToDate() {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  areBookTagsPresentAndUpToDate() {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  isAudioBookPresentAndUpToDate(
    _referenceFilename: string | undefined,
    _context: ReplicationContext
  ) {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  isSubtitleDataPresentAndUpToDate(
    _referenceFilename: string | undefined,
    _context: ReplicationContext
  ) {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  deleteBookData() {
    return Promise.resolve({ error: '', deleted: [] });
  }

  deleteBookProgressAndStats(_title: string): Promise<void> {
    return Promise.resolve();
  }

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

  clearData(clearAll = true) {
    if (clearAll) {
      this.exportZipWriter = undefined;
      this.importReader = undefined;
      this.importEntries = [];
      this.exportedV2Names.clear();
    }
  }

  async setBackupZip(data: Blob) {
    this.importReader = new ZipReader(new BlobReader(data));
    this.importEntries = await this.importReader.getEntries();

    const titles = new Map<string, ReplicationContext>();

    for (let index = 0, { length } = this.importEntries; index < length; index += 1) {
      const entry = this.importEntries[index];
      const nameParts = entry.filename.split('/');
      const sanitizedTitle = nameParts[0];
      const title = BaseStorageHandler.desanitizeFilename(sanitizedTitle);

      if (nameParts.length === 1) {
        this.setRootFile(title, { id: title, name: title });
      } else if (nameParts.length > 1) {
        const context = titles.get(title) || { title, imagePath: '' };

        if (entry.filename.startsWith(`${sanitizedTitle}/cover_`)) {
          context.imagePath = entry;
        }

        titles.set(title, context);
      }
    }

    return [...titles.values()];
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

    const { filename } = this.validRootFiles.includes(fileIdentifier)
      ? this.getRootFile(fileIdentifier)
      : this.findEntry(fileIdentifier, 0.1, context!);

    BaseStorageHandler.completeStep();

    return filename;
  }

  async getBook(context: ReplicationContext) {
    const { zipEntry, filename } = this.findEntry('bookdata_', 0.1, context);

    if (!zipEntry) {
      return undefined;
    }

    const bookBlob = await this.readFromZip(
      new BlobWriter(),
      'Unable to read book data',
      zipEntry,
      this.isForBrowser ? 0.3 : 0.9
    );

    return this.isForBrowser
      ? this.extractBookData(bookBlob, filename, 0.6)
      : new File([bookBlob], filename, { type: 'application/zip' });
  }

  async getProgress(context: ReplicationContext) {
    const { zipEntry, filename } = this.findEntry('progress_', 0.1, context);

    if (!zipEntry) {
      return undefined;
    }

    if (this.isForBrowser) {
      return this.extractAsJSON(zipEntry, 'Unable to read progress data');
    }

    const progressBlob = await this.readFromZip(
      new BlobWriter(),
      'Unable to read progress data',
      zipEntry,
      0.9
    );

    return new File([progressBlob], filename, { type: 'application/json' });
  }

  async getUserBookmarks(context: ReplicationContext) {
    const { zipEntry, filename } = this.findEntry(FilePrefix.USER_BOOKMARKS, 0.1, context);

    if (!zipEntry) {
      return undefined;
    }

    if (this.isForBrowser) {
      return this.extractAsJSON(zipEntry, 'Unable to read user bookmarks data');
    }

    const ubBlob = await this.readFromZip(
      new BlobWriter(),
      'Unable to read user bookmarks data',
      zipEntry,
      0.9
    );

    return new File([ubBlob], filename, { type: 'application/json' });
  }

  async getStatistics(context: ReplicationContext) {
    const { zipEntry, filename } = this.findEntry('statistics_', 0.1, context);

    if (!zipEntry) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }

    const statistics = await this.extractAsJSON(zipEntry, 'Unable to read statistics');

    return {
      statistics,
      lastStatisticModified:
        BaseStorageHandler.getStatisticsMetadata(filename).lastStatisticModified
    };
  }

  async getCover(context: ReplicationContext) {
    const ctx = context;
    if (ctx.imagePath instanceof Blob) {
      BaseStorageHandler.reportProgress();

      return ctx.imagePath;
    }

    const { zipEntry } = this.findEntry('cover_', 0.1, context);

    if (!zipEntry) {
      return undefined;
    }

    const cover = await this.readFromZip(
      new BlobWriter(),
      'Unable to read cover data',
      zipEntry,
      0.9
    );

    return cover;
  }

  async getReadingGoals() {
    const { zipEntry, filename } = this.getRootFile(BaseStorageHandler.readingGoalsFilePrefix);

    if (!zipEntry) {
      return { readingGoals: undefined, lastGoalModified: 0 };
    }

    const readingGoals = await this.extractAsJSON(zipEntry, 'Unable to read reading goals');

    return {
      readingGoals,
      lastGoalModified: BaseStorageHandler.getReadingGoalsMetadata(filename).lastGoalModified
    };
  }

  async getProfiles() {
    const { zipEntry, filename } = this.getRootFile(BaseStorageHandler.profilesFilePrefix);

    if (!zipEntry) {
      return {
        profiles: undefined,
        customThemes: undefined,
        statisticsSettings: undefined,
        lastProfilesModified: 0
      };
    }

    const payload = (await this.extractAsJSON(
      zipEntry,
      'Unable to read reader profiles'
    )) as ReaderProfilesSyncPayload;

    return {
      profiles: payload?.profiles,
      customThemes: payload?.customThemes,
      statisticsSettings: payload?.statisticsSettings,
      lastProfilesModified: BaseStorageHandler.getProfilesMetadata(filename).lastProfilesModified
    };
  }

  async getBookTags() {
    const { zipEntry, filename } = this.getRootFile(BaseStorageHandler.bookTagsFilePrefix);

    if (!zipEntry) {
      return { tags: undefined, titles: undefined, lastTagsModified: 0, entries: undefined };
    }

    const payload = (await this.extractAsJSON(
      zipEntry,
      'Unable to read book tags'
    )) as BookTagsSyncPayload;

    // v1 backups stay dict-only downstream (see ApiStorageHandler.getBookTags).
    const entries = payload?.entries;

    return {
      tags: payload?.tagsByTitle || dictFromEntries(entries),
      titles: payload?.titles,
      lastTagsModified: BaseStorageHandler.getBookTagsMetadata(filename).lastTagsModified,
      entries
    };
  }

  async getAudioBook(context: ReplicationContext) {
    const { zipEntry, filename } = this.findEntry(FilePrefix.AUDIO_BOOK, 0.1, context);

    if (!zipEntry) {
      return undefined;
    }

    if (this.isForBrowser) {
      return this.extractAsJSON(zipEntry, 'Unable to read audioBook data');
    }

    const audioBookBlob = await this.readFromZip(
      new BlobWriter(),
      'Unable to read audioBook data',
      zipEntry,
      0.9
    );

    return new File([audioBookBlob], filename, { type: 'application/json' });
  }

  async getSubtitleData(context: ReplicationContext) {
    const { zipEntry, filename } = this.findEntry(FilePrefix.SUBTITLE, 0.1, context);

    if (!zipEntry) {
      return undefined;
    }

    if (this.isForBrowser) {
      return this.extractAsJSON(zipEntry, 'Unable to read subtitles data');
    }

    const subtitleDataBlob = await this.readFromZip(
      new BlobWriter(),
      'Unable to read subtitles data',
      zipEntry,
      0.9
    );

    return new File([subtitleDataBlob], filename, { type: 'application/json' });
  }

  async saveBook(
    data: Omit<BooksDbBookData, 'id'> | File,
    _skipTimestampFallback = true,
    _removeStorageContext = true,
    context: ReplicationContext
  ) {
    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const filename = `${sanitizedTitle}/${BaseStorageHandler.getBookFileName(data)}`;

    if (data instanceof File) {
      this.exportZipWriter = await this.addDataToZip(filename, data, this.exportZipWriter);
    } else {
      this.exportZipWriter = await this.addDataToZip(
        filename,
        await this.zipBookData(data, 0.5),
        this.exportZipWriter,
        0.5
      );
    }

    return 0;
  }

  async saveProgress(data: BooksDbBookmarkData | File, context: ReplicationContext) {
    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const filename = `${sanitizedTitle}/${BaseStorageHandler.getProgressFileName(data)}`;

    if (data instanceof File) {
      this.exportZipWriter = await this.addDataToZip(filename, data, this.exportZipWriter);
    } else {
      this.exportZipWriter = await this.addDataToZip(
        filename,
        JSON.stringify(data),
        this.exportZipWriter
      );
    }
  }

  async saveUserBookmarks(data: BooksDbUserBookmarkData[] | File, context: ReplicationContext) {
    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const filename = `${sanitizedTitle}/${BaseStorageHandler.getUserBookmarksFileName(data)}`;

    if (data instanceof File) {
      this.exportZipWriter = await this.addDataToZip(filename, data, this.exportZipWriter);
    } else {
      this.exportZipWriter = await this.addDataToZip(
        filename,
        JSON.stringify(data),
        this.exportZipWriter
      );
    }
  }

  async saveStatistics(
    data: BooksDbStatistic[],
    lastStatisticModified: number,
    context: ReplicationContext
  ) {
    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const filename = `${sanitizedTitle}/${BaseStorageHandler.getStatisticsFileName(
      data,
      lastStatisticModified
    )}`;

    data.sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));

    this.exportZipWriter = await this.addDataToZip(
      filename,
      JSON.stringify(data),
      this.exportZipWriter
    );
  }

  async saveCover(data: Blob | undefined, context: ReplicationContext) {
    if (!data) {
      BaseStorageHandler.reportProgress();
      return;
    }

    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const filename = await BaseStorageHandler.getCoverFileName(data);
    this.exportZipWriter = await this.addDataToZip(
      `${sanitizedTitle}/${filename}`,
      data,
      this.exportZipWriter
    );
  }

  async saveReadingGoals(data: BooksDbReadingGoal[], lastGoalModified: number) {
    const filename = `${BaseStorageHandler.getReadingGoalsFileName(lastGoalModified)}`;

    data.sort(readingGoalSortFunction);

    this.exportZipWriter = await this.addDataToZip(
      filename,
      JSON.stringify(data),
      this.exportZipWriter
    );
  }

  async saveProfiles(
    data: ReaderProfile[],
    lastProfilesModified: number,
    customThemes?: Record<string, ThemeOption>,
    statisticsSettings?: StatisticsSyncSection
  ) {
    const filename = `${BaseStorageHandler.getProfilesFileName(lastProfilesModified)}`;
    const payload: ReaderProfilesSyncPayload = {
      version: 1,
      lastModified: lastProfilesModified,
      profiles: data,
      customThemes,
      statisticsSettings
    };

    this.exportZipWriter = await this.addDataToZip(
      filename,
      JSON.stringify(payload),
      this.exportZipWriter
    );
  }

  async saveBookTags(
    tags: BookTagsDict | File,
    titles: Record<string, string> | undefined,
    lastTagsModified: number,
    entries?: BookTagEntries
  ) {
    // Backup export carries the v2 entries alongside the mirror so a
    // restore preserves deletion state; v1 backups (no entries) import
    // through the dict-only path on the browser side.
    const resolvedEntries =
      entries || entriesFromDict(tags instanceof File ? {} : tags, lastTagsModified, '');
    const filename = `${BaseStorageHandler.getBookTagsFileName(lastTagsModified || Date.now())}`;
    const payload: BookTagsSyncPayload = {
      version: 2,
      lastModified: lastTagsModified || Date.now(),
      entries: resolvedEntries,
      tagsByTitle: tags instanceof File ? dictFromEntries(resolvedEntries) : (tags as BookTagsDict),
      titles
    };

    this.exportZipWriter = await this.addDataToZip(
      filename,
      JSON.stringify(payload),
      this.exportZipWriter
    );
  }

  async saveAudioBook(data: BooksDbAudioBook | File, context: ReplicationContext) {
    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const filename = `${sanitizedTitle}/${BaseStorageHandler.getAudioBookFileName(data)}`;

    if (data instanceof File) {
      this.exportZipWriter = await this.addDataToZip(filename, data, this.exportZipWriter);
    } else {
      this.exportZipWriter = await this.addDataToZip(
        filename,
        JSON.stringify(data),
        this.exportZipWriter
      );
    }
  }

  async saveSubtitleData(data: BooksDbSubtitleData | File, context: ReplicationContext) {
    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const filename = `${sanitizedTitle}/${BaseStorageHandler.getSubtitleDataFileName(data)}`;

    if (data instanceof File) {
      this.exportZipWriter = await this.addDataToZip(filename, data, this.exportZipWriter);
    } else {
      this.exportZipWriter = await this.addDataToZip(
        filename,
        JSON.stringify(data),
        this.exportZipWriter
      );
    }
  }

  /**
   * Statistics v2 backup side (P3/P4): contribution and marker files live at
   * the zip root under stable names. While importing, lists read the import
   * zip and writes are no-ops; while exporting, writes append entries.
   */
  private get isImportMode(): boolean {
    return !!this.importReader && !this.exportZipWriter;
  }

  async listContributionFiles(): Promise<StatisticContributionFile[]> {
    const files: StatisticContributionFile[] = [];

    for (const entry of this.importEntries) {
      if (!isContributionFileName(entry.filename)) continue;
      try {
        const payload = await this.extractAsJSON(entry, 'Unable to read contribution file');
        if (isContributionFile(payload)) files.push(payload);
      } catch {
        // A single unreadable entry must not fail the whole restore.
      }
    }

    return files;
  }

  async writeContributionFiles(contributionFiles: StatisticContributionFile[]): Promise<void> {
    if (this.isImportMode) return;

    for (const payload of contributionFiles) {
      if (!isContributionFile(payload)) continue;
      const name = getContributionFileName(payload.deviceId, payload.year);
      if (this.exportedV2Names.has(name)) continue;
      this.exportedV2Names.add(name);
      this.exportZipWriter = await this.addDataToZip(
        name,
        JSON.stringify(payload),
        this.exportZipWriter
      );
    }
  }

  async listMigrationMarkers(): Promise<StatisticMigrationMarker[]> {
    const markers: StatisticMigrationMarker[] = [];

    for (const entry of this.importEntries) {
      if (!isMigrationMarkerFileName(entry.filename)) continue;
      try {
        const payload = await this.extractAsJSON(entry, 'Unable to read migration marker');
        if (isStatisticMigrationMarker(payload)) markers.push(payload);
      } catch {
        // Ignore unreadable markers; the tie-break uses the readable ones.
      }
    }

    return markers;
  }

  async writeMigrationMarker(marker: StatisticMigrationMarker): Promise<void> {
    if (this.isImportMode || !isStatisticMigrationMarker(marker)) return;
    const name = getMigrationMarkerFileName(marker.deviceId);
    if (this.exportedV2Names.has(name)) return;
    this.exportedV2Names.add(name);
    this.exportZipWriter = await this.addDataToZip(
      name,
      JSON.stringify(marker),
      this.exportZipWriter
    );
  }

  async listLegacyStatisticSnapshots(): Promise<BooksDbStatistic[][]> {
    const snapshots: BooksDbStatistic[][] = [];

    for (const entry of this.importEntries) {
      const slash = entry.filename.indexOf('/');
      if (slash < 0 || !entry.filename.slice(slash + 1).startsWith('statistics_')) continue;
      try {
        const rows = await this.extractAsJSON(entry, 'Unable to read statistics');
        if (Array.isArray(rows) && rows.length) snapshots.push(rows);
      } catch {
        // Best-effort migration read: skip unreadable entries.
      }
    }

    return snapshots;
  }

  async createExportZip(document: Document, resetOnly: boolean) {
    if (!resetOnly && this.exportZipWriter) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await this.exportZipWriter.close());
      a.rel = 'noopener';
      a.download = `ttu-reader-export-${new Date()
        .toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        .replaceAll(/[/:, ]+/g, '-')}.zip`;

      setTimeout(() => {
        URL.revokeObjectURL(a.href);
      }, 1e4);

      setTimeout(() => {
        a.click();
        this.clearData();
      });
    } else if (resetOnly) {
      this.clearData();
    }
  }
  private findEntry(filePrefix: string, progressBase = 0.1, context: ReplicationContext) {
    const ctx = context;
    const sanitizedTitle = BaseStorageHandler.sanitizeForFilename(ctx.title);
    const zipEntry = this.importEntries.find((entry) =>
      entry.filename.startsWith(`${sanitizedTitle}/${filePrefix}`)
    );

    BaseStorageHandler.reportProgress(progressBase);

    return { zipEntry, filename: zipEntry?.filename.replace(`${sanitizedTitle}/`, '') || '' };
  }

  private getRootFile(filePrefix: string, progressBase = 0.1) {
    const rootFile = this.rootFiles.get(filePrefix);
    const zipEntry = rootFile
      ? this.importEntries.find((entry) => entry.filename === rootFile.name)
      : undefined;

    BaseStorageHandler.reportProgress(progressBase);

    return { zipEntry, filename: zipEntry?.filename || '' };
  }
}
