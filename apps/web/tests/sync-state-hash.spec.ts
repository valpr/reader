/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test, type Page } from '@playwright/test';
import { seedLibraryItem, seedStatistics } from './fixtures/book-fixture';

const SOURCE = 'test-gdrive';
const TITLE = 'Sync State Cat';

// Whole-sync early exit (`sync-state.ts`): the local content fingerprint
// plus the remote file inventory must both match the last successful full
// sync, or the gate falls through to a full sync. The remote side is an
// in-memory double (`sync-state-test-double.ts`); the local side is the
// real IndexedDB seeded by the fixtures. Each scenario runs inside one
// `page.evaluate` so the double instance survives (see the double's note
// on HMR); module paths go through variables so `svelte-check` does not
// try to resolve the `/src/...` specifiers.
type Scenario =
  | 'fingerprint-stable'
  | 'fingerprint-progress'
  | 'fingerprint-statistic'
  | 'skip-unchanged'
  | 'no-skip-local-change'
  | 'no-skip-remote-change'
  | 'no-skip-remote-book'
  | 'no-skip-expired'
  | 'no-skip-scope'
  | 'no-skip-profiles';

async function runScenario(page: Page, scenario: Scenario): Promise<any> {
  return page.evaluate(
    async ({ source, title, scenario }) => {
      // Import the store first: it constructs DatabaseService at module top
      // level, so it must enter the store/service cycle before the service
      // module does (otherwise the class binding is still uninitialized).
      const storePath = '/src/lib/data/store.ts';
      const store = await import(/* @vite-ignore */ storePath);
      const statePath = '/src/lib/functions/replication/sync-state.ts';
      const state = await import(/* @vite-ignore */ statePath);
      const doublePath = '/src/lib/functions/replication/sync-state-test-double.ts';
      const doubleMod = await import(/* @vite-ignore */ doublePath);
      const typesPath = '/src/lib/data/storage/storage-types.ts';
      const types = await import(/* @vite-ignore */ typesPath);
      const baseHandlerPath = '/src/lib/data/storage/handler/base-handler.ts';
      const baseHandler = await import(/* @vite-ignore */ baseHandlerPath);
      const browserHandlerPath = '/src/lib/data/storage/handler/browser-handler.ts';
      const browserHandlerMod = await import(/* @vite-ignore */ browserHandlerPath);

      const db = await store.database.db;
      const local = new browserHandlerMod.BrowserStorageHandler(window, types.StorageKey.BROWSER);
      const remote = new doubleMod.MemorySyncStateRemote(window, source);
      const dataTypes = [...state.SYNC_STATE_GATED_TYPES];
      const inputs = {
        db,
        localHandler: local,
        remoteHandler: remote,
        dataTypes
      };

      const titleFiles = [
        { name: 'progress_1_16_1000.json', revision: 'r1' },
        { name: 'statistics_1_16_1000.json', revision: 'r1' },
        { name: 'userBookmarks_1_1_1000_0.json', revision: 'r1' }
      ];
      const mirrorRemote = () => {
        remote.setTitleFiles(title, titleFiles);
        remote.setRootFiles(baseHandler.BaseStorageHandler.readingGoalsFilePrefix, [
          { name: 'ttu-user-goals_1_16_0.json', revision: 'r1' }
        ]);
        remote.setRootFiles(baseHandler.BaseStorageHandler.profilesFilePrefix, [
          { name: 'ttu-user-profiles_1_16_0.json', revision: 'r1' }
        ]);
        remote.setRootFiles(baseHandler.BaseStorageHandler.contributionFilePrefix, []);
      };

      switch (scenario) {
        case 'fingerprint-stable': {
          const first = await state.computeLocalSyncFingerprint(db, local);
          const second = await state.computeLocalSyncFingerprint(db, local);
          const book = await db.get('data', 1);
          await db.put('data', { ...book, lastBookOpen: Date.now() + 60_000 });
          const afterOpen = await state.computeLocalSyncFingerprint(db, local);
          return { first, second, afterOpen };
        }
        case 'fingerprint-progress': {
          const before = await state.computeLocalSyncFingerprint(db, local);
          const bookmark = await db.get('bookmark', 1);
          await db.put('bookmark', { ...bookmark, progress: 0.5, lastBookmarkModified: 2000 });
          const after = await state.computeLocalSyncFingerprint(db, local);
          return { before, after };
        }
        case 'fingerprint-statistic': {
          const before = await state.computeLocalSyncFingerprint(db, local);
          const row = await db.get('statistic', [title, '2026-11-15']);
          await db.put('statistic', { ...row, readingTime: 120, lastStatisticModified: 2000 });
          const after = await state.computeLocalSyncFingerprint(db, local);
          return { before, after };
        }
        case 'skip-unchanged': {
          mirrorRemote();
          await state.recordFullSyncState(source, inputs);
          const first = await state.trySkipFullSync(source, inputs);
          const second = await state.trySkipFullSync(source, inputs);
          return { first, second };
        }
        case 'no-skip-local-change': {
          mirrorRemote();
          await state.recordFullSyncState(source, inputs);
          const bookmark = await db.get('bookmark', 1);
          await db.put('bookmark', { ...bookmark, progress: 0.5, lastBookmarkModified: 2000 });
          return state.trySkipFullSync(source, inputs);
        }
        case 'no-skip-remote-change': {
          mirrorRemote();
          await state.recordFullSyncState(source, inputs);
          // Another device re-uploaded progress: same book, new filename.
          remote.setTitleFiles(title, [
            ...titleFiles,
            { name: 'progress_1_16_2000.json', revision: 'r2' }
          ]);
          return state.trySkipFullSync(source, inputs);
        }
        case 'no-skip-remote-book': {
          mirrorRemote();
          await state.recordFullSyncState(source, inputs);
          remote.setTitleFiles('Remote Only Book', [
            { name: 'progress_1_16_1000.json', revision: 'r1' }
          ]);
          return state.trySkipFullSync(source, inputs);
        }
        case 'no-skip-expired': {
          mirrorRemote();
          await state.recordFullSyncState(source, inputs);
          const key = `reader:full-sync-state:v1:${encodeURIComponent(source)}`;
          const marker = JSON.parse(localStorage.getItem(key) || '{}');
          localStorage.setItem(
            key,
            JSON.stringify({ ...marker, recordedAt: Date.now() - 31 * 24 * 60 * 60 * 1000 })
          );
          return state.trySkipFullSync(source, inputs);
        }
        case 'no-skip-scope': {
          // No marker recorded yet.
          mirrorRemote();
          const withoutMarker = await state.trySkipFullSync(source, inputs);
          await state.recordFullSyncState(source, inputs);
          const withExtraType = await state.trySkipFullSync(source, {
            ...inputs,
            dataTypes: [...inputs.dataTypes, types.StorageDataType.DATA]
          });
          const withGatedTypes = await state.trySkipFullSync(source, inputs);
          return { withoutMarker, withExtraType, withGatedTypes };
        }
        case 'no-skip-profiles': {
          mirrorRemote();
          await state.recordFullSyncState(source, inputs);
          const profiles = store.readerProfiles$.getValue();
          store.readerProfiles$.next([
            ...profiles,
            { ...profiles[0], id: 'test-profile', name: 'Test Profile' }
          ]);
          store.lastProfilesModified$.next(Date.now());
          return state.trySkipFullSync(source, inputs);
        }
      }
    },
    { source: SOURCE, title: TITLE, scenario }
  );
}

