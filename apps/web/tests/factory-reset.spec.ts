/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';
import { mockGoogleDrive } from './helpers/cloud-mocks';

test.describe('Factory reset', () => {
  test('reset wipes local data and restores defaults', async ({ page }) => {
    // Seeds one book into IndexedDB (navigates to '/' first).
    await seedReaderBook(page);
    await page.goto('/settings/data');
    // Wait for JS hydration so settings actions are interactive.
    await expect(page.getByTestId('factory-reset')).toBeVisible({ timeout: 15000 });

    // Flip a real setting through the UI so subject and storage agree.
    const cacheSwitch = page
      .getByRole('listitem')
      .filter({ hasText: 'Cache Storage Data' })
      .getByRole('switch');
    await expect(cacheSwitch).toBeVisible();
    await cacheSwitch.click();
    expect(await page.evaluate(() => window.localStorage.getItem('cacheStorageData'))).toBe('1');

    await page.getByTestId('factory-reset').click();
    await expect(page.getByText('Reset everything?')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Last chance')).toBeVisible();
    const reloaded = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await reloaded;

    // Every IndexedDB store is empty (storage subjects never write
    // eagerly, so cleared keys stay absent until the user changes them).
    const counts = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('books');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const result: Record<string, number> = {};
      try {
        for (const name of Array.from(db.objectStoreNames)) {
          const tx = db.transaction(name, 'readonly');
          result[name] = await new Promise<number>((resolve, reject) => {
            const countRequest = tx.objectStore(name).count();
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = () => reject(countRequest.error);
          });
        }
      } finally {
        db.close();
      }
      return result;
    });
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);

    // The toggled setting is back to its default (absent from storage).
    expect(await page.evaluate(() => window.localStorage.getItem('cacheStorageData'))).toBeNull();

    // Library is empty.
    await page.goto('/manage');
    await expect(page.getByText('Upload Books')).toBeVisible();
  });

  test('fresh defaults do not overwrite cloud customizations on upload', async ({ page }) => {
    const customProfile = {
      id: 'custom-cloud',
      name: 'Cloud Custom',
      icon: 'custom',
      description: 'customizations from the cloud',
      updatedAt: 1700000000000,
      isDefault: false,
      settings: {}
    };
    const cloudPayload = {
      version: 1,
      lastModified: 1700000000000,
      profiles: [customProfile],
      customThemes: {}
    };

    // Seed connection settings before boot so in-memory stores initialize
    // from them (init scripts run on every navigation with the same values,
    // and this test never reloads).
    await page.addInitScript(() => {
      window.localStorage.setItem('syncTarget', 'test-gdrive');
      window.localStorage.setItem('autoReplication', 'all');
    });
    await page.goto('/settings/reader');
    // Wait for JS hydration so profile actions are interactive.
    await expect(page.getByText('Mobile / Phone')).toBeVisible({ timeout: 15000 });

    // Seed a connected custom GDrive source with a plain (unencrypted)
    // RemoteContext so no unlock dialog is ever needed. The settings mount
    // already created the v7 database.
    await page.evaluate(() => {
      const openRequest = indexedDB.open('books');
      return new Promise<void>((resolve, reject) => {
        openRequest.onsuccess = () => {
          const db = openRequest.result;
          const tx = db.transaction('storageSource', 'readwrite');
          tx.objectStore('storageSource').put({
            name: 'test-gdrive',
            type: 'gdrive',
            data: {
              clientId: 'test-client-id',
              clientSecret: 'test-client-secret',
              refreshToken: 'test-refresh-token',
              accountEmail: 'test@example.com',
              accountName: 'Test'
            },
            storedInManager: false,
            encryptionDisabled: true,
            lastSourceModified: Date.now(),
            disconnected: false
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        openRequest.onerror = () => reject(openRequest.error);
      });
    });

    const driveMock = await mockGoogleDrive(page, {
      cloudPayload,
      defaultFiles: [{ id: 'profiles-file-id', name: 'ttu-user-profiles_1_7_1700000000000.json' }]
    });

    // Switching profiles pushes local profiles to the primary cloud target.
    // (Predicate on PATCH: the CORS preflight OPTIONS hits the same URL first.
    // waitForResponse — not waitForRequest — so the route handler, which
    // captures the body, has necessarily run before we assert on it.)
    const uploadResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' && response.url().includes('/upload/drive/v3/files')
    );
    await page.locator('[role="button"]:has-text("Mobile / Phone")').click();
    await uploadResponse;

    // Union, not replace: the cloud custom survives exactly once alongside
    // the built-in defaults — nothing was clobbered or duplicated.
    const uploadedBody = driveMock.getUploadedBody();
    expect(uploadedBody).toContain('"id":"custom-cloud"');
    expect(uploadedBody).toContain('"name":"Cloud Custom"');
    expect(uploadedBody.match(/"id":"custom-cloud"/g)).toHaveLength(1);
    expect(uploadedBody).toContain('"id":"default-desktop"');
    expect(uploadedBody).toContain('"id":"default-ereader"');
    expect(uploadedBody.match(/"id":"/g)?.length).toBe(5);
  });
});
