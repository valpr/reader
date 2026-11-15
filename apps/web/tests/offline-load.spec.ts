/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { seedLibraryItem, seedReaderBook } from './fixtures/book-fixture';

const OFFLINE_BOOK_TITLE = 'Offline Cat (Playwright Test Book)';

/**
 * Wait until the service worker is active and controlling this page. `ready`
 * resolves once a worker is active, but the worker only controls pages
 * loaded after activation (it uses skipWaiting, not clients.claim), so a
 * reload is needed before `controller` is set. If no worker ever registers,
 * `ready` never resolves and the test fails here, which is the bug this
 * spec guards against.
 */
async function ensureServiceWorkerControlling(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/**
 * True when the service worker has precached the app shell. The dev server
 * serves the worker with empty build/prerendered lists, so it installs and
 * activates but caches static files only, which cannot serve the initial
 * page offline: only a production build precaches the built app assets.
 * Offline loading can therefore only be verified against a production
 * build (e.g. `vite preview`).
 */
async function hasPrecachedShell(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((request) => request.url.includes('/_app/immutable/'))) {
        return true;
      }
    }
    return false;
  });
}

function skipUnlessPrecached(page: Page) {
  return hasPrecachedShell(page).then((precached) => {
    test.skip(
      !precached,
      'service worker precache is empty (dev server); run against a production build to verify offline load'
    );
  });
}

test.describe('Offline initial page load', () => {
  test('library loads offline from a local book after an online visit', async ({
    page,
    context
  }: {
    page: Page;
    context: BrowserContext;
  }) => {
    // Seed a local book, then load the app online so the service worker
    // installs and precaches the shell.
    await seedLibraryItem(page, { id: 1, title: OFFLINE_BOOK_TITLE });
    await page.goto('/manage');
    await ensureServiceWorkerControlling(page);
    await skipUnlessPrecached(page);

    // Cut the network and reload: this is the offline first load.
    await context.setOffline(true);
    await page.reload();

    await expect(page).toHaveTitle(/Valpr Reader/);
    await expect(page.getByText(OFFLINE_BOOK_TITLE)).toBeVisible();
  });

  test('landing page loads offline and resumes the last local book', async ({
    page,
    context
  }: {
    page: Page;
    context: BrowserContext;
  }) => {
    // Seeding also records the book as the last opened item, so `/`
    // redirects to its reader page.
    await seedReaderBook(page, { id: 1, title: OFFLINE_BOOK_TITLE });
    await page.goto('/');
    await ensureServiceWorkerControlling(page);
    await skipUnlessPrecached(page);

    await context.setOffline(true);
    await page.reload();

    await expect(page).toHaveTitle(/Valpr Reader/);
    await expect(page).toHaveURL(/\/b\?id=1/);
    await expect(page.getByText('吾輩は猫である').first()).toBeVisible();
  });
});
