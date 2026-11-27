/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('Sync device identity', () => {
  test('mints once and repairs a conflicting localStorage copy from IndexedDB', async ({
    page
  }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const identityPath = '/src/lib/functions/replication/device-identity.ts';
      const storePath = '/src/lib/data/store.ts';
      const { ensureDeviceIdentity } = await import(/* @vite-ignore */ identityPath);
      const { database } = await import(/* @vite-ignore */ storePath);
      const db = await database.db;

      await db.clear('deviceIdentity');
      localStorage.removeItem('syncDeviceIdentity');

      const minted = await ensureDeviceIdentity(database);
      localStorage.setItem(
        'syncDeviceIdentity',
        JSON.stringify({ id: 0, deviceId: 'cloned-device', deviceLabel: 'Clone' })
      );
      const reconciled = await ensureDeviceIdentity(database);

      return {
        minted,
        reconciled,
        indexed: await db.get('deviceIdentity', 0),
        stored: JSON.parse(localStorage.getItem('syncDeviceIdentity') || 'null')
      };
    });

    expect(result.minted.deviceId).toBeTruthy();
    expect(result.reconciled).toEqual(result.minted);
    expect(result.indexed).toEqual(result.minted);
    expect(result.stored).toEqual(result.minted);
  });

  test('adopting a fresh identity replaces both stores and sticks', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const identityPath = '/src/lib/functions/replication/device-identity.ts';
      const storePath = '/src/lib/data/store.ts';
      const { ensureDeviceIdentity, adoptFreshDeviceIdentity } = await import(
        /* @vite-ignore */ identityPath
      );
      const { database } = await import(/* @vite-ignore */ storePath);
      const db = await database.db;

      await db.clear('deviceIdentity');
      localStorage.removeItem('syncDeviceIdentity');

      const original = await ensureDeviceIdentity(database);
      const adopted = await adoptFreshDeviceIdentity(database, 'Replacement');
      // The localStorage mirror must not resurrect the old identity.
      const reconciled = await ensureDeviceIdentity(database);

      return {
        original,
        adopted,
        reconciled,
        indexed: await db.get('deviceIdentity', 0),
        stored: JSON.parse(localStorage.getItem('syncDeviceIdentity') || 'null')
      };
    });

    expect(result.adopted.deviceId).toBeTruthy();
    expect(result.adopted.deviceId).not.toEqual(result.original.deviceId);
    expect(result.adopted.deviceLabel).toEqual('Replacement');
    expect(result.reconciled).toEqual(result.adopted);
    expect(result.indexed).toEqual(result.adopted);
    expect(result.stored).toEqual(result.adopted);
  });
});
