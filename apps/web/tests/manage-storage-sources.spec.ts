/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

interface SeedCloudSource {
  name: string;
  disconnected: boolean;
  refreshToken?: string;
}

async function seedCloudSource(page: Page, source: SeedCloudSource) {
  await page.evaluate(async (s) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('books');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('storageSource', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('storageSource').put({
        name: s.name,
        type: 'gdrive',
        data: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: s.refreshToken || '',
          accountEmail: 'test@example.com',
          accountName: 'Test'
        },
        storedInManager: false,
        encryptionDisabled: true,
        lastSourceModified: Date.now(),
        disconnected: s.disconnected
      });
    });
  }, source);
}

async function openSourceFilter(page: Page) {
  const filterButton = page.getByRole('button', { name: 'Search and filter library' });
  const browserOption = page.getByRole('button', { name: 'Browser', exact: true });
  await expect(filterButton).toBeVisible({ timeout: 15000 });
  // Clicks can land while the header is still settling (async session
  // restore shifts items) and miss the popover toggle, so only click when
  // closed and retry until the dropdown proves itself open.
  await expect(async () => {
    if ((await browserOption.count()) === 0) {
      await filterButton.click();
    }
    await expect(browserOption).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 25000 });
}

test.describe('Manage Books Source Filter', () => {
  test('displays All/Browser plus a Cloud setup placeholder when no cloud is connected', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await openSourceFilter(page);

    // No sources configured: cloud types are hidden, not listed.
    await expect(page.getByText('All sources', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'GDrive', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'OneDrive', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Cloud Connect a cloud$/ })).toBeVisible();
  });

  test('selecting a source filters the library', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    const filterButton = page.getByRole('button', { name: 'Search and filter library' });
    await filterButton.click();
    await page.getByRole('button', { name: 'Browser', exact: true }).click();

    // Button reflects the active filter, stays open for combining, and badges +1 for the source
    await expect(filterButton).toContainText('Browser');
    await expect(page.getByTestId('library-search-input')).toBeVisible();
    await expect(page.getByTestId('library-active-filter-count')).toHaveText('1');
    await expect(bookCard).toBeVisible({ timeout: 10000 });
  });

  test('hides disconnected cloud types and offers a Cloud setup placeholder', async ({ page }) => {
    await seedReaderBook(page);
    await seedCloudSource(page, { name: 'old-gdrive', disconnected: true });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await openSourceFilter(page);
    await expect(page.getByRole('button', { name: 'GDrive', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'OneDrive', exact: true })).toHaveCount(0);

    // No cloud available: the placeholder routes to cloud enrollment in Settings.
    const setup = page.getByRole('button', { name: /^Cloud Connect a cloud$/ });
    await expect(setup).toBeVisible();
    await setup.click();
    await expect(page).toHaveURL(/\/settings\/data/);
  });

  test('keeps filter options for sources with expired sessions', async ({ page }) => {
    await seedReaderBook(page);
    await seedCloudSource(page, {
      name: 'stale-gdrive',
      disconnected: false,
      refreshToken: 'test-refresh-token'
    });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await openSourceFilter(page);
    await expect(page.getByRole('button', { name: /GDrive.*Session expired/ })).toBeVisible();
    // One cloud available: no setup placeholder.
    await expect(page.getByRole('button', { name: /^Cloud Connect a cloud$/ })).toHaveCount(0);
  });

  test('disconnecting the primary cloud removes its type from the filter', async ({ page }) => {
    // Seed once: addInitScript runs before EVERY navigation, so only fill
    // keys that were never set (null) — a cleared '' value after disconnect
    // must survive subsequent visits instead of being re-seeded.
    await page.addInitScript(() => {
      if (window.localStorage.getItem('syncTarget') === null) {
        window.localStorage.setItem('syncTarget', 'test-gdrive-disc');
      }
      if (window.localStorage.getItem('gDriveStorageSource') === null) {
        window.localStorage.setItem('gDriveStorageSource', 'test-gdrive-disc');
      }
    });
    await seedReaderBook(page);
    await seedCloudSource(page, {
      name: 'test-gdrive-disc',
      disconnected: false,
      refreshToken: 'test-refresh-token'
    });

    // Disconnect straight from Settings: the confirm dialog closes on
    // Confirm while persistence finishes async, so wait for the record AND
    // the in-page Disconnected status (the disconnect tail clears the sync
    // target in the same synchronous block) before navigating anywhere.
    await page.goto('/settings/data');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.locator('.astryx-dialog-surface')).toContainText('Disconnect Storage Source');
    await page.locator('.astryx-dialog-surface button').filter({ hasText: 'Confirm' }).click();
    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
    await page.waitForFunction(
      async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('books');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const record = await new Promise<any>((resolve, reject) => {
          const tx = db.transaction('storageSource', 'readonly');
          const req = tx.objectStore('storageSource').get('test-gdrive-disc');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        return record?.disconnected === true;
      },
      undefined,
      { timeout: 15000 }
    );
    // The card flips to "Local Storage Only" once the disconnect tail
    // clears the sync target (last step of the same synchronous block), so
    // its appearance proves persistence settled before navigating away.
    // (Poll localStorage directly: the in-page record write and the target
    // clear land in separate ticks.)
    await expect
      .poll(async () => page.evaluate(() => window.localStorage.getItem('syncTarget')), {
        timeout: 15000
      })
      .toBeFalsy();
    await expect(page.getByRole('heading', { name: 'Local Storage Only' })).toBeVisible({
      timeout: 15000
    });
    // The disconnected type is gone from the library filter.
    await page.goto('/manage');
    await openSourceFilter(page);
    await expect(page.getByRole('button', { name: 'GDrive', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Cloud Connect a cloud$/ })).toBeVisible();
  });
});
