/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Position sync behavior (M4/P6)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('last-write-wins with deterministic device tie-break', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const positionPath = '/src/lib/functions/position-util.ts';
      const { isPositionNewerThan } = await import(/* @vite-ignore */ positionPath);

      const older = { dataId: 1, progress: 0.2, lastBookmarkModified: 1000, deviceId: 'device-a' };
      const newer = { dataId: 1, progress: 0.5, lastBookmarkModified: 2000, deviceId: 'device-b' };
      const tieA = { dataId: 1, progress: 0.3, lastBookmarkModified: 1500, deviceId: 'device-a' };
      const tieB = { dataId: 1, progress: 0.4, lastBookmarkModified: 1500, deviceId: 'device-b' };
      const unstamped = { dataId: 1, progress: 0.1, lastBookmarkModified: 1500 };

      return {
        // Newer timestamp wins both directions.
        newerBeatsOlder: isPositionNewerThan(newer, older),
        olderLosesToNewer: !isPositionNewerThan(older, newer),
        // Equal timestamps: higher deviceId wins, identically from both sides.
        tieBreaksTowardB: isPositionNewerThan(tieB, tieA),
        tieBreaksAgainstA: !isPositionNewerThan(tieA, tieB),
        // Pre-v13 records without a deviceId always lose ties.
        stampedBeatsUnstamped: isPositionNewerThan(tieA, unstamped),
        unstampedLoses: !isPositionNewerThan(unstamped, tieA),
        // Nothing incoming or existing never wins.
        nothingIncoming: !isPositionNewerThan(undefined, newer),
        anythingBeatsNothing: isPositionNewerThan(newer, undefined)
      };
    });

    expect(result).toEqual({
      newerBeatsOlder: true,
      olderLosesToNewer: true,
      tieBreaksTowardB: true,
      tieBreaksAgainstA: true,
      stampedBeatsUnstamped: true,
      unstampedLoses: true,
      nothingIncoming: true,
      anythingBeatsNothing: true
    });
  });

  test('position saves stamp the device and keep only the deterministic winner', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const factoryPath = '/src/lib/data/database/books-db/factory.ts';
      const servicePath = '/src/lib/data/database/books-db/database.service.ts';
      const positionPath = '/src/lib/functions/position-util.ts';
      const { createBooksDb } = await import(/* @vite-ignore */ factoryPath);
      const { DatabaseService } = await import(/* @vite-ignore */ servicePath);
      const { isPositionNewerThan } = await import(/* @vite-ignore */ positionPath);

      const stamp = Date.now();
      const dbName = `m4-position-${stamp}`;
      const db = new DatabaseService(createBooksDb(dbName));
      await db.putDeviceIdentity({ id: 0, deviceId: 'device-a', deviceLabel: 'A' });
      const raw = await db.db;
      const bookId = (await raw.add('data', {
        title: `M4 Position ${stamp}`,
        styleSheet: '',
        elementHtml: '<p>x</p>',
        blobs: {},
        coverImage: '',
        hasThumb: false,
        characters: 1,
        sections: [],
        lastBookModified: 1,
        lastBookOpen: 0
      })) as number;

      // Same gate the browser handler applies on every incoming position.
      const save = async (record: any) => {
        const existing = await db.getBookmark(bookId);
        if (isPositionNewerThan({ ...record, dataId: bookId }, existing)) {
          await db.putBookmark({ ...record, dataId: bookId });
          return true;
        }
        return false;
      };

      const first = await save({ progress: 0.5, lastBookmarkModified: 2000 });
      const stamped = await db.getBookmark(bookId);
      // A stale record from another device must not displace the winner.
      const staleAccepted = await save({
        progress: 0.1,
        lastBookmarkModified: 1000,
        deviceId: 'device-b'
      });
      // An equal-timestamp record from a higher deviceId wins deterministically.
      const tieAccepted = await save({
        progress: 0.6,
        lastBookmarkModified: 2000,
        deviceId: 'device-b'
      });
      const final = await db.getBookmark(bookId);

      raw.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      });

      return {
        first,
        stampedDeviceId: stamped?.deviceId,
        staleAccepted,
        tieAccepted,
        finalProgress: final?.progress,
        finalDeviceId: final?.deviceId
      };
    });

    expect(result.first).toBe(true);
    expect(result.stampedDeviceId).toBe('device-a');
    expect(result.staleAccepted).toBe(false);
    expect(result.tieAccepted).toBe(true);
    expect(result.finalProgress).toBe(0.6);
    expect(result.finalDeviceId).toBe('device-b');
  });

  test('user bookmarks union by stable identity with newer-wins per bookmark', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const factoryPath = '/src/lib/data/database/books-db/factory.ts';
      const servicePath = '/src/lib/data/database/books-db/database.service.ts';
      const saveBehaviorPath = '/src/lib/functions/replication/replication-options.ts';
      const { createBooksDb } = await import(/* @vite-ignore */ factoryPath);
      const { DatabaseService } = await import(/* @vite-ignore */ servicePath);
      const { ReplicationSaveBehavior } = await import(/* @vite-ignore */ saveBehaviorPath);

      const stamp = Date.now();
      const dbName = `m4-bookmarks-${stamp}`;
      const db = new DatabaseService(createBooksDb(dbName));
      const title = `M4 Bookmarks ${stamp}`;
      const raw = await db.db;
      const dataId = (await raw.add('data', {
        title,
        styleSheet: '',
        elementHtml: '<p>x</p>',
        blobs: {},
        coverImage: '',
        hasThumb: false,
        characters: 1000,
        sections: [],
        lastBookModified: 1,
        lastBookOpen: 0
      })) as number;

      const local = (overrides: object) => ({
        dataId,
        exploredCharCount: 100,
        progress: 0.1,
        label: 'Chapter 1',
        color: 'blue' as const,
        note: '',
        createdAt: 1000,
        lastModified: 1000,
        ...overrides
      });
      await db.storeUserBookmarks(title, [local({})], ReplicationSaveBehavior.NewOnly);
      // Same stable identity, newer edit wins; unrelated bookmark unions in.
      await db.storeUserBookmarks(
        title,
        [
          local({ note: 'renamed', lastModified: 2000 }),
          local({
            exploredCharCount: 500,
            progress: 0.5,
            label: 'Chapter 2',
            createdAt: 1500,
            lastModified: 1500
          })
        ],
        ReplicationSaveBehavior.NewOnly
      );
      const bookmarks = await db.getUserBookmarks(dataId);

      raw.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      });

      return bookmarks.map((bookmark: any) => ({
        exploredCharCount: bookmark.exploredCharCount,
        note: bookmark.note,
        lastModified: bookmark.lastModified
      }));
    });

    expect(result).toEqual([
      { exploredCharCount: 100, note: 'renamed', lastModified: 2000 },
      { exploredCharCount: 500, note: '', lastModified: 1500 }
    ]);
  });

  test('type merges keep both windows, both ids, and both theme names', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const goalsPath = '/src/lib/data/reading-goal.ts';
      const profilesPath = '/src/lib/data/profiles/profile-manager.ts';
      const tagsPath = '/src/lib/data/book-tags.ts';
      const { mergeReadingGoals } = await import(/* @vite-ignore */ goalsPath);
      const { mergeProfiles } = await import(/* @vite-ignore */ profilesPath);
      const { mergeTagsDicts } = await import(/* @vite-ignore */ tagsPath);

      const goals = mergeReadingGoals(
        [
          {
            goalStartDate: '2026-09-08',
            goalEndDate: '2026-09-14',
            goalOriginalEndDate: '2026-09-14',
            timeGoal: 200,
            characterGoal: 2000,
            goalFrequency: 'weekly',
            lastGoalModified: 2000
          }
        ],
        [
          {
            goalStartDate: '2026-09-01',
            goalEndDate: '2026-09-07',
            goalOriginalEndDate: '2026-09-07',
            timeGoal: 100,
            characterGoal: 1000,
            goalFrequency: 'weekly',
            lastGoalModified: 1000
          }
        ],
        false,
        0
      );
      const profiles = mergeProfiles(
        [{ id: 'a', name: 'A', updatedAt: 1000 }],
        [{ id: 'b', name: 'B', updatedAt: 2000 }],
        false,
        0
      );
      const tags = mergeTagsDicts({ 'book-one': ['alpha'] }, { 'book-one': ['beta'] });

      return {
        goalStarts: goals.readingGoalsToStore.map((goal: any) => goal.goalStartDate).sort(),
        profileIds: profiles.mergedProfiles.map((profile: any) => profile.id).sort(),
        tags: tags['book-one']
      };
    });

    expect(result.goalStarts).toEqual(['2026-09-01', '2026-09-08']);
    expect(result.profileIds).toEqual(['a', 'b']);
    expect(result.tags?.sort()).toEqual(['alpha', 'beta']);
  });
});