test.describe('Sync-state early exit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedLibraryItem(page, { title: TITLE, id: 1 });
  });

  test('fingerprint is stable and ignores lastBookOpen', async ({ page }) => {
    const result = await runScenario(page, 'fingerprint-stable');
    expect(result.first).toBeTruthy();
    expect(result.second).toBe(result.first);
    expect(result.afterOpen).toBe(result.first);
  });

  test('fingerprint changes when progress changes', async ({ page }) => {
    const result = await runScenario(page, 'fingerprint-progress');
    expect(result.before).toBeTruthy();
    expect(result.after).toBeTruthy();
    expect(result.after).not.toBe(result.before);
  });

  test('fingerprint changes when a statistic row changes', async ({ page }) => {
    await seedStatistics(page, [
      {
        title: TITLE,
        dateKey: '2026-11-15',
        charactersRead: 100,
        readingTime: 60,
        minReadingSpeed: 1,
        altMinReadingSpeed: 1,
        lastReadingSpeed: 1,
        maxReadingSpeed: 1,
        lastStatisticModified: 1000
      }
    ]);
    const result = await runScenario(page, 'fingerprint-statistic');
    expect(result.before).toBeTruthy();
    expect(result.after).not.toBe(result.before);
  });

  test('gate skips when nothing changed', async ({ page }) => {
    const result = await runScenario(page, 'skip-unchanged');
    expect(result).toEqual({ first: true, second: true });
  });

  test('gate does not skip after local progress changes', async ({ page }) => {
    expect(await runScenario(page, 'no-skip-local-change')).toBe(false);
  });

  test('gate does not skip after a remote file changes', async ({ page }) => {
    expect(await runScenario(page, 'no-skip-remote-change')).toBe(false);
  });

  test('gate does not skip when a remote-only book appears', async ({ page }) => {
    expect(await runScenario(page, 'no-skip-remote-book')).toBe(false);
  });

  test('gate does not skip when the marker expired', async ({ page }) => {
    expect(await runScenario(page, 'no-skip-expired')).toBe(false);
  });

  test('gate does not skip for out-of-scope types or without a marker', async ({ page }) => {
    const result = await runScenario(page, 'no-skip-scope');
    expect(result).toEqual({ withoutMarker: false, withExtraType: false, withGatedTypes: true });
  });

  test('gate does not skip when profiles change', async ({ page }) => {
    expect(await runScenario(page, 'no-skip-profiles')).toBe(false);
  });
});
