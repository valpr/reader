/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

/**
 * MemoryBookmarksHandler counter semantics (defined inline per test — see
 * design note below):
 *   bodyFetches  — calls to getUserBookmarks() (body download equivalent)
 *   metaLists    — calls to listFilesWithPrefix() (metadata-only listing)
 *   writes       — calls to saveUserBookmarks()
 *   coverWrites  — calls to saveCover()
 *
 * Tests that don't assert on a particular counter simply ignore it.
 *
 * Design note: the handler class is defined inside each test's
 * page.evaluate rather than in a shared beforeEach+evaluate pair because
 * Vite's HMR reload (which fires on dev-server startup) destroys the JS
 * execution context between two separate evaluate calls, dropping any
 * class reference stored on window.  The one-liner method style keeps
 * per-test boilerplate compact without that cross-evaluate race.
 */

test.describe('User bookmarks exact-state sync gate', () => {
  test.describe.configure({ timeout: 120_000 });

  test('second sync skips bodies when nothing changed', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const basePath = '/src/lib/data/storage/handler/base-handler.ts';
      const mergePath = '/src/lib/data/user-bookmarks-merge.ts';
      const { BaseStorageHandler } = await import(/* @vite-ignore */ basePath);
      const { mergeUserBookmarkArrays } = await import(/* @vite-ignore */ mergePath);

      class MemoryBookmarksHandler extends BaseStorageHandler {
        rows: any;
        files: any;
        bodyFetches: any;
        metaLists: any;
        writes: any;
        coverWrites: any;

        constructor(win: any, storageType: any, sourceName: any) {
          super(win, storageType);
          this.storageSourceName = sourceName;
          this.rows = [];
          this.files = [];
          this.bodyFetches = 0;
          this.metaLists = 0;
          this.writes = 0;
          this.coverWrites = 0;
        }

        updateSettings(
          win: any,
          isForBrowser: any,
          saveBehavior: any,
          _statisticsMergeMode?: any,
          _readingGoalsMergeMode?: any,
          cacheStorageData?: any,
          askForStorageUnlock?: any,
          storageSourceName?: any
        ) {
          this.window = win;
          this.isForBrowser = isForBrowser;
          this.saveBehavior = saveBehavior;
          if (cacheStorageData !== undefined) this.cacheStorageData = cacheStorageData;
          if (askForStorageUnlock !== undefined) this.askForStorageUnlock = askForStorageUnlock;
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

      const context = { title: 'UB State Clean', imagePath: '' };
      const types = [StorageDataType.USER_BOOKMARKS];
      const remote = new MemoryBookmarksHandler(window, StorageKey.GDRIVE, 'test-remote');
      const browser = new MemoryBookmarksHandler(window, StorageKey.BROWSER, 'test-browser');
      remote.rows = [
        { syncId: 'a', exploredCharCount: 10, createdAt: 100, lastModified: 100, label: 'A' }
      ];
      remote.mintFilename();

      const first = await replicateData(remote, browser, false, [context], types, undefined, true);
      const afterFirst = {
        remoteFetches: remote.bodyFetches,
        remoteWrites: remote.writes,
        browserWrites: browser.writes,
        coverWrites: browser.coverWrites,
        browserRows: browser.rows.length
      };
      const second = await replicateData(remote, browser, false, [context], types, undefined, true);

      return {
        first,
        second,
        afterFirst,
        remoteFetches: remote.bodyFetches,
        remoteWrites: remote.writes,
        browserWrites: browser.writes,
        coverWrites: browser.coverWrites,
        browserRows: browser.rows.length
      };
    });

    expect(result.first).toBe('');
    expect(result.second).toBe('');
    // First run pulls + merges the single row (and its cover side-effect).
    expect(result.afterFirst).toEqual({
      remoteFetches: 1,
      remoteWrites: 0,
      browserWrites: 1,
      coverWrites: 1,
      browserRows: 1
    });
    // Second run: no body fetches, no writes, no cover traffic.
    expect(result.remoteFetches).toBe(1);
    expect(result.remoteWrites).toBe(0);
    expect(result.browserWrites).toBe(1);
    expect(result.coverWrites).toBe(1);
    expect(result.browserRows).toBe(1);
  });

  test('local and remote edits each trigger a fetch', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const basePath = '/src/lib/data/storage/handler/base-handler.ts';
      const mergePath = '/src/lib/data/user-bookmarks-merge.ts';
      const { BaseStorageHandler } = await import(/* @vite-ignore */ basePath);
      const { mergeUserBookmarkArrays } = await import(/* @vite-ignore */ mergePath);

      class MemoryBookmarksHandler extends BaseStorageHandler {
        rows: any;
        files: any;
        bodyFetches: any;
        writes: any;

        constructor(win: any, storageType: any, sourceName: any) {
          super(win, storageType);
          this.storageSourceName = sourceName;
          this.rows = [];
          this.files = [];
          this.bodyFetches = 0;
          this.writes = 0;
        }

        updateSettings(win: any, isForBrowser: any, saveBehavior: any): any {
          this.window = win;
          this.isForBrowser = isForBrowser;
          this.saveBehavior = saveBehavior;
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
        clearData(): any {}
        async prepareBookForReading(): Promise<any> {
          return 0;
        }
        async updateLastRead(): Promise<any> {}
        async getFilenameForRecentCheck(): Promise<any> {}
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
        async listFilesWithPrefix(prefix: any): Promise<any> {
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
        async saveCover(): Promise<any> {}
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

      const context = { title: 'UB State Edits', imagePath: '' };
      const types = [StorageDataType.USER_BOOKMARKS];
      const remote = new MemoryBookmarksHandler(window, StorageKey.GDRIVE, 'test-remote');
      const browser = new MemoryBookmarksHandler(window, StorageKey.BROWSER, 'test-browser');
      remote.rows = [
        { syncId: 'a', exploredCharCount: 10, createdAt: 100, lastModified: 100, label: 'A' }
      ];
      remote.mintFilename();

      const run = () => replicateData(remote, browser, false, [context], types, undefined, true);
      const first = await run();
      const quiet = await run();
      const fetchesAfterQuiet = remote.bodyFetches;

      // Local-only edit: fingerprint changes, next run must fetch + merge.
      browser.rows.push({
        syncId: 'b',
        exploredCharCount: 20,
        createdAt: 200,
        lastModified: 200,
        label: 'B'
      });
      const afterLocalEdit = await run();
      const fetchesAfterLocalEdit = remote.bodyFetches;

      // Remote-only edit (minted filename, as a real save would): must fetch.
      remote.rows.push({
        syncId: 'c',
        exploredCharCount: 30,
        createdAt: 300,
        lastModified: 300,
        label: 'C'
      });
      remote.mintFilename();
      const afterRemoteEdit = await run();

      return {
        first,
        quiet,
        afterLocalEdit,
        afterRemoteEdit,
        fetchesAfterQuiet,
        fetchesAfterLocalEdit,
        browserRows: browser.rows.length,
        browserLabels: browser.rows.map((row: any) => row.label).sort()
      };
    });

    expect(result.first).toBe('');
    expect(result.quiet).toBe('');
    expect(result.afterLocalEdit).toBe('');
    expect(result.afterRemoteEdit).toBe('');
    expect(result.fetchesAfterQuiet).toBe(1);
    // Exactly one more body fetch per edited side.
    expect(result.fetchesAfterLocalEdit).toBe(2);
    expect(result.browserRows).toBe(3);
    expect(result.browserLabels).toEqual(['A', 'B', 'C']);
  });

  test('remote deletion propagates and marker loss falls back to fetch', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const basePath = '/src/lib/data/storage/handler/base-handler.ts';
      const mergePath = '/src/lib/data/user-bookmarks-merge.ts';
      const { BaseStorageHandler } = await import(/* @vite-ignore */ basePath);
      const { mergeUserBookmarkArrays } = await import(/* @vite-ignore */ mergePath);

      class MemoryBookmarksHandler extends BaseStorageHandler {
        rows: any;
        files: any;
        bodyFetches: any;

        constructor(win: any, storageType: any, sourceName: any) {
          super(win, storageType);
          this.storageSourceName = sourceName;
          this.rows = [];
          this.files = [];
          this.bodyFetches = 0;
        }

        updateSettings(win: any, isForBrowser: any, saveBehavior: any): any {
          this.window = win;
          this.isForBrowser = isForBrowser;
          this.saveBehavior = saveBehavior;
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
        clearData(): any {}
        async prepareBookForReading(): Promise<any> {
          return 0;
        }
        async updateLastRead(): Promise<any> {}
        async getFilenameForRecentCheck(): Promise<any> {}
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
        async listFilesWithPrefix(prefix: any): Promise<any> {
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
          if (data instanceof File) return;
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
        async saveCover(): Promise<any> {}
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

      const context = { title: 'UB State Deletion', imagePath: '' };
      const types = [StorageDataType.USER_BOOKMARKS];
      const remote = new MemoryBookmarksHandler(window, StorageKey.GDRIVE, 'test-remote');
      const browser = new MemoryBookmarksHandler(window, StorageKey.BROWSER, 'test-browser');
      remote.rows = [
        { syncId: 'a', exploredCharCount: 10, createdAt: 100, lastModified: 100, label: 'A' }
      ];
      remote.mintFilename();

      const run = () => replicateData(remote, browser, false, [context], types, undefined, true);
      const first = await run();
      const quiet = await run();
      const fetchesAfterQuiet = remote.bodyFetches;

      // Remote soft-delete with a bumped timestamp must still propagate.
      remote.rows = [
        {
          syncId: 'a',
          exploredCharCount: 10,
          createdAt: 100,
          lastModified: 400,
          label: 'A',
          deleted: true,
          deletedAt: 400
        }
      ];
      remote.mintFilename();
      const afterDelete = await run();
      const fetchesAfterDelete = remote.bodyFetches;
      const deletedFlag = browser.rows.find((row: any) => row.syncId === 'a')?.deleted;

      // Losing the marker must fall back to a full fetch, not a skip.
      localStorage.clear();
      const afterMarkerLoss = await run();

      return {
        first,
        quiet,
        afterDelete,
        afterMarkerLoss,
        fetchesAfterQuiet,
        fetchesAfterDelete,
        deletedFlag: deletedFlag === true,
        browserRows: browser.rows.length
      };
    });

    expect(result.first).toBe('');
    expect(result.quiet).toBe('');
    expect(result.afterDelete).toBe('');
    expect(result.afterMarkerLoss).toBe('');
    expect(result.fetchesAfterQuiet).toBe(1);
    // Deletion changed the remote set (new filename) so it fetches…
    expect(result.fetchesAfterDelete).toBe(2);
    // …and the tombstone wins the merge.
    expect(result.deletedFlag).toBe(true);
    expect(result.browserRows).toBe(1);
  });

  test('overwrite mode never skips', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const optionsPath = '/src/lib/functions/replication/replication-options.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { ReplicationSaveBehavior } = await import(/* @vite-ignore */ optionsPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const basePath = '/src/lib/data/storage/handler/base-handler.ts';
      const mergePath = '/src/lib/data/user-bookmarks-merge.ts';
      const { BaseStorageHandler } = await import(/* @vite-ignore */ basePath);
      const { mergeUserBookmarkArrays } = await import(/* @vite-ignore */ mergePath);

      class MemoryBookmarksHandler extends BaseStorageHandler {
        rows: any;
        files: any;
        bodyFetches: any;

        constructor(win: any, storageType: any, sourceName: any) {
          super(win, storageType);
          this.storageSourceName = sourceName;
          this.rows = [];
          this.files = [];
          this.bodyFetches = 0;
        }

        updateSettings(win: any, isForBrowser: any, saveBehavior: any): any {
          this.window = win;
          this.isForBrowser = isForBrowser;
          this.saveBehavior = saveBehavior;
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
        clearData(): any {}
        async prepareBookForReading(): Promise<any> {
          return 0;
        }
        async updateLastRead(): Promise<any> {}
        async getFilenameForRecentCheck(): Promise<any> {}
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
        async listFilesWithPrefix(prefix: any): Promise<any> {
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
          if (data instanceof File) return;
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
        async saveCover(): Promise<any> {}
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

      const context = { title: 'UB State Overwrite', imagePath: '' };
      const types = [StorageDataType.USER_BOOKMARKS];
      const remote = new MemoryBookmarksHandler(window, StorageKey.GDRIVE, 'test-remote');
      const browser = new MemoryBookmarksHandler(window, StorageKey.BROWSER, 'test-browser');
      remote.updateSettings(window, true, ReplicationSaveBehavior.Overwrite);
      browser.updateSettings(window, true, ReplicationSaveBehavior.Overwrite);
      remote.rows = [
        { syncId: 'a', exploredCharCount: 10, createdAt: 100, lastModified: 100, label: 'A' }
      ];
      remote.mintFilename();

      const run = () => replicateData(remote, browser, false, [context], types, undefined, true);
      const first = await run();
      const second = await run();

      return { first, second, remoteFetches: remote.bodyFetches };
    });

    expect(result.first).toBe('');
    expect(result.second).toBe('');
    // Recovery semantics: every run copies, markers never engage.
    expect(result.remoteFetches).toBe(2);
  });
});
