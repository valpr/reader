/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import { mergeUserBookmarkArrays } from '$lib/data/user-bookmarks-merge';

/**
 * TEST-ONLY in-memory storage-handler double for bookmark sync specs. Never
 * imported by production code (nothing references this module outside
 * `apps/web/tests`), so it is tree-shaken out of every prod bundle.
 *
 * NOTE: specs import it inside `page.evaluate` (browser context via the vite
 * dev server, e.g. `await import('/src/lib/functions/replication/user-bookmarks-sync-test-double.ts')`),
 * never statically — Node-side spec code cannot resolve the `$lib` alias,
 * and it must live under `src/` (not `tests/`) because vite's
 * `server.fs.allow` list does not serve `tests/` to the browser. Import and
 * use happen in the same evaluate call, so HMR reloads between tests cannot
 * drop the class reference.
 *
 * It drives the real `replicateData` with counted I/O:
 * `bodyFetches` (row reads), `metaLists` (metadata listings), `writes`
 * (bookmark saves) and `coverWrites`, so specs can assert skip-vs-fetch
 * behavior. `acceptSaves = false` simulates a missing local book row (the
 * merge becomes a no-op, as `storeUserBookmarks` does without a `data`
 * record). `clearData` is deliberately a no-op: rows/files model persisted
 * state, of which this double keeps no separate cache.
 */
export class MemoryBookmarksHandler extends BaseStorageHandler {
  rows: any;
  files: any;
  bodyFetches: any;
  metaLists: any;
  writes: any;
  coverWrites: any;
  acceptSaves: any;

  constructor(win: any, storageType: any, sourceName: any) {
    super(win, storageType);
    this.storageSourceName = sourceName;
    this.rows = [];
    this.files = [];
    this.bodyFetches = 0;
    this.metaLists = 0;
    this.writes = 0;
    this.coverWrites = 0;
    this.acceptSaves = true;
  }

  updateSettings(
    win: any,
    isForBrowser: any,
    saveBehavior: any,
    statisticsMergeMode: any,
    readingGoalsMergeMode: any,
    cacheStorageData: any,
    askForStorageUnlock: any,
    storageSourceName: any
  ) {
    this.window = win;
    this.isForBrowser = isForBrowser;
    this.saveBehavior = saveBehavior;
    this.cacheStorageData = cacheStorageData;
    this.askForStorageUnlock = askForStorageUnlock;
    if (storageSourceName) this.storageSourceName = storageSourceName;
  }

  mintFilename() {
    const max = Math.max(0, ...this.rows.map((row: any) => row.lastModified || 0));
    this.files = [{ name: `userBookmarks_1_1_${max}_${this.rows.length}.json` }];
  }

  async getBookList(): Promise<any> {
    return [];
  }

  async checkHasData(): Promise<any> {
    return { connected: true, hasData: true };
  }

  clearData(_clearAll?: any): any {}

  async prepareBookForReading(_context: any): Promise<any> {
    return 0;
  }

  async updateLastRead(_book: any, _context: any): Promise<any> {}

  async getFilenameForRecentCheck(fileIdentifier: any, _context?: any): Promise<any> {
    return this.files.find((file: any) => file.name.startsWith(fileIdentifier))?.name;
  }

  async isBookPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async isProgressPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async areStatisticsPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async areReadingGoalsPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async areProfilesPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async areBookTagsPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async isAudioBookPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async isSubtitleDataPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async isUserBookmarksPresentAndUpToDate(): Promise<any> {
    return false;
  }

  async listFilesWithPrefix(prefix: any, _context: any): Promise<any> {
    this.metaLists += 1;
    return this.files
      .filter((file: any) => file.name.startsWith(prefix))
      .map((file: any) => ({ name: file.name }));
  }

  async getBook(): Promise<any> {}

  async getProgress(): Promise<any> {}

  async getUserBookmarks(): Promise<any> {
    this.bodyFetches += 1;
    if (!this.files.length) return undefined;
    return this.rows.map((row: any) => ({ ...row }));
  }

  async getStatistics(): Promise<any> {
    return { statistics: undefined, lastStatisticModified: 0 };
  }

  async getCover(): Promise<any> {}

  async getReadingGoals(): Promise<any> {
    return { readingGoals: undefined, lastGoalModified: 0 };
  }

  async getProfiles(): Promise<any> {
    return {
      profiles: undefined,
      customThemes: undefined,
      statisticsSettings: undefined,
      lastProfilesModified: 0
    };
  }

  async getBookTags(): Promise<any> {
    return { tags: undefined, titles: undefined, lastTagsModified: 0, entries: undefined };
  }

  async getAudioBook(): Promise<any> {}

  async getSubtitleData(): Promise<any> {}

  async saveBook(): Promise<any> {
    return 0;
  }

  async saveProgress(): Promise<any> {}

  async saveUserBookmarks(data: any): Promise<any> {
    this.writes += 1;
    if (data instanceof File) return;
    if (!this.acceptSaves) return;
    this.rows = mergeUserBookmarkArrays(data, this.rows);
    this.mintFilename();
  }

  async saveStatistics(): Promise<any> {}

  async listContributionFiles(): Promise<any> {
    return [];
  }

  async writeContributionFiles(): Promise<any> {}

  async listMigrationMarkers(): Promise<any> {
    return [];
  }

  async writeMigrationMarker(): Promise<any> {}

  async listLegacyStatisticSnapshots(): Promise<any> {
    return [];
  }

  async saveCover(): Promise<any> {
    this.coverWrites += 1;
  }

  async saveReadingGoals(): Promise<any> {}

  async saveProfiles(): Promise<any> {}

  async saveBookTags(): Promise<any> {}

  async saveAudioBook(): Promise<any> {}

  async saveSubtitleData(): Promise<any> {}

  async deleteBookData(): Promise<any> {
    return { error: '', deleted: [] };
  }

  async deleteBookProgressAndStats(): Promise<any> {}
}
