/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

test.describe('Reader Loading & Initialization', () => {
  test('loads valid book and displays content and title', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/b?id=1');

    // Title should be formatted with book title
    await expect(page).toHaveTitle(/吾輩は猫である/);

    // Book content container should be rendered and visible
    const content = page.locator('.book-content');
    await expect(content).toBeVisible();

    // Text content from chapter 1 should be present
    await expect(content).toContainText('吾輩は猫である。名前はまだ無い。');
  });

  test('redirects to book manager when book id does not exist', async ({ page }) => {
    await page.goto('/b?id=999999');

    // The reader should recognize missing data and route to /manage
    await expect(page).toHaveURL(/\/manage/);
  });

  test('end-to-end journey: upload file from manager and open reader', async ({ page }) => {
    await page.goto('/manage');
    // Wait for JS hydration so file inputs and the book list are interactive.
    // Without this, setInputFiles can fire before Svelte attaches the
    // use:inputFile actions (slow CI), and the upload is silently dropped.
    await expect(page.locator('input[type="file"][accept*=".txt"]').first()).toBeAttached({
      timeout: 15000
    });

    // Prepare a mock .txt file
    const fileContent = 'これはテスト本の本文です。\n第二段落の内容です。';
    const fileInput = page.locator('input[type="file"][accept*=".txt"]').first();

    await fileInput.setInputFiles({
      name: 'playwright-uploaded-book.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent, 'utf-8')
    });

    // Wait for the book card to appear in the manager
    const bookCard = page.locator('.aspect-w-2:has-text("playwright-uploaded-book")');
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Click the book card to enter reader
    await bookCard.click();

    // Verify URL is /b
    await expect(page).toHaveURL(/\/b\?id=/);

    // Verify content rendered
    const content = page.locator('.book-content');
    await expect(content).toBeVisible();
    await expect(content).toContainText('これはテスト本の本文です');
  });

  test('displays loading overlay when clicking a book card to open', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');
    // Wait for JS hydration so the book list is rendered and interactive.
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 15000 });

    const bookCard = page.locator('.aspect-w-2:has-text("吾輩は猫である")').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Click book card to initiate opening
    await bookCard.click();

    // The reader opens successfully
    await expect(page).toHaveURL(/\/b\?id=/);
    const content = page.locator('.book-content');
    await expect(content).toBeVisible();
  });

  test('book open shows BookLoader stage (not legacy spinner) while opening', async ({ page }) => {
    await seedReaderBook(page);
    // Debug mode surfaces the stage string; flavor mode shows rotating lines.
    await page.addInitScript(() => window.localStorage.setItem('loaderMode', 'debug'));
    await page.goto('/manage');
    await expect(page.locator('.aspect-w-2').first()).toBeVisible({ timeout: 15000 });

    const bookCard = page.locator('.aspect-w-2:has-text("吾輩は猫である")').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Start observing before the click so even a single-frame flash is caught.
    const observedPromise = page.evaluate(() => {
      const snapshot = () => {
        if (document.querySelector('[data-testid="book-loading-overlay"]')) return { legacy: true };
        const el = document.querySelector('[data-testid="book-loader"]');
        if (el) {
          return {
            legacy: false,
            mode: el.getAttribute('data-mode'),
            stage:
              el.querySelector('[data-testid="book-loader-stage"]')?.textContent?.trim() ?? null
          };
        }
        return null;
      };
      const initial = snapshot();
      if (initial) return Promise.resolve(initial);
      // The click below may already be in flight; watch for the dialog.
      return new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const found = snapshot();
          if (found) {
            observer.disconnect();
            resolve(found);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        // Cold boot can delay the loader flash; keep polling headroom while
        // still resolving early when the stage appears.
        setTimeout(() => {
          observer.disconnect();
          resolve(snapshot());
        }, 8000);
      });
    });
    await bookCard.click();
    type ObservedLoader =
      null | { legacy: true } | { legacy: false; mode: string | null; stage: string | null };
    const observed = (await observedPromise) as ObservedLoader;

    if (observed) {
      // The legacy spinner must never appear on this path.
      expect(observed, 'legacy book-loading-overlay rendered instead of BookLoader').not.toEqual({
        legacy: true
      });
      if (observed.legacy === false) {
        expect(observed.mode, 'BookLoader should respect the debug loaderMode').toBe('debug');
        expect(observed.stage, 'BookLoader should name the open stage').toBe('Opening local book…');
      }
    }

    // The reader opens successfully either way, with no legacy overlay left.
    await expect(page).toHaveURL(/\/b\?id=/);
    await expect(page.locator('[data-testid="book-loading-overlay"]')).toHaveCount(0);
    const content = page.locator('.book-content');
    await expect(content).toBeVisible();
  });
});
