/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Statistics v2 two-device sync', () => {
  test.describe.configure({ timeout: 120_000 });

  test('sequential phone to desktop use converges and repeats stably', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      // Import the store first: it constructs DatabaseService at module top
      // level, so it must enter the store/service cycle before the service
      // module does (otherwise the class binding is still uninitialized).
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
      const dbNameA = `m2-sync-a-${stamp}`;
      const dbNameB = `m2-sync-b-${stamp}`;
      const dbA = new DatabaseService(createBooksDb(dbNameA));
      const dbB = new DatabaseService(createBooksDb(dbNameB));
      const deviceA = 'device-a';
      const deviceB = 'device-b';
      await dbA.putDeviceIdentity({ id: 0, deviceId: deviceA, deviceLabel: 'A' });
      await dbB.putDeviceIdentity({ id: 0, deviceId: deviceB, deviceLabel: 'B' });

      // In-memory contribution remote: stable filenames, duplicate-tolerant
      // marker list, countable writes.
      const files = new Map();
      const markers = new Map();
      let fileWrites = 0;
      let markerWrites = 0;
      const remote = {
        listContributionFiles: async () => [...files.values()],
        writeContributionFiles: async (next: any[]) => {
          fileWrites += next.length;
          for (const file of next) {
            files.set(v2.getContributionFileName(file.deviceId, file.year), file);
          }
        },
        listMigrationMarkers: async () => [...markers.values()],
        writeMigrationMarker: async (marker: any) => {
          markerWrites += 1;
          markers.set(marker.deviceId, marker);
        },
        listLegacyStatisticSnapshots: async () => []
      };

      const title = `V2 Sync Book ${stamp}`;
      const historyKey = '2026-08-15';
      const todayKey = '2026-09-02';
      const history = {
        title,
        dateKey: historyKey,
        charactersRead: 6500,
        readingTime: 1300,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: 1000
      };
      const readingA = {
        title,
        dateKey: todayKey,
        charactersRead: 600,
        readingTime: 120,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: 2000,
        sessionCount: 1
      };
      const readingB = {
        title,
        dateKey: todayKey,
        charactersRead: 300,
        readingTime: 60,
        minReadingSpeed: 17000,
        altMinReadingSpeed: 17000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 19000,
        lastStatisticModified: 3000,
        sessionCount: 2
      };

      const summarize = async (db: any) => {
        const display = await db.getAllDisplayStatistics();
        const own = await db.getStatisticContributions();
        return {
          display: display.map((r: any) => ({
            dateKey: r.dateKey,
            charactersRead: r.charactersRead,
            readingTime: r.readingTime,
            sessionCount: r.sessionCount || 0
          })),
          own: own.map((r: any) => ({
            dateKey: r.dateKey,
            charactersRead: r.charactersRead,
            deviceId: r.deviceId
          }))
        };
      };

      // Legacy history only on A, synced the old way (display-only merge).
      await dbA.storeStatistics(
        title,
        [history],
        ReplicationSaveBehavior.Overwrite,
        MergeMode.MERGE
      );

      // Simulate B's concurrent first-sync proposal (empty history) racing
      // A's: both markers coexist, lowest deviceId wins, B adopts A's baseline.
      markers.set(deviceB, {
        format: 'statistics-v2-migration',
        version: 1,
        deviceId: deviceB,
        completedAt: stamp,
        baselineRows: []
      });

      // Concurrent first syncs: both propose, lowest deviceId wins, both adopt.
      await sync.ensureContributionMigration(dbA, remote, deviceA);
      await sync.ensureContributionMigration(dbB, remote, deviceB);
      const afterMigrationA = await summarize(dbA);
      const afterMigrationB = await summarize(dbB);
      const migratedTwiceA = await dbA.isLegacyStatisticsMigrationComplete();
      const migratedTwiceB = await dbB.isLegacyStatisticsMigrationComplete();

      // A reads and publishes; B pulls.
      await dbA.storeStatistics(
        title,
        [readingA],
        ReplicationSaveBehavior.Overwrite,
        MergeMode.LOCAL
      );
      await sync.syncStatisticContributions(dbA, remote, deviceA);
      await sync.syncStatisticContributions(dbB, remote, deviceB);
      const afterPullB = await summarize(dbB);

      // B reads the same book/day and publishes; A pulls.
      await dbB.storeStatistics(
        title,
        [readingB],
        ReplicationSaveBehavior.Overwrite,
        MergeMode.LOCAL
      );
      await sync.syncStatisticContributions(dbB, remote, deviceB);
      await sync.syncStatisticContributions(dbA, remote, deviceA);
      const convergedA = await summarize(dbA);
      const convergedB = await summarize(dbB);

      // No-op re-sync performs no file writes and changes nothing.
      const writesBefore = fileWrites;
      await sync.syncStatisticContributions(dbA, remote, deviceA);
      await sync.syncStatisticContributions(dbB, remote, deviceB);
      const idleWrites = fileWrites - writesBefore;
      const stableA = await summarize(dbA);
      const stableB = await summarize(dbB);

      // Migration re-run imports nothing twice.
      await sync.ensureContributionMigration(dbA, remote, deviceA);
      await sync.ensureContributionMigration(dbB, remote, deviceB);
      const finalA = await summarize(dbA);

      const fileNames = [...files.keys()].sort();
      const markerIds = [...markers.keys()].sort();

      // deleteDatabase blocks until every connection closes.
      (await dbA.db).close();
      (await dbB.db).close();
      for (const name of [dbNameA, dbNameB]) {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => resolve();
        });
      }

      return {
        afterMigrationA,
        afterMigrationB,
        migratedTwiceA,
        migratedTwiceB,
        afterPullB,
        convergedA,
        convergedB,
        stableA,
        stableB,
        finalA,
        idleWrites,
        fileNames,
        markerIds,
        markerWrites
      };
    });

    // Migration: A's legacy history is the single baseline on both devices.
    expect(result.migratedTwiceA).toBe(true);
    expect(result.migratedTwiceB).toBe(true);
    expect(result.afterMigrationA.display).toEqual(result.afterMigrationB.display);
    expect(result.afterMigrationA.display).toContainEqual({
      dateKey: '2026-08-15',
      charactersRead: 6500,
      readingTime: 1300,
      sessionCount: 0
    });
    expect(result.afterMigrationA.own).toEqual([]);
    expect(result.afterMigrationB.own).toEqual([]);

    // B's pull sums A's fresh reading under the preserved history.
    expect(result.afterPullB.display).toContainEqual({
      dateKey: '2026-09-02',
      charactersRead: 600,
      readingTime: 120,
      sessionCount: 1
    });

    // Convergence: same book/day sums across devices, history intact.
    const todayA = result.convergedA.display.find((r: any) => r.dateKey === '2026-09-02');
    const todayB = result.convergedB.display.find((r: any) => r.dateKey === '2026-09-02');
    expect(todayA).toEqual({
      dateKey: '2026-09-02',
      charactersRead: 900,
      readingTime: 180,
      sessionCount: 3
    });
    expect(todayB).toEqual(todayA);
    expect(result.convergedA.display).toContainEqual({
      dateKey: '2026-08-15',
      charactersRead: 6500,
      readingTime: 1300,
      sessionCount: 0
    });

    // Attribution stays per-device: nobody absorbed another device's reading.
    expect(result.convergedA.own).toEqual([
      { dateKey: '2026-09-02', charactersRead: 600, deviceId: 'device-a' }
    ]);
    expect(result.convergedB.own).toEqual([
      { dateKey: '2026-09-02', charactersRead: 300, deviceId: 'device-b' }
    ]);

    // Bounded stable files, both markers present, no-op sync writes nothing.
    expect(result.fileNames).toEqual([
      'statistics_v2_device-a_2026.json',
      'statistics_v2_device-b_2026.json'
    ]);
    expect(result.markerIds).toEqual(['device-a', 'device-b']);
    expect(result.idleWrites).toBe(0);
    expect(result.stableA).toEqual(result.convergedA);
    expect(result.stableB).toEqual(result.convergedB);
    expect(result.finalA).toEqual(result.convergedA);
    // One orchestrator marker write (A's proposal); B's raced proposal was
    // pre-seeded and B adopted the winner without proposing again.
    expect(result.markerWrites).toBe(1);
  });
});
