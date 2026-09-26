/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Sync conflicts (M3)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('overlapping OneDrive goals writes converge through conditional retry', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const oneDrivePath = '/src/lib/data/storage/handler/onedrive-handler.ts';
      const errorPath = '/src/lib/functions/replication/error-handler.ts';
      const { OneDriveStorageHandler } = await import(/* @vite-ignore */ oneDrivePath);
      const { ConflictError } = await import(/* @vite-ignore */ errorPath);

      interface Entry {
        id: string;
        name: string;
        content: string;
        etag: string;
      }
      let counter = 0;
      let version = 0;
      let contentPuts = 0;
      const backend = new Map<string, Entry>();
      const mint = () => `id-${(counter += 1)}`;
      const bump = () => `etag-${(version += 1)}`;

      class FakeOneDrive extends OneDriveStorageHandler {
        constructor() {
          super(window);
        }

        async request(url: string, options: any = {}, type: any = 'json'): Promise<any> {
          const method = options.method || 'GET';
          const textOf = async (body: any) => (typeof body === 'string' ? body : await body.text());
          if (url.includes('/createUploadSession')) {
            const created = /\/items\/root:\/(.+):\/createUploadSession$/.exec(url);
            if (created) {
              const name = decodeURIComponent(created[1]);
              const replaced = [...backend.values()].find((entry) => entry.name === name);
              if (replaced) {
                (this as any).pendingUpload = { id: replaced.id, name };
                return { uploadUrl: 'https://fake-upload/session' };
              }
              const entry: Entry = { id: mint(), name, content: '', etag: bump() };
              backend.set(entry.id, entry);
              (this as any).pendingUpload = { id: entry.id, name };
              return { uploadUrl: 'https://fake-upload/session' };
            }
            const updated = /\/items\/([^/]+)\/createUploadSession$/.exec(url);
            if (updated) {
              const entry = backend.get(updated[1]);
              if (!entry) throw new Error('not found');
              (this as any).pendingUpload = { id: entry.id, name: entry.name };
              return { uploadUrl: 'https://fake-upload/session' };
            }
            return { uploadUrl: 'https://fake-upload/session' };
          }
          if (url.startsWith('https://fake-upload/session')) {
            const pending = (this as any).pendingUpload;
            const entry = backend.get(pending?.id || '');
            if (!entry) throw new Error('no session');
            entry.content = await textOf(options.body);
            entry.etag = bump();
            return { id: entry.id, name: entry.name, cTag: entry.etag };
          }
          const contentMatch = /\/items\/([^/]+)\/content$/.exec(url);
          if (contentMatch && method === 'PUT') {
            const entry = backend.get(contentMatch[1]);
            if (!entry) throw new Error('not found');
            const ifMatch = options.headers?.['If-Match'];
            if (ifMatch && ifMatch !== entry.etag) {
              contentPuts += 1;
              throw new ConflictError('precondition failed');
            }
            contentPuts += 1;
            entry.content =
              typeof options.body === 'string' ? options.body : await options.body.text();
            entry.etag = bump();
            return { id: entry.id, name: entry.name, cTag: entry.etag };
          }
          const itemMatch = /\/items\/([^/?]+)(\?|$)/.exec(url);
          if (itemMatch && method === 'PATCH') {
            const entry = backend.get(itemMatch[1]);
            if (!entry) throw new Error('not found');
            const ifMatch = options.headers?.['If-Match'];
            if (ifMatch && ifMatch !== entry.etag) {
              throw new ConflictError('precondition failed');
            }
            entry.name = JSON.parse(options.body).name;
            entry.etag = bump();
            return { id: entry.id, name: entry.name, cTag: entry.etag };
          }
          if (itemMatch && method === 'DELETE') {
            backend.delete(itemMatch[1]);
            return null;
          }
          if (url.includes('/children')) {
            return {
              value: [...backend.values()].map((entry) => ({
                id: entry.id,
                name: entry.name,
                cTag: entry.etag,
                file: {}
              }))
            };
          }
          if (contentMatch) {
            const entry = backend.get(contentMatch[1]);
            const parsed = JSON.parse(entry?.content || 'null');
            return type === 'json' ? parsed : entry?.content;
          }
          throw new Error(`unexpected ${method} ${url}`);
        }

        async ensureTitle() {
          (this as any).rootId = 'root';
          return 'root';
        }
      }

      // Session-path create needs the target name smuggled to the fake.
      const tabA = new FakeOneDrive();
      const tabB = new FakeOneDrive();
      const goalA = {
        goalStartDate: '2026-09-01',
        goalEndDate: '2026-09-07',
        goalOriginalEndDate: '2026-09-07',
        timeGoal: 100,
        characterGoal: 1000,
        goalFrequency: 'weekly',
        lastGoalModified: 1000
      };
      const goalB = {
        goalStartDate: '2026-09-08',
        goalEndDate: '2026-09-14',
        goalOriginalEndDate: '2026-09-14',
        timeGoal: 200,
        characterGoal: 2000,
        goalFrequency: 'weekly',
        lastGoalModified: 2000
      };

      // Prime both writers on the same etag, then race them.
      await tabA.saveReadingGoals([goalA], 1000);
      await (tabB as any).setRootFiles();
      await (tabA as any).setRootFiles();
      const raced = await Promise.allSettled([
        tabB.saveReadingGoals([goalA, goalB], 2000),
        tabA.saveReadingGoals([goalA], 1000)
      ]);

      const goalsFiles = [...backend.values()].filter((entry) =>
        entry.name.startsWith('ttu-user-goals_')
      );
      const merged = goalsFiles.length
        ? JSON.parse(
            goalsFiles
              .map((entry) => entry.content)
              .sort()
              .at(-1) || '[]'
          )
        : [];

      return {
        failures: raced.filter((outcome) => outcome.status === 'rejected').length,
        goalsFileCount: goalsFiles.length,
        goalStarts: merged.map((goal: any) => goal.goalStartDate).sort(),
        contentPuts
      };
    });

    // Both racers succeed (one via transparent retry) and the folder holds a
    // single converged file with both goals — no silent loss either way.
    expect(result.failures).toBe(0);
    expect(result.goalsFileCount).toBe(1);
    expect(result.goalStarts).toEqual(['2026-09-01', '2026-09-08']);
    expect(result.contentPuts).toBeGreaterThan(2);
  });

  test('repeated OneDrive conflicts surface a visible error after bounded retries', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const oneDrivePath = '/src/lib/data/storage/handler/onedrive-handler.ts';
      const errorPath = '/src/lib/functions/replication/error-handler.ts';
      const { OneDriveStorageHandler } = await import(/* @vite-ignore */ oneDrivePath);
      const { ConflictError } = await import(/* @vite-ignore */ errorPath);

      let puts = 0;
      const seedGoals = [
        {
          goalStartDate: '2026-09-01',
          goalEndDate: '2026-09-07',
          goalOriginalEndDate: '2026-09-07',
          timeGoal: 100,
          characterGoal: 1000,
          goalFrequency: 'weekly',
          lastGoalModified: 1000
        }
      ];
      class AlwaysConflict extends OneDriveStorageHandler {
        constructor() {
          super(window);
        }

        async request(url: string, options: any = {}): Promise<any> {
          if (url.includes('/children')) {
            return {
              value: [
                { id: 'goals-1', name: 'ttu-user-goals_1_12_1000.json', cTag: 'etag-1', file: {} }
              ]
            };
          }
          if (/\/items\/[^/]+\/content$/.test(url)) {
            if ((options.method || 'GET') === 'GET') return seedGoals;
            puts += 1;
            throw new ConflictError('precondition failed');
          }
          if (/\/items\/[^/?]+/.test(url) && (options.method || 'GET') === 'GET') {
            return [];
          }
          throw new Error(`unexpected ${options.method || 'GET'} ${url}`);
        }

        async ensureTitle() {
          (this as any).rootId = 'root';
          return 'root';
        }
      }

      const handler = new AlwaysConflict();
      let message = '';
      try {
        await handler.saveReadingGoals(
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
          1000
        );
      } catch (error: any) {
        message = error?.message || String(error);
      }
      return { message, puts };
    });

    expect(result.puts).toBe(3);
    expect(result.message).toMatch(/precondition failed/i);
  });

  test('Drive duplicate singletons reconcile to one merged file', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const gdrivePath = '/src/lib/data/storage/handler/gdrive-handler.ts';
      const { GDriveStorageHandler } = await import(/* @vite-ignore */ gdrivePath);

      interface Entry {
        id: string;
        name: string;
        content: string;
      }
      let counter = 100;
      const backend = new Map<string, Entry>([
        [
          'g-1',
          {
            id: 'g-1',
            name: 'ttu-user-goals_1_12_1000.json',
            content: JSON.stringify([
              {
                goalStartDate: '2026-09-01',
                goalEndDate: '2026-09-07',
                goalOriginalEndDate: '2026-09-07',
                timeGoal: 100,
                characterGoal: 1000,
                goalFrequency: 'weekly',
                lastGoalModified: 1000
              }
            ])
          }
        ],
        [
          'g-2',
          {
            id: 'g-2',
            name: 'ttu-user-goals_1_12_2000.json',
            content: JSON.stringify([
              {
                goalStartDate: '2026-09-08',
                goalEndDate: '2026-09-14',
                goalOriginalEndDate: '2026-09-14',
                timeGoal: 200,
                characterGoal: 2000,
                goalFrequency: 'weekly',
                lastGoalModified: 2000
              }
            ])
          }
        ]
      ]);

      class FakeDrive extends GDriveStorageHandler {
        constructor() {
          super(window);
        }

        async request(url: string, options: any = {}, type: any = 'json'): Promise<any> {
          const method = options.method || 'GET';
          const textOf = async (body: any) => (typeof body === 'string' ? body : await body.text());
          if (method === 'GET' && url.includes('/drive/v3/files?')) {
            return {
              files: [...backend.values()].map((entry) => ({ id: entry.id, name: entry.name }))
            };
          }
          if (method === 'GET') {
            const id = url.split('/drive/v3/files/')[1]?.split('?')[0];
            const entry = backend.get(id || '');
            return type === 'json' ? JSON.parse(entry?.content || 'null') : entry?.content;
          }
          if (method === 'POST') {
            const resource = JSON.parse(await textOf(options.body.get('resource')));
            const content = await textOf(options.body.get('file'));
            const entry: Entry = { id: `g-${(counter += 1)}`, name: resource.name, content };
            backend.set(entry.id, entry);
            return { id: entry.id, name: entry.name };
          }
          if (method === 'PATCH') {
            const id = url.split('/drive/v3/files/')[1]?.split('?')[0] || '';
            const entry = backend.get(id);
            if (!entry) throw new Error('not found');
            const resource = JSON.parse(await textOf(options.body.get('resource')));
            const file = options.body.get('file');
            entry.name = resource.name || entry.name;
            if (file) entry.content = await textOf(file);
            return { id: entry.id, name: entry.name };
          }
          if (method === 'DELETE') {
            const id = url.split('/drive/v3/files/')[1]?.split('?')[0] || '';
            backend.delete(id);
            return null;
          }
          throw new Error(`unexpected ${method} ${url}`);
        }

        async ensureTitle() {
          (this as any).rootId = 'root';
          return 'root';
        }
      }

      const handler = new FakeDrive();
      let error = '';
      try {
        await handler.saveReadingGoals([], 0);
      } catch (err: any) {
        error = err?.message || String(err);
      }

      const goalsFiles = [...backend.values()].filter((entry) =>
        entry.name.startsWith('ttu-user-goals_')
      );
      const members = goalsFiles.length
        ? JSON.parse(goalsFiles[0].content)
            .map((goal: any) => goal.goalStartDate)
            .sort()
        : [];
      return { error, goalsFileCount: goalsFiles.length, members };
    });

    expect(result.error).toBe('');
    expect(result.goalsFileCount).toBe(1);
    expect(result.members).toEqual(['2026-09-01', '2026-09-08']);
  });

  test('cloned device identity holds publish without overwriting', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const factoryPath = '/src/lib/data/database/books-db/factory.ts';
      const servicePath = '/src/lib/data/database/books-db/database.service.ts';
      const syncPath = '/src/lib/functions/replication/contribution-sync.ts';
      const saveBehaviorPath = '/src/lib/functions/replication/replication-options.ts';
      const mergeModePath = '/src/lib/data/merge-mode.ts';
      const v2Path = '/src/lib/functions/statistic-v2.ts';
      const { createBooksDb } = await import(/* @vite-ignore */ factoryPath);
      const { DatabaseService } = await import(/* @vite-ignore */ servicePath);
      const sync = await import(/* @vite-ignore */ syncPath);
      const { ReplicationSaveBehavior } = await import(/* @vite-ignore */ saveBehaviorPath);
      const { MergeMode } = await import(/* @vite-ignore */ mergeModePath);
      const v2 = await import(/* @vite-ignore */ v2Path);

      const stamp = Date.now();
      const dbName = `m3-clone-${stamp}`;
      const db = new DatabaseService(createBooksDb(dbName));
      await db.putDeviceIdentity({ id: 0, deviceId: 'device-a', deviceLabel: 'A' });

      const files = new Map();
      const remote = {
        listContributionFiles: async () => [...files.values()],
        writeContributionFiles: async (next: any[]) => {
          for (const file of next) {
            files.set(v2.getContributionFileName(file.deviceId, file.year), file);
          }
        },
        listMigrationMarkers: async () => [],
        writeMigrationMarker: async () => {},
        listLegacyStatisticSnapshots: async () => []
      };

      const title = `Clone Book ${stamp}`;
      await db.markLegacyStatisticsMigrationComplete('legacy:test');
      await db.storeStatistics(
        title,
        [
          {
            title,
            dateKey: '2026-09-02',
            charactersRead: 600,
            readingTime: 120,
            minReadingSpeed: 18000,
            altMinReadingSpeed: 18000,
            lastReadingSpeed: 18000,
            maxReadingSpeed: 18000,
            lastStatisticModified: 2000,
            sessionCount: 1
          }
        ],
        ReplicationSaveBehavior.Overwrite,
        MergeMode.LOCAL
      );
      await sync.publishContributionFiles(db, remote, 'device-a');
      const publishedFile = files.get('statistics_v2_device-a_2026.json');

      // A clone (same deviceId, foreign rows, advanced revision) appears.
      files.set('statistics_v2_device-a_2026.json', {
        ...publishedFile,
        revision: publishedFile.revision + 1,
        rows: [
          {
            title,
            dateKey: '2026-09-02',
            charactersRead: 9999,
            readingTime: 999,
            minReadingSpeed: 1,
            altMinReadingSpeed: 1,
            lastReadingSpeed: 1,
            maxReadingSpeed: 1,
            lastStatisticModified: 9999,
            deviceId: 'device-a',
            year: 2026,
            revision: publishedFile.revision + 1
          }
        ]
      });

      let cloneMessage = '';
      try {
        await sync.publishContributionFiles(db, remote, 'device-a');
      } catch (error: any) {
        cloneMessage = error?.message || String(error);
      }
      const held = files.get('statistics_v2_device-a_2026.json');

      // Fresh identity resumes publishing under a new id; the old file stands.
      const freshId = await sync.adoptNewDeviceIdentity(db, 'Replacement');
      await db.storeStatistics(
        title,
        [
          {
            title,
            dateKey: '2026-09-03',
            charactersRead: 100,
            readingTime: 20,
            minReadingSpeed: 18000,
            altMinReadingSpeed: 18000,
            lastReadingSpeed: 18000,
            maxReadingSpeed: 18000,
            lastStatisticModified: 4000,
            sessionCount: 1
          }
        ],
        ReplicationSaveBehavior.Overwrite,
        MergeMode.LOCAL
      );
      await sync.publishContributionFiles(db, remote, freshId);
      const resumed = files.get(`statistics_v2_${freshId}_2026.json`);

      (await db.db).close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      });

      return {
        cloneMessage,
        heldRows: held.rows.map((row: any) => row.charactersRead),
        resumedRows: resumed?.rows.map((row: any) => row.dateKey),
        freshDiffers: freshId !== 'device-a'
      };
    });

    expect(result.cloneMessage).toMatch(/cloned device identity/i);
    expect(result.heldRows).toEqual([9999]);
    expect(result.freshDiffers).toBe(true);
    expect(result.resumedRows).toEqual(['2026-09-03']);
  });

  test('cross-tab serialization uses locks when present and queues otherwise', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storeEntryPath = '/src/lib/data/store.ts';
      await import(/* @vite-ignore */ storeEntryPath);
      const replicatorPath = '/src/lib/functions/replication/replicator.ts';
      const { runSerialized } = await import(/* @vite-ignore */ replicatorPath);

      const lockCalls: Array<[string, object]> = [];
      const fakeLocks = {
        request: async (name: string, options: object, task: () => Promise<string>) => {
          lockCalls.push([name, options]);
          return task();
        }
      };

      const events: string[] = [];
      const slow = (label: string) => async () => {
        events.push(`${label}-start`);
        // Yield to force overlap between the two queued runSerialized tasks.
        // Timer duration is irrelevant to ordering (the queue guarantees it);
        // keep it short so cold boots don't pay wall-clock cost.
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push(`${label}-end`);
        return label;
      };

      const [first, second] = await Promise.all([
        runSerialized(slow('one'), fakeLocks as any),
        runSerialized(slow('two'), fakeLocks as any)
      ]);
      const fallback = await runSerialized(async () => 'fallback', null);

      return {
        first,
        second,
        fallback,
        events,
        lockCalls,
        locksAvailable: typeof navigator !== 'undefined' && !!navigator.locks
      };
    });

    expect(result.first).toBe('one');
    expect(result.second).toBe('two');
    expect(result.fallback).toBe('fallback');
    // Serialized even through the lock path: no interleaving.
    expect(result.events).toEqual(['one-start', 'one-end', 'two-start', 'two-end']);
    expect(result.lockCalls).toEqual([
      ['ttu-reader-sync', { mode: 'exclusive' }],
      ['ttu-reader-sync', { mode: 'exclusive' }]
    ]);
    expect(result.locksAvailable).toBe(true);
  });
});
