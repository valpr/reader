/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK, seedReaderBook } from './fixtures/book-fixture';
import { currentDbVersion } from '../src/lib/data/database/books-db/versions/books-db';

test.describe('Book Tags', () => {
  test('tags render on the card without overlapping the delete X', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy', 'science-fiction', 'epic'] });
    await page.goto('/manage');

    const strip = page.getByTestId('book-card-tags-1');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('fantasy');
    await expect(strip).toContainText('+1');

    // The hover-only delete X must not overlap the tag strip
    const bookCard = page.locator('.aspect-w-2').first();
    await bookCard.hover();
    const deleteBtn = page.locator('div[role="button"].bg-red-400').first();
    await expect(deleteBtn).toBeVisible();

    const stripBox = await strip.boundingBox();
    const deleteBox = await deleteBtn.boundingBox();
    expect(stripBox).not.toBeNull();
    expect(deleteBox).not.toBeNull();
    expect(stripBox!.x + stripBox!.width).toBeLessThanOrEqual(deleteBox!.x + 1);
  });

  test('tags can be added and removed in the details dialog and persist', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy'] });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).click();
    await page.getByRole('button', { name: 'View details' }).click();

    const editor = page.getByTestId('book-tags-editor');
    await expect(editor).toBeVisible();
    await expect(editor).toContainText('fantasy');

    // Add a tag via the input
    await page.getByTestId('book-tags-input').fill('Science Fiction');
    await page.keyboard.press('Enter');
    await expect(editor).toContainText('science-fiction');

    // Remove the original tag
    await page.getByTestId('remove-tag-fantasy').click();
    await expect(editor).not.toContainText('fantasy');

    await page.getByRole('button', { name: 'Save tags' }).click();
    await expect(page.getByTestId('book-details-dialog')).not.toBeVisible();

    // Card strip reflects the saved tags
    const strip = page.getByTestId('book-card-tags-1');
    await expect(strip).toContainText('science-fiction');

    // Tags persist across reload
    await page.reload();
    await expect(page.getByTestId('book-card-tags-1')).toContainText('science-fiction');
  });

  test('input suggests already-created tags', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy'] });
    await seedReaderBook(page, {
      id: 2,
      title: 'Second Book (Playwright Test Book)',
      tags: []
    });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page
      .getByRole('button', { name: 'Book options for Second Book (Playwright Test Book)' })
      .click();
    await page.getByRole('button', { name: 'View details' }).click();

    await page.getByTestId('book-tags-input').fill('fan');
    const suggestion = page.getByTestId('tag-suggestion-fantasy');
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    await expect(page.getByTestId('book-tags-editor')).toContainText('fantasy');
  });

  test('removing a tag stamps per-title sync attribution', async ({ page }) => {
    await seedReaderBook(page, { tags: ['fantasy'] });
    await page.goto('/manage');

    const bookCard = page.locator('.aspect-w-2').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `Book options for ${SAMPLE_BOOK.title}` }).click();
    await page.getByRole('button', { name: 'View details' }).click();

    const editor = page.getByTestId('book-tags-editor');
    await expect(editor).toBeVisible();

    // Remove the tag and save: the removal must record per-title
    // attribution (lastModified BOOK_TAGS row) so it propagates as
    // last-write-wins instead of being re-added by the next union merge.
    await page.getByTestId('remove-tag-fantasy').click();
    await page.getByRole('button', { name: 'Save tags' }).click();
    await expect(page.getByTestId('book-details-dialog')).not.toBeVisible();

    const attribution = await page.evaluate(async (version) => {
      return new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('lastModified', 'readonly');
          const getAllReq = tx.objectStore('lastModified').getAll();
          getAllReq.onsuccess = () => resolve(getAllReq.result);
          getAllReq.onerror = () => reject(getAllReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, currentDbVersion);

    const row = attribution.find((r) => r.dataType === 'bookTags');
    expect(row).toBeDefined();
    expect(row.lastModifiedValue).toBeGreaterThan(0);
  });
});
