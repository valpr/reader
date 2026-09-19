/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK, seedReaderBook } from './fixtures/book-fixture';

test.describe('Book Card Options Menu', () => {
  test('shows an always-visible options button that opens upload and details actions', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // No hover needed: the kebab is always visible (unlike the hover-only delete X)
    const menuBtn = page.getByRole('button', {
      name: `Book options for ${SAMPLE_BOOK.title}`
    });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    await expect(page.getByRole('button', { name: 'Upload to primary cloud' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View details' })).toBeVisible();
  });

  test('view details opens a dialog with book metadata and closes', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).click();
    await page.getByRole('button', { name: 'View details' }).click();

    const details = page.getByTestId('book-details-dialog');
    await expect(details).toBeVisible();
    await expect(page.locator('.astryx-dialog-surface')).toContainText(SAMPLE_BOOK.title);
    await expect(details).toContainText('Characters');
    await expect(details).toContainText('Last Read');
    await expect(details).toContainText('Browser');

    await page.locator('.astryx-dialog-surface button').filter({ hasText: 'Close' }).click();
    await expect(details).not.toBeVisible();
  });

  test('upload prompts to configure a primary cloud when none is set', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).click();
    await page.getByRole('button', { name: 'Upload to primary cloud' }).click();

    const dialog = page.locator('.astryx-dialog-surface');
    await expect(dialog).toContainText('No primary cloud');
    await expect(dialog).toContainText('primary cloud sync target');
  });

  test('menu button yields to the selection overlay in select mode', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    const enableSelectBtn = page.locator('button[aria-label="Enable Book Selection"]');
    await expect(enableSelectBtn).toBeVisible();
    await enableSelectBtn.click();

    await bookCard.click();

    await expect(
      page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` })
    ).not.toBeVisible();
  });

  test('delete X still appears on hover alongside the menu button', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` })
    ).toBeVisible();

    await bookCard.hover();
    await expect(page.locator('div[role="button"].bg-red-400').first()).toBeVisible();
  });

  test('hides upload for cloud-only books without a local browser copy', async ({ page }) => {
    const cloudTitle = 'Cloud Only Book (Playwright Test Book)';

    // Boot with a primary GDrive target so the library lists the mocked cloud.
    await page.addInitScript(() => {
      window.localStorage.setItem('syncTarget', 'test-gdrive-cloud');
      window.localStorage.setItem('gDriveStorageSource', 'test-gdrive-cloud');
    });

    // Seed the full local schema plus one local book (distinct title, so the
    // mocked cloud title below surfaces as its own cloud-only card).
    await seedReaderBook(page);

    // Seed a connected custom GDrive source with a plain (unencrypted)
    // RemoteContext so listing never needs an unlock dialog.
    await page.evaluate(async () => {
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
          name: 'test-gdrive-cloud',
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
      });
    });

    await page.route('https://oauth2.googleapis.com/token', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-access-token',
          expires_in: '3600',
          scope: 'test'
        })
      })
    );

    // Mock a Drive library holding one title that exists only in the cloud:
    // root folder lookup, title-folder listing, then the bookdata file inside it.
    await page.route('https://www.googleapis.com/drive/v3/files**', (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q') || '';

      if (query.includes('name = ')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ files: [{ id: 'root-id' }] })
        });
      }

      if (query.includes('cloud-title-id')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [
              {
                id: 'bookdata-id',
                name: 'bookdata_1_7_500_1700000000000_1700000000000.zip',
                parents: ['cloud-title-id']
              }
            ]
          })
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: [{ id: 'cloud-title-id', name: cloudTitle }] })
      });
    });

    // Both the seeded local book and the cloud-only title render as cards.
    await page.goto('/manage');

    const localMenuBtn = page.getByRole('button', {
      name: `Book options for ${SAMPLE_BOOK.title}`
    });
    await expect(localMenuBtn).toBeVisible({ timeout: 20000 });

    const menuBtn = page.getByRole('button', { name: `Book options for ${cloudTitle}` });
    await expect(menuBtn).toBeVisible({ timeout: 20000 });

    // Local book still offers upload ...
    await localMenuBtn.click();
    await expect(page.getByRole('button', { name: 'Upload to primary cloud' })).toBeVisible();

    // ... but the cloud-only menu opened here offers details only.
    // (Clicking its kebab dismisses the local popover via click-outside.)
    await menuBtn.click();
    await expect(page.getByRole('button', { name: 'View details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload to primary cloud' })).toHaveCount(0);
  });

  test('view details allows resetting reading progress and statistics', async ({ page }) => {
    await seedReaderBook(page);
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('books');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['bookmark'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore('bookmark').put({
          dataId: 1,
          exploredCharCount: 600,
          progress: 0.5,
          lastBookmarkModified: Date.now()
        });
      });
    });

    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).click();
    await page.getByRole('button', { name: 'View details' }).click();

    const details = page.getByTestId('book-details-dialog');
    await expect(details).toBeVisible();
    await expect(details).toContainText('50%');

    // Click Reset button to reveal confirmation prompt
    await page.getByTestId('reset-progress-button').click();
    await expect(page.getByTestId('confirm-reset-progress')).toBeVisible();
    await expect(page.getByTestId('cancel-reset-progress')).toBeVisible();

    // Cancel hides the confirmation without resetting
    await page.getByTestId('cancel-reset-progress').click();
    await expect(page.getByTestId('confirm-reset-progress')).not.toBeVisible();
    await expect(page.getByTestId('reset-progress-button')).toBeVisible();

    // Confirm resets progress and closes details dialog
    await page.getByTestId('reset-progress-button').click();
    await page.getByTestId('confirm-reset-progress').click();
    await expect(details).not.toBeVisible();

    // Reopen details and verify progress is now 0%
    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).click();
    await page.getByRole('button', { name: 'View details' }).click();
    await expect(page.getByTestId('book-details-dialog')).toBeVisible();
    await expect(page.getByTestId('book-details-dialog')).toContainText('0%');
  });
});
