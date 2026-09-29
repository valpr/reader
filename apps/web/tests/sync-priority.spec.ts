/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test, type Page } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

test.describe('Sync priority (read-ready)', () => {
  test('currently-reading books rank first, finished/unread/stale defer', async ({ page }) => {
    // The landing route auto-navigates to the library; load it directly so
    // the execution context stays stable for page.evaluate.
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const priorityPath = '/src/lib/functions/replication/sync-priority.ts';
      const mod = await import(/* @vite-ignore */ priorityPath);
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const contexts = [
        { title: 'finished', progress: 1, lastBookOpen: now - 1 * day },
        { title: 'unread', progress: 0, lastBookOpen: now - 1 * day },
        { title: 'stale', progress: 0.5, lastBookOpen: now - 40 * day },
        { title: 'older', progress: 0.3, lastBookOpen: now - 5 * day },
        { title: 'newest', progress: 0.7, lastBookOpen: now - 1 * day },
        // Legacy percent progress rescales into the in-progress window.
        { title: 'legacy', progress: 50, lastBookOpen: now - 2 * day }
      ];
      const { priority, deferred } = mod.splitSyncContexts(contexts, now);
      return {
        priority: priority.map((c: { title: string }) => c.title),
        deferred: deferred.map((c: { title: string }) => c.title)
      };
    });

    expect(result.priority).toEqual(['newest', 'legacy', 'older']);
    expect(result.deferred).toEqual(['finished', 'unread', 'stale']);
  });

  test('read-ready store tracks phase-1 download progress', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      const log: string[] = [];
      mod.beginPriorityPhase(['a', 'b']);
      log.push(JSON.stringify(mod.readReady$.getValue()));
      // Unknown titles never advance the count.
      mod.markPriorityBookComplete('zzz');
      log.push(JSON.stringify(mod.readReady$.getValue()));
      mod.markPriorityBookComplete('a');
      log.push(JSON.stringify(mod.readReady$.getValue()));
      mod.markPriorityBookComplete('b');
      mod.markPriorityReady();
      log.push(JSON.stringify(mod.readReady$.getValue()));
      mod.resetReadReady();
      log.push(JSON.stringify(mod.readReady$.getValue()));
      return log;
    });

    const [started, ignored, partial, ready, reset] = result.map((s) => JSON.parse(s));
    expect(started.phase).toBe('priority-syncing');
    expect(started.total).toBe(2);
    expect(ignored.completed).toBe(0);
    expect(partial.readyTitles).toEqual(['a']);
    expect(partial.pendingTitles).toEqual(['b']);
    expect(ready.phase).toBe('ready');
    expect(ready.readyTitles).toEqual(['a', 'b']);
    expect(reset.phase).toBe('idle');
  });

  test('isTitleReadReady and waitForPriorityBookReady coordinate title completion', async ({
    page
  }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);

      const idleReady = mod.isTitleReadReady('book-a');
      mod.beginPriorityPhase(['book-a', 'book-b']);

      const syncingReady = mod.isTitleReadReady('book-a');
      const waitPromise = mod.waitForPriorityBookReady('book-a', 2000);

      mod.markPriorityBookComplete('book-a');
      const resolvedWait = await waitPromise;
      const completedReady = mod.isTitleReadReady('book-a');
      const pendingWait = await mod.waitForPriorityBookReady('not-in-sync', 100);

      mod.resetReadReady();
      return { idleReady, syncingReady, resolvedWait, completedReady, pendingWait };
    });

    expect(result.idleReady).toBe(false);
    expect(result.syncingReady).toBe(false);
    expect(result.resolvedWait).toBe(true);
    expect(result.completedReady).toBe(true);
    expect(result.pendingWait).toBe(false);
  });
});

test.describe('Read-ready indicators', () => {
  const BOOK_ONE = 'Read Ready Alpha';
  const BOOK_TWO = 'Read Ready Beta';

  async function seedLibrary(page: Page) {
    await seedReaderBook(page, { id: 1, title: BOOK_ONE });
    await seedReaderBook(page, { id: 2, title: BOOK_TWO });
  }

  test('badges assert their own syncing/synced state per book', async ({ page }) => {
    await seedLibrary(page);
    await page.goto('/manage');
    await expect(page.getByText(BOOK_ONE)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(BOOK_TWO)).toBeVisible();

    await page.evaluate(async (title) => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      mod.beginPriorityPhase([title]);
    }, BOOK_ONE);

    // Only the priority title carries a badge, in its syncing state.
    const badge = page.getByTestId('read-ready-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveAttribute('aria-label', `Syncing reading state for ${BOOK_ONE}`);

    await page.evaluate(async (title) => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      mod.markPriorityBookComplete(title);
      mod.markPriorityReady();
    }, BOOK_ONE);

    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveAttribute('aria-label', `Reading state synced for ${BOOK_ONE}`);
  });

  test('header reports reading-state progress, then synced', async ({ page }) => {
    await seedLibrary(page);
    await page.goto('/manage');
    await expect(page.getByText(BOOK_ONE)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('sync-activity-icon')).toBeHidden();

    await page.evaluate(async (title) => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      mod.beginSyncActivity('Downloading Progress, Bookmarks');
      mod.beginPriorityPhase([title]);
    }, BOOK_ONE);

    const icon = page.getByTestId('sync-activity-icon');
    await expect(icon).toBeVisible();
    await icon.hover();
    await expect(page.getByTestId('read-ready-status')).toContainText('Reading state 0 of 1');

    await page.evaluate(async (title) => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      mod.markPriorityBookComplete(title);
      mod.markPriorityReady();
    }, BOOK_ONE);

    await expect(page.getByTestId('read-ready-status')).toContainText('Reading state synced');

    await page.evaluate(async () => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      mod.endSyncActivity(mod.syncActivity$.getValue().runId);
      mod.resetReadReady();
    });
    await expect(icon).toBeHidden();
  });

  test('opening a read-ready book skips cloud-sync loader stage and opens immediately', async ({
    page
  }) => {
    await seedLibrary(page);
    await page.goto('/manage');
    await expect(page.getByText(BOOK_ONE)).toBeVisible({ timeout: 10000 });

    // Mark BOOK_ONE as read-ready
    await page.evaluate(async (title) => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      mod.beginPriorityPhase([title]);
      mod.markPriorityBookComplete(title);
      mod.markPriorityReady();
    }, BOOK_ONE);

    // Verify badge shows synced
    const badge = page.getByTestId('read-ready-badge');
    await expect(badge).toHaveAttribute('aria-label', `Reading state synced for ${BOOK_ONE}`);

    // Click the read-ready book card to open the reader
    await page.getByText(BOOK_ONE).click();

    // Verify reader mounts without ever entering "Syncing cloud library…" stage
    await expect(page).toHaveURL(/\/b\?id=1/);
    const stage = page.getByTestId('book-loader-stage');
    if (await stage.isVisible()) {
      await expect(stage).not.toHaveText('Syncing cloud library…');
      await expect(stage).not.toHaveText('Saving reading position…');
    }
    // Reader content loads successfully
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });
  });
});
