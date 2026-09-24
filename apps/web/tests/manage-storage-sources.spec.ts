/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { test, expect, type Page } from '@playwright/test';
import { seedLibraryItem, seedCloudSource, seedSyncConfig } from './fixtures/book-fixture';

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
    await seedLibraryItem(page);
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
    await seedLibraryItem(page);
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
    await seedLibraryItem(page);
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
    await seedLibraryItem(page);
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
    await seedLibraryItem(page);
    await seedSyncConfig(page, {
      syncTarget: 'test-gdrive-disc',
      gDriveStorageSource: 'test-gdrive-disc'
    });
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
