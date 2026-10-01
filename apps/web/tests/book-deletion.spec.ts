/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import {
  SAMPLE_BOOK,
  seedReaderBook,
  seedStatistics,
  seedSyncConfig
} from './fixtures/book-fixture';
import { currentDbVersion } from '../src/lib/data/database/books-db/versions/books-db';

test.describe('Book Deletion Confirmation', () => {
  test('shows confirmation prompt when deleting a book via card delete button and cancels deletion', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Hover over the card to reveal the delete button
    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Confirm dialog should be visible with expected header and message
    const dialogHeader = page.locator('.astryx-dialog-surface h2');
    await expect(dialogHeader).toContainText('Delete');

    const dialogContent = page.locator('.astryx-dialog-surface');
    await expect(dialogContent).toContainText('local browser copy');
    await expect(dialogContent).toContainText(SAMPLE_BOOK.title);

    // Clicking Cancel should close the dialog and keep the book
    const cancelBtn = page.locator('.astryx-dialog-surface button').filter({ hasText: 'Cancel' });
    await cancelBtn.click();
    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
    await expect(bookCard).toBeVisible();
  });

  test('confirms deletion via card delete button and removes the book', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Hover and click delete button
    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Confirm dialog should be visible
    await expect(page.locator('.astryx-dialog-surface h2')).toContainText('Delete');

    // Click Delete local copy to delete
    const confirmBtn = page
      .locator('.astryx-dialog-surface button')
      .filter({ hasText: 'Delete local copy' });
    await confirmBtn.click();

    // Dialog closes and book is removed
    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
    await expect(bookCard).not.toBeVisible({ timeout: 10000 });
  });

  test('shows confirmation prompt when deleting selected books in select mode', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Enable book selection mode
    const enableSelectBtn = page.locator('button[aria-label="Enable Book Selection"]');
    await expect(enableSelectBtn).toBeVisible();
    await enableSelectBtn.click();

    // Select the book card
    await bookCard.click();

    // Delete selected books button in header
    const deleteSelectedBtn = page.locator('button[aria-label="Delete selected Books"]');
    await expect(deleteSelectedBtn).toBeVisible();
    await deleteSelectedBtn.click();

    // Dialog appears with header and message
    await expect(page.locator('.astryx-dialog-surface h2')).toContainText('Delete');
    await expect(page.locator('.astryx-dialog-surface')).toContainText('local browser copy');
    await expect(page.locator('.astryx-dialog-surface')).toContainText(SAMPLE_BOOK.title);

    // Confirm deletion
    const confirmBtn = page
      .locator('.astryx-dialog-surface button')
      .filter({ hasText: 'Delete local copy' });
    await confirmBtn.click();

    // Book is deleted
    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
    await expect(bookCard).not.toBeVisible({ timeout: 10000 });
  });

  test('library settles after deleting the only book instead of sticking on Loading', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const confirmBtn = page
      .locator('.astryx-dialog-surface button')
      .filter({ hasText: 'Delete local copy' });
    await confirmBtn.click();

    // Dialog closes and the empty-state (not a stuck Loading indicator) appears
    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
    await expect(page.getByText('Loading...')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Upload Books')).toBeVisible({ timeout: 10000 });
  });

  test('toggling statistics checkbox updates confirmation button label', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const statsCheckbox = page.getByTestId('delete-statistics-checkbox');
    const confirmBtn = page.getByTestId('confirm-delete-button');

    await statsCheckbox.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(statsCheckbox).toBeVisible();
    await expect(statsCheckbox).not.toBeChecked();
    await expect(confirmBtn).toHaveText('Delete local copy');

    // Toggle on
    await statsCheckbox.check({ force: true });
    await expect(statsCheckbox).toBeChecked();
    await expect(confirmBtn).toHaveText('Delete local copy (all data)');

    // Toggle off
    await statsCheckbox.uncheck({ force: true });
    await expect(statsCheckbox).not.toBeChecked();
    await expect(confirmBtn).toHaveText('Delete local copy');

    const cancelBtn = page.locator('.astryx-dialog-surface button').filter({ hasText: 'Cancel' });
    await cancelBtn.click();
    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
  });

  test('deleting a book with delete-statistics checked purges statistics from IndexedDB', async ({
    page
  }) => {
    const bookTitle = 'Stats Deletion Target Book';
    await seedReaderBook(page, { title: bookTitle, characters: 10000 });
    await seedStatistics(page, [
      {
        title: bookTitle,
        dateKey: '2026-10-01',
        charactersRead: 1500,
        readingTime: 300,
        minReadingSpeed: 300,
        altMinReadingSpeed: 300,
        lastReadingSpeed: 300,
        maxReadingSpeed: 300,
        lastStatisticModified: Date.now()
      }
    ]);

    await page.goto('/manage');
    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Verify statistics exist prior to deletion
    const initialStatsCount = await page.evaluate(
      async ({ title, version }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('books', version);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        return new Promise<number>((resolve, reject) => {
          const tx = db.transaction('statistic', 'readonly');
          const store = tx.objectStore('statistic');
          const req = store.getAll(IDBKeyRange.bound([title], [title, []]));
          req.onsuccess = () => resolve(req.result.length);
          req.onerror = () => reject(req.error);
        });
      },
      { title: bookTitle, version: currentDbVersion }
    );
    expect(initialStatsCount).toBe(1);

    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const statsCheckbox = page.getByTestId('delete-statistics-checkbox');
    await expect(statsCheckbox).toBeVisible();
    await statsCheckbox.check();

    const confirmBtn = page.getByTestId('confirm-delete-button');
    await expect(confirmBtn).toHaveText('Delete local copy (all data)');
    await confirmBtn.click();

    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
    await expect(bookCard).not.toBeVisible({ timeout: 10000 });

    // Verify statistics are purged
    const afterStatsCount = await page.evaluate(
      async ({ title, version }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('books', version);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        return new Promise<number>((resolve, reject) => {
          const tx = db.transaction('statistic', 'readonly');
          const store = tx.objectStore('statistic');
          const req = store.getAll(IDBKeyRange.bound([title], [title, []]));
          req.onsuccess = () => resolve(req.result.length);
          req.onerror = () => reject(req.error);
        });
      },
      { title: bookTitle, version: currentDbVersion }
    );
    expect(afterStatsCount).toBe(0);
  });

  test('deleting a book without delete-statistics preserves statistics in IndexedDB', async ({
    page
  }) => {
    const bookTitle = 'Stats Preserved Target Book';
    await seedReaderBook(page, { title: bookTitle, characters: 10000 });
    await seedStatistics(page, [
      {
        title: bookTitle,
        dateKey: '2026-10-01',
        charactersRead: 2000,
        readingTime: 400,
        minReadingSpeed: 300,
        altMinReadingSpeed: 300,
        lastReadingSpeed: 300,
        maxReadingSpeed: 300,
        lastStatisticModified: Date.now()
      }
    ]);

    await page.goto('/manage');
    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const statsCheckbox = page.getByTestId('delete-statistics-checkbox');
    await expect(statsCheckbox).toBeVisible();
    expect(await statsCheckbox.isChecked()).toBe(false);

    const confirmBtn = page.getByTestId('confirm-delete-button');
    await expect(confirmBtn).toHaveText('Delete local copy');
    await confirmBtn.click();

    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
    await expect(bookCard).not.toBeVisible({ timeout: 10000 });

    // Verify statistics are preserved
    const afterStatsCount = await page.evaluate(
      async ({ title, version }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open('books', version);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        return new Promise<number>((resolve, reject) => {
          const tx = db.transaction('statistic', 'readonly');
          const store = tx.objectStore('statistic');
          const req = store.getAll(IDBKeyRange.bound([title], [title, []]));
          req.onsuccess = () => resolve(req.result.length);
          req.onerror = () => reject(req.error);
        });
      },
      { title: bookTitle, version: currentDbVersion }
    );
    expect(afterStatsCount).toBe(1);
  });

  test('shows cloud deletion option and updates button to Delete everywhere when cloud storage is connected', async ({
    page
  }) => {
    await seedReaderBook(page);
    await seedSyncConfig(page, { gdrive: 'gdrive' });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const cloudCheckbox = page.getByTestId('delete-cloud-checkbox');
    const statsCheckbox = page.getByTestId('delete-statistics-checkbox');
    const confirmBtn = page.getByTestId('confirm-delete-button');

    await expect(cloudCheckbox).toBeVisible();
    await expect(cloudCheckbox).not.toBeChecked();
    await expect(confirmBtn).toHaveText('Delete local copy');

    // Check cloud deletion
    await cloudCheckbox.check({ force: true });
    await expect(cloudCheckbox).toBeChecked();
    await expect(confirmBtn).toHaveText('Delete everywhere');

    // Also check statistics deletion
    await statsCheckbox.check({ force: true });
    await expect(statsCheckbox).toBeChecked();
    await expect(confirmBtn).toHaveText('Delete everywhere (all data)');

    // Uncheck cloud deletion (stats still checked)
    await cloudCheckbox.uncheck({ force: true });
    await expect(cloudCheckbox).not.toBeChecked();
    await expect(confirmBtn).toHaveText('Delete local copy (all data)');

    const cancelBtn = page.locator('.astryx-dialog-surface button').filter({ hasText: 'Cancel' });
    await cancelBtn.click();
    await expect(page.locator('.astryx-dialog-surface')).not.toBeVisible();
  });
});
