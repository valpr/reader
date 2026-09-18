/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test, type Page } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';
import { currentDbVersion } from '../src/lib/data/database/books-db/versions/books-db';
import {
  matchesProgressFilter,
  parseBookmarkProgress,
  resolveCardProgress
} from '../src/lib/data/library-filters';

const BOOK_ONE = 'Filter Alpha (Playwright Test Book)';
const BOOK_TWO = 'Filter Beta (Playwright Test Book)';

async function seedLibrary(page: Page) {
  await seedReaderBook(page, { id: 1, title: BOOK_ONE, tags: ['fantasy', 'epic'] });
  await seedReaderBook(page, { id: 2, title: BOOK_TWO, tags: ['fantasy'] });
}

/** Overwrite bookmark progress directly in IndexedDB (read fresh on next load). */
async function setBookmarkProgress(
  page: Page,
  entries: { dataId: number; progress: number | string }[]
) {
  // Derived counts are computed in Node scope: page.evaluate callbacks run
  // in the browser and can't see Node-side imports.
  const rows = entries.map((item) => {
    const numericProgress =
      typeof item.progress === 'number' ? item.progress : parseBookmarkProgress(item.progress);
    return {
      dataId: item.dataId,
      exploredCharCount: Math.round(numericProgress * 1000),
      progress: item.progress,
      lastBookmarkModified: Date.now()
    };
  });
  await page.evaluate(
    async ({ items, version }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('books', version);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['bookmark'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore('bookmark');
        for (const item of items) {
          store.put(item);
        }
      });
      db.close();
    },
    { items: rows, version: currentDbVersion }
  );
}

async function openSearchFilters(page: Page) {
  await page.getByTestId('library-search-filter-button').click();
  await expect(page.getByTestId('library-search-input')).toBeVisible();
}

test.describe('Library search and filters', () => {
  test('title search narrows the grid and clears', async ({ page }) => {
    await seedLibrary(page);
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeVisible();

    await openSearchFilters(page);
    await page.getByTestId('library-search-input').fill('beta');
    await expect(page.getByText(BOOK_TWO)).toBeVisible();
    await expect(page.getByText(BOOK_ONE)).toBeHidden();
    await expect(page.getByTestId('library-active-filter-count')).toHaveText('1');

    await page.getByTestId('library-clear-filters').click();
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeVisible();
  });

  test('tag filter uses AND semantics', async ({ page }) => {
    await seedLibrary(page);
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });

    await openSearchFilters(page);
    const fantasyTag = page.getByTestId('library-filter-tag-fantasy');
    const epicTag = page.getByTestId('library-filter-tag-epic');
    await expect(fantasyTag).toHaveAttribute('aria-checked', 'false');

    await fantasyTag.click();
    // Visual selection state must update immediately (regression: checkbox
    // stayed visually unchecked even though filtering applied).
    await expect(fantasyTag).toHaveAttribute('aria-checked', 'true');
    await expect(fantasyTag.locator('span').first()).toHaveClass(/text-white/);
    // The popover must stay open so users can select multiple tags.
    await expect(page.getByTestId('library-search-input')).toBeVisible();
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeVisible();

    // Both selected => only the book carrying both tags remains.
    await epicTag.click();
    await expect(epicTag).toHaveAttribute('aria-checked', 'true');
    await expect(fantasyTag).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeHidden();
    await expect(page.getByTestId('library-active-filter-count')).toHaveText('2');

    // Toggling a tag off clears its visual state too.
    await fantasyTag.click();
    await expect(fantasyTag).toHaveAttribute('aria-checked', 'false');
    await expect(fantasyTag.locator('span').first()).toHaveClass(/text-transparent/);
    await expect(epicTag).toHaveAttribute('aria-checked', 'true');

    await page.getByTestId('library-clear-filters').click();
    await expect(fantasyTag).toHaveAttribute('aria-checked', 'false');
    await expect(epicTag).toHaveAttribute('aria-checked', 'false');
  });

  test('progress filter separates unread, in-progress and completed', async ({ page }) => {
    await seedLibrary(page);
    await setBookmarkProgress(page, [
      { dataId: 1, progress: 0.5 },
      { dataId: 2, progress: 1 }
    ]);
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });

    await openSearchFilters(page);

    await page.getByRole('radio', { name: 'In Progress' }).click();
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeHidden();

    await page.getByRole('radio', { name: 'Completed' }).click();
    await expect(page.getByText(BOOK_TWO)).toBeVisible();
    await expect(page.getByText(BOOK_ONE)).toBeHidden();

    await page.getByRole('radio', { name: 'Unread' }).click();
    await expect(page.getByTestId('library-no-results')).toBeVisible();
    await expect(page.getByText(BOOK_ONE)).toBeHidden();
    await expect(page.getByText(BOOK_TWO)).toBeHidden();
  });

  test('legacy string bookmark progress still counts as in-progress', async ({ page }) => {
    await seedLibrary(page);
    await setBookmarkProgress(page, [
      { dataId: 1, progress: '50%' },
      { dataId: 2, progress: 1 }
    ]);
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });

    await openSearchFilters(page);

    await page.getByRole('radio', { name: 'In Progress' }).click();
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeHidden();
  });

  test('progress helpers keep cloud-merged progress and parse legacy values', async () => {
    // Pure unit coverage (no page needed): the bookmark overlay must take the
    // max so a missing/stale local bookmark can't demote a started book.
    expect(resolveCardProgress(0.5, 0)).toBe(0.5);
    expect(resolveCardProgress(0, 0.5)).toBe(0.5);
    expect(resolveCardProgress(0.2, 0.7)).toBe(0.7);
    expect(resolveCardProgress(undefined, undefined)).toBe(0);

    expect(parseBookmarkProgress(0.5)).toBe(0.5);
    expect(parseBookmarkProgress('50%')).toBe(0.5);
    expect(parseBookmarkProgress('0.5')).toBe(0.5);
    expect(parseBookmarkProgress(undefined)).toBe(0);
    expect(parseBookmarkProgress('nonsense')).toBe(0);

    // Boundary classification used by the In Progress segment.
    expect(matchesProgressFilter(0.5, 'in-progress')).toBe(true);
    expect(matchesProgressFilter(0, 'in-progress')).toBe(false);
    expect(matchesProgressFilter(1, 'in-progress')).toBe(false);
    expect(matchesProgressFilter('50%' as unknown as number, 'in-progress')).toBe(false);
  });

  test('empty result offers a clear action and filters persist across reload', async ({ page }) => {
    await seedLibrary(page);
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 10000 });

    await openSearchFilters(page);
    await page.getByTestId('library-search-input').fill('no-such-book-here');
    await expect(page.getByTestId('library-no-results')).toBeVisible();

    await page.getByTestId('library-clear-filters-empty').click();
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeVisible();

    // Filters survive reload via localStorage.
    await openSearchFilters(page);
    await page.getByTestId('library-filter-tag-epic').click();
    await expect(page.getByText(BOOK_TWO)).toBeHidden();
    await page.reload();
    await expect(page.getByText(BOOK_ONE)).toBeVisible();
    await expect(page.getByText(BOOK_TWO)).toBeHidden();
  });
});
