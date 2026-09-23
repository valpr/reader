/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

/**
 * Bookmark sync specs drive the real `replicateData` with the shared
 * in-memory double (`tests/helpers/memory-bookmarks-handler.ts`), imported
 * fresh inside each test's `page.evaluate` — import and use happen in the
 * same evaluate call, so Vite HMR reloads between tests cannot drop the
 * class reference. Counter semantics live on the double:
 *   bodyFetches  — calls to getUserBookmarks() (body download equivalent)
 *   metaLists    — calls to listFilesWithPrefix() (metadata-only listing)
 *   writes       — calls to saveUserBookmarks()
 *   coverWrites  — calls to saveCover()
 * Tests that don't assert on a particular counter simply ignore it.
 */

test.describe('User bookmarks exact-state sync gate', () => {
  test.describe.configure({ timeout: 120_000 });

  test('second sync skips bodies when nothing changed', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const helperPath = '/src/lib/functions/replication/user-bookmarks-sync-test-double.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { MemoryBookmarksHandler } = await import(/* @vite-ignore */ helperPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const context = { id: 101, title: 'UB State Clean', imagePath: '' };
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
    // First run pulls + merges the single row. The local card starts
    // imageless (imagePath ''), so the cover gate heals it once via
    // getCover/saveCover; bookmarks-only runs never re-fetch after that.
    expect(result.afterFirst).toEqual({
      remoteFetches: 1,
      remoteWrites: 0,
      browserWrites: 1,
      coverWrites: 1,
      browserRows: 1
    });
    // Second run: no body fetches, no writes, no further cover traffic.
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
      const helperPath = '/src/lib/functions/replication/user-bookmarks-sync-test-double.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { MemoryBookmarksHandler } = await import(/* @vite-ignore */ helperPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const context = { id: 102, title: 'UB State Edits', imagePath: '' };
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
      const helperPath = '/src/lib/functions/replication/user-bookmarks-sync-test-double.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { MemoryBookmarksHandler } = await import(/* @vite-ignore */ helperPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const context = { id: 103, title: 'UB State Deletion', imagePath: '' };
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
      const helperPath = '/src/lib/functions/replication/user-bookmarks-sync-test-double.ts';
      const optionsPath = '/src/lib/functions/replication/replication-options.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { MemoryBookmarksHandler } = await import(/* @vite-ignore */ helperPath);
      const { ReplicationSaveBehavior } = await import(/* @vite-ignore */ optionsPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const context = { id: 104, title: 'UB State Overwrite', imagePath: '' };
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

  test('delete-then-reimport refetches despite matching rows', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const helperPath = '/src/lib/functions/replication/user-bookmarks-sync-test-double.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { MemoryBookmarksHandler } = await import(/* @vite-ignore */ helperPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const title = 'UB State Reimport';
      const types = [StorageDataType.USER_BOOKMARKS];
      const remote = new MemoryBookmarksHandler(window, StorageKey.GDRIVE, 'test-remote');
      const browser = new MemoryBookmarksHandler(window, StorageKey.BROWSER, 'test-browser');
      remote.rows = [
        { syncId: 'a', exploredCharCount: 10, createdAt: 100, lastModified: 100, label: 'A' }
      ];
      remote.mintFilename();

      const run = (id: number) =>
        replicateData(
          remote,
          browser,
          false,
          [{ id, title, imagePath: '' }],
          types,
          undefined,
          true
        );

      // First sync: no local book row, so the save is a no-op and the marker
      // covers empty local rows.
      browser.acceptSaves = false;
      const first = await run(501);
      const fetchesAfterFirst = remote.bodyFetches;

      // Reimport mints a fresh row id with the same (empty) rows and an
      // unchanged remote set: rows and names match the marker, but the row
      // id must still force a restoration fetch.
      browser.acceptSaves = true;
      const second = await run(502);

      return {
        first,
        second,
        fetchesAfterFirst,
        fetchesAfterSecond: remote.bodyFetches,
        browserRows: browser.rows.length
      };
    });

    expect(result.first).toBe('');
    expect(result.second).toBe('');
    expect(result.fetchesAfterFirst).toBe(1);
    expect(result.fetchesAfterSecond).toBe(2);
    expect(result.browserRows).toBe(1);
  });

  test('expired marker forces a re-verifying fetch', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const helperPath = '/src/lib/functions/replication/user-bookmarks-sync-test-double.ts';
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { StorageDataType, StorageKey } = await import(/* @vite-ignore */ typesPath);
      const { MemoryBookmarksHandler } = await import(/* @vite-ignore */ helperPath);
      const { replicateData } = await import(/* @vite-ignore */ replicatorPath);

      localStorage.clear();

      const title = 'UB State TTL';
      const remoteName = 'test-remote';
      const types = [StorageDataType.USER_BOOKMARKS];
      const remote = new MemoryBookmarksHandler(window, StorageKey.GDRIVE, remoteName);
      const browser = new MemoryBookmarksHandler(window, StorageKey.BROWSER, 'test-browser');
      remote.rows = [
        { syncId: 'a', exploredCharCount: 10, createdAt: 100, lastModified: 100, label: 'A' }
      ];
      remote.mintFilename();

      const run = () =>
        replicateData(
          remote,
          browser,
          false,
          [{ id: 601, title, imagePath: '' }],
          types,
          undefined,
          true
        );
      const first = await run();
      const fetchesAfterFirst = remote.bodyFetches;

      // Age the freshly recorded marker past its TTL without touching rows
      // or remote names: only the age may force the re-verifying fetch.
      const key = `ttu-reader:ub-sync-state:v1:${encodeURIComponent(remoteName)}::${encodeURIComponent(title)}`;
      const hadMarker = localStorage.getItem(key) !== null;
      const marker = JSON.parse(localStorage.getItem(key) || '{}');
      marker.recordedAt = 1;
      localStorage.setItem(key, JSON.stringify(marker));

      const second = await run();

      return {
        first,
        second,
        hadMarker,
        fetchesAfterFirst,
        fetchesAfterSecond: remote.bodyFetches,
        browserRows: browser.rows.length
      };
    });

    expect(result.first).toBe('');
    expect(result.second).toBe('');
    expect(result.hadMarker).toBe(true);
    expect(result.fetchesAfterFirst).toBe(1);
    expect(result.fetchesAfterSecond).toBe(2);
    expect(result.browserRows).toBe(1);
  });
});
