/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK, seedReaderBook } from '../fixtures/book-fixture';
import { expectFullyInViewport, expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

test.describe('Mobile: mid-read jump offer', () => {
  test('offer banner fits the viewport and Jump is tappable', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    await page.evaluate(
      async ({ title }) => {
        const progressPath = '/src/lib/functions/replication/replication-progress.ts';
        const mod = await import(/* @vite-ignore */ progressPath);
        mod.progressSeen$.next({ title, exploredCharCount: 1100 });
      },
      { title: SAMPLE_BOOK.title }
    );

    const offer = page.getByTestId('jump-offer');
    await expect(offer).toBeVisible({ timeout: 10000 });
    await expectNoHorizontalOverflow(page);
    await expectFullyInViewport(page, offer, 'Jump offer banner');
    await expectFullyInViewport(page, page.getByTestId('jump-offer-accept'), 'Jump button');
    await expectFullyInViewport(page, page.getByTestId('jump-offer-dismiss'), 'Dismiss button');

    await page.getByTestId('jump-offer-accept').tap();
    await expect(offer).toBeHidden({ timeout: 10000 });
    await expectNoHorizontalOverflow(page);
  });
});
