/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Statistics v2 contributions', () => {
  test('two devices reading the same book/day sum once and stay stable on re-fold', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const v2Path = '/src/lib/functions/statistic-v2.ts';
      const v2 = await import(/* @vite-ignore */ v2Path);

      const deviceA = {
        title: 'V2 Fold Book',
        dateKey: '2026-09-01',
        charactersRead: 600,
        readingTime: 120,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: 1000,
        readingTimeByHour: [0, 0, 0, 0, 0, 0, 0, 0, 120],
        sessionCount: 1
      };
      const deviceB = {
        title: 'V2 Fold Book',
        dateKey: '2026-09-01',
        charactersRead: 300,
        readingTime: 60,
        minReadingSpeed: 17000,
        altMinReadingSpeed: 17000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 19000,
        lastStatisticModified: 2000,
        readingTimeByHour: [0, 0, 0, 0, 0, 0, 0, 0, 60],
        sessionCount: 2,
        readingTimeByProfile: { 'profile-a': 60 }
      };

      const folded = v2.foldStatisticContributions([[deviceA], [deviceB]]);
      const refolded = v2.foldStatisticContributions([[deviceA], [deviceB]]);
      const fileA = v2.buildContributionFile('device-a', 2026, 3, [
        { ...deviceA, deviceId: 'device-a', year: 2026, revision: 3 }
      ]);
      const fileB = v2.buildContributionFile('device-a', 2026, 4, [
        { ...deviceA, deviceId: 'device-a', year: 2026, revision: 4 }
      ]);

      return {
        folded,
        refolded,
        fileName: v2.getContributionFileName('device-a', 2026),
        parsed: v2.parseContributionFileName(v2.getContributionFileName('device-a', 2026)),
        validFile: v2.isContributionFile(fileA),
        invalidFile: v2.isContributionFile({ format: 'statistics', rows: [] }),
        revisionBumps: fileB.revision,
        yearFiltered: v2.buildContributionFile('device-a', 2025, 1, [
          { ...deviceA, deviceId: 'device-a', year: 2026, revision: 1 }
        ]).rows.length
      };
    });

    expect(result.folded).toHaveLength(1);
    expect(result.folded[0].readingTime).toBe(180);
    expect(result.folded[0].charactersRead).toBe(900);
    expect(result.folded[0].sessionCount).toBe(3);
    // Derived speeds recomputed from folded totals, never folded directly.
    expect(result.folded[0].lastReadingSpeed).toBe(Math.ceil((3600 * 900) / 180));
    expect(result.folded[0].maxReadingSpeed).toBe(19000);
    expect(result.folded[0].minReadingSpeed).toBe(17000);
    expect(result.folded[0].readingTimeByHour?.[8]).toBe(180);
    expect(result.folded[0].readingTimeByProfile).toEqual({ 'profile-a': 60 });
    // No increase on a no-op re-fold with identical inputs.
    expect(result.refolded).toEqual(result.folded);
    expect(result.fileName).toBe('statistics_v2_device-a_2026.json');
    expect(result.parsed).toEqual({ deviceId: 'device-a', year: 2026 });
    expect(result.validFile).toBe(true);
    expect(result.invalidFile).toBe(false);
    expect(result.revisionBumps).toBe(4);
    expect(result.yearFiltered).toBe(0);
  });

  test('tracker writes stamp the local contribution and refold sums a remote device', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const identityPath = '/src/lib/functions/replication/device-identity.ts';
      const storePath = '/src/lib/data/store.ts';
      const saveBehaviorPath = '/src/lib/functions/replication/replication-options.ts';
      const mergeModePath = '/src/lib/data/merge-mode.ts';
      const { ensureDeviceIdentity } = await import(/* @vite-ignore */ identityPath);
      const { database } = await import(/* @vite-ignore */ storePath);
      const { ReplicationSaveBehavior } = await import(/* @vite-ignore */ saveBehaviorPath);
      const { MergeMode } = await import(/* @vite-ignore */ mergeModePath);

      const title = `V2 DualWrite ${Date.now()}`;
      const dateKey = '2026-09-02';
      const identity = await ensureDeviceIdentity(database);
      const db = await database.db;
      await db.delete('statistic', [title, dateKey]);
      await db.delete('statisticContribution', [title, dateKey]);

      await database.storeStatistics(
        title,
        [
          {
            title,
            dateKey,
            charactersRead: 650,
            readingTime: 130,
            minReadingSpeed: 18000,
            altMinReadingSpeed: 18000,
            lastReadingSpeed: 18000,
            maxReadingSpeed: 18000,
            lastStatisticModified: Date.now()
          }
        ],
        ReplicationSaveBehavior.Overwrite,
        MergeMode.LOCAL
      );

      const contributions = await database.getStatisticContributionsForBook(title);
      const remote = [
        {
          title,
          dateKey,
          charactersRead: 350,
          readingTime: 70,
          minReadingSpeed: 18000,
          altMinReadingSpeed: 18000,
          lastReadingSpeed: 18000,
          maxReadingSpeed: 18000,
          lastStatisticModified: Date.now()
        }
      ];
      const foldedOnce = await database.refoldDisplayStatistics([remote]);
      const foldedTwice = await database.refoldDisplayStatistics([remote]);
      const display = await database.getStatisticsForBook(title);

      await db.delete('statistic', [title, dateKey]);
      await db.delete('statisticContribution', [title, dateKey]);

      return {
        deviceId: identity.deviceId,
        contributions,
        foldedOnce: foldedOnce.filter((r: any) => r.title === title),
        foldedTwice: foldedTwice.filter((r: any) => r.title === title),
        display: display.filter((r: any) => r.dateKey === dateKey)
      };
    });

    expect(result.deviceId).toBeTruthy();
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0].deviceId).toBe(result.deviceId);
    expect(result.contributions[0].year).toBe(2026);
    expect(result.contributions[0].charactersRead).toBe(650);
    const folded = result.foldedOnce[0];
    expect(folded.readingTime).toBe(200);
    expect(folded.charactersRead).toBe(1000);
    // Repeated pull of identical contributions must not grow the totals.
    expect(result.foldedTwice).toEqual(result.foldedOnce);
    expect(result.display[0].readingTime).toBe(200);
    expect(result.display[0].charactersRead).toBe(1000);
  });

  test('legacy migration marker is recorded once per device', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { database } = await import(/* @vite-ignore */ storePath);
      const db = await database.db;
      await db.delete('statisticSyncState', 'legacy-migration-v1');
      const before = await database.isLegacyStatisticsMigrationComplete();
      await database.markLegacyStatisticsMigrationComplete();
      const after = await database.isLegacyStatisticsMigrationComplete();
      const state = await database.getStatisticSyncState('legacy-migration-v1');
      await db.delete('statisticSyncState', 'legacy-migration-v1');
      return { before, after, state };
    });

    expect(result.before).toBe(false);
    expect(result.after).toBe(true);
    expect(result.state?.legacyMigrationCompletedAt).toBeGreaterThan(0);
  });
});
