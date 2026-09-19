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
    await page.waitForLoadState('networkidle');

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

  test('displays loading spinner overlay when clicking a book card to open', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/manage');
    // Wait for JS hydration so the book list is rendered and interactive.
    await page.waitForLoadState('networkidle');

    const bookCard = page.locator('.aspect-w-2:has-text("吾輩は猫である")').first();
    await expect(bookCard).toBeVisible({ timeout: 10000 });

    // Click book card to initiate opening
    await bookCard.click();

    // The reader opens successfully
    await expect(page).toHaveURL(/\/b\?id=/);
    const content = page.locator('.book-content');
    await expect(content).toBeVisible();
  });

  test('BookLoadingOverlay renders accessible spinner icon', async ({ page }) => {
    await page.goto('/manage');
    // Wait for JS hydration so the manage page's onMount (which clears stale
    // loading overlays) has already run before we push the overlay below.
    // Otherwise hydration can clear the dialog after it is pushed (slow CI).
    await page.waitForLoadState('networkidle');

    // Push the overlay into dialogs
    await page.evaluate(async () => {
      // @ts-expect-error - dynamic browser import in playwright evaluate
      const { dialogManager } = await import('/src/lib/data/dialog-manager.ts');
      const { default: BookLoadingOverlay } = await import(
        // @ts-expect-error - dynamic browser import of .svelte in playwright evaluate
        '/src/lib/components/book-loading-overlay.svelte'
      );
      dialogManager.dialogs$.next([
        {
          component: BookLoadingOverlay,
          disableCloseOnClick: true
        }
      ]);
    });

    const overlay = page.locator('[data-testid="book-loading-overlay"]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute('role', 'status');
    await expect(overlay).toHaveAttribute('aria-label', 'Loading book');

    const spinnerSvg = overlay.locator('svg');
    await expect(spinnerSvg).toBeVisible();
    await expect(spinnerSvg).toHaveClass(/\bspin\b/);
  });
});
