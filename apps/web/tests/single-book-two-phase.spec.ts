/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Single-book two-phase sync (reader explicit sync)', () => {
  test('phase-1 read-state syncs before the rest, with callback between down and up', async ({
    page
  }) => {
    // The landing route auto-navigates to the library; load it directly so
    // the execution context stays stable for page.evaluate.
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const cloudSyncPath = '/src/lib/functions/replication/cloud-sync.ts';
      const storageTypesPath = '/src/lib/data/storage/storage-types.ts';
      const mod = await import(/* @vite-ignore */ cloudSyncPath);
      const typesMod = await import(/* @vite-ignore */ storageTypesPath);
      const StorageDataType = typesMod.StorageDataType;
      const timeline: string[] = [];

      function makeHandler(name: string) {
        return {
          name,
          storageType: `fake-${name}`,
          isCacheDisabled: () => false,
          getCurrentStorageSource: () => name,
          getFilenameForRecentCheck: async (prefix: string) => {
            timeline.push(`${name}:recent:${prefix}`);
            return `${prefix}${name}`;
          },
          isProgressPresentAndUpToDate: async () => {
            timeline.push(`${name}:isProgressUpToDate`);
            return false;
          },
          getProgress: async () => {
            timeline.push(`${name}:getProgress`);
            return { exploredCharCount: 1200, progress: 0.1, lastBookmarkModified: 5 };
          },
          saveProgress: async () => {
            timeline.push(`${name}:saveProgress`);
          },
          getUserBookmarks: async () => {
            timeline.push(`${name}:getUserBookmarks`);
            return [];
          },
          saveUserBookmarks: async () => {
            timeline.push(`${name}:saveUserBookmarks`);
          },
          isAudioBookPresentAndUpToDate: async () => {
            timeline.push(`${name}:isAudioUpToDate`);
            return false;
          },
          getAudioBook: async () => {
            timeline.push(`${name}:getAudioBook`);
            return undefined;
          },
          isCoverPresentAndUpToDate: async () => true
        };
      }

      const local = makeHandler('local');
      const external = makeHandler('external');
      const context = { title: 'Two-Phase Book' };

      let callbackCalls = 0;
      const error = await mod.replicateSingleBookTwoPhase({
        localHandler: local,
        externalHandler: external,
        context,
        dataTypes: [
          StorageDataType.AUDIOBOOK,
          StorageDataType.PROGRESS,
          StorageDataType.USER_BOOKMARKS
        ],
        refreshDataList: false,
        onPhase1Downloaded: () => {
          callbackCalls += 1;
          timeline.push('callback:phase1-downloaded');
        }
      });

      return { error: error ?? null, timeline, callbackCalls };
    });

    expect(result.error).toBeNull();
    expect(result.callbackCalls).toBe(1);

    const t = result.timeline;
    const idx = (entry: string) => t.indexOf(entry);
    // Phase-1 download (external -> local) precedes the callback, which
    // precedes the Phase-1 upload (local -> external).
    expect(idx('external:getProgress')).toBeGreaterThanOrEqual(0);
    expect(idx('local:saveProgress')).toBeGreaterThanOrEqual(0);
    expect(idx('external:getProgress')).toBeLessThan(idx('callback:phase1-downloaded'));
    expect(idx('local:saveProgress')).toBeLessThan(idx('callback:phase1-downloaded'));
    expect(idx('callback:phase1-downloaded')).toBeLessThan(idx('local:getProgress'));
    expect(idx('local:getProgress')).toBeLessThan(idx('external:saveProgress'));
    // Phase-2 (audiobook) runs after the Phase-1 upload finished.
    expect(idx('external:saveUserBookmarks')).toBeLessThan(idx('external:getAudioBook'));
    expect(idx('callback:phase1-downloaded')).toBeLessThan(idx('external:getAudioBook'));
  });

  test('first failing leg aborts the run and skips the callback', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const cloudSyncPath = '/src/lib/functions/replication/cloud-sync.ts';
      const storageTypesPath = '/src/lib/data/storage/storage-types.ts';
      const mod = await import(/* @vite-ignore */ cloudSyncPath);
      const typesMod = await import(/* @vite-ignore */ storageTypesPath);
      const StorageDataType = typesMod.StorageDataType;
      const timeline: string[] = [];

      const local = {
        storageType: 'fake-local',
        isCacheDisabled: () => false,
        getFilenameForRecentCheck: async () => 'progress_fake-local',
        isProgressPresentAndUpToDate: async () => false,
        getProgress: async () => ({ exploredCharCount: 1, progress: 0, lastBookmarkModified: 1 }),
        saveProgress: async () => {
          timeline.push('local:saveProgress');
        },
        getUserBookmarks: async () => [],
        saveUserBookmarks: async () => {},
        isCoverPresentAndUpToDate: async () => true
      };
      const external = {
        storageType: 'fake-external',
        isCacheDisabled: () => false,
        getFilenameForRecentCheck: async () => 'progress_fake-external',
        isProgressPresentAndUpToDate: async () => false,
        getProgress: async () => {
          throw new Error('cloud unreachable');
        },
        saveProgress: async () => {
          timeline.push('external:saveProgress');
        },
        getUserBookmarks: async () => [],
        saveUserBookmarks: async () => {},
        isCoverPresentAndUpToDate: async () => true
      };

      let callbackCalls = 0;
      const error = await mod.replicateSingleBookTwoPhase({
        localHandler: local,
        externalHandler: external,
        context: { title: 'Failing Book' },
        dataTypes: [StorageDataType.PROGRESS],
        refreshDataList: false,
        onPhase1Downloaded: () => {
          callbackCalls += 1;
        }
      });

      return { error: error ?? null, timeline, callbackCalls };
    });

    expect(result.error).toContain('cloud unreachable');
    expect(result.callbackCalls).toBe(0);
    expect(result.timeline).toEqual([]);
  });

  test('empty types resolve without touching any handler', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const cloudSyncPath = '/src/lib/functions/replication/cloud-sync.ts';
      const mod = await import(/* @vite-ignore */ cloudSyncPath);
      let calls = 0;
      const handler = {
        storageType: 'fake',
        isCacheDisabled: () => {
          calls += 1;
          return false;
        }
      };
      const error = await mod.replicateSingleBookTwoPhase({
        localHandler: handler,
        externalHandler: handler,
        context: { title: 'Empty Book' },
        dataTypes: [],
        refreshDataList: false
      });
      return { error: error ?? null, calls };
    });

    expect(result.error).toBeNull();
    expect(result.calls).toBe(0);
  });

  test('error normalizer never reports failure as success', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const cloudSyncPath = '/src/lib/functions/replication/cloud-sync.ts';
      const mod = await import(/* @vite-ignore */ cloudSyncPath);
      return {
        fromString: mod.asSyncErrorMessage('boom'),
        fromError: mod.asSyncErrorMessage(new Error('kaput')),
        fromUndefined: mod.asSyncErrorMessage(undefined),
        fromEmptyString: mod.asSyncErrorMessage(''),
        fromObject: mod.asSyncErrorMessage({ code: 500 })
      };
    });

    expect(result.fromString).toBe('boom');
    expect(result.fromError).toBe('kaput');
    for (const value of [result.fromUndefined, result.fromEmptyString, result.fromObject]) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
