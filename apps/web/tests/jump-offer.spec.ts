/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { SAMPLE_BOOK, seedReaderBook } from './fixtures/book-fixture';

test.describe('Mid-read jump offer', () => {
  test('findJumpCandidate surfaces only material leads, furthest wins', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const priorityPath = '/src/lib/functions/replication/sync-priority.ts';
      const mod = await import(/* @vite-ignore */ priorityPath);
      const bookChars = 10000; // threshold: max(1000, 200) = 1000
      return {
        // Lead of exactly the threshold stays silent (strictly-more rule).
        atThreshold: mod.findJumpCandidate(0, bookChars, [
          { exploredCharCount: 1000, source: 'cloud' }
        ]),
        justOver: mod.findJumpCandidate(0, bookChars, [
          { exploredCharCount: 1001, source: 'cloud' }
        ])?.exploredCharCount,
        furthestWins: mod.findJumpCandidate(0, bookChars, [
          { exploredCharCount: 2000, source: 'bookmark', label: 'b' },
          { exploredCharCount: 5000, source: 'cloud' }
        ])?.exploredCharCount,
        behindSilent: mod.findJumpCandidate(6000, bookChars, [
          { exploredCharCount: 5000, source: 'cloud' }
        ]),
        equalSilent: mod.findJumpCandidate(5000, bookChars, [
          { exploredCharCount: 5000, source: 'cloud' }
        ]),
        emptySilent: mod.findJumpCandidate(0, bookChars, []),
        threshold: mod.jumpOfferThreshold(bookChars),
        shortBookThreshold: mod.jumpOfferThreshold(1200)
      };
    });

    expect(result.atThreshold).toBeNull();
    expect(result.justOver).toBe(1001);
    expect(result.furthestWins).toBe(5000);
    expect(result.behindSilent).toBeNull();
    expect(result.equalSilent).toBeNull();
    expect(result.emptySilent).toBeNull();
    expect(result.threshold).toBe(1000);
    expect(result.shortBookThreshold).toBe(1000);
  });

  test('progressSeen$ reports download sightings to subscribers', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const progressPath = '/src/lib/functions/replication/replication-progress.ts';
      const mod = await import(/* @vite-ignore */ progressPath);
      const seen: unknown[] = [];
      const sub = mod.progressSeen$.subscribe((s: unknown) => seen.push(s));
      mod.progressSeen$.next({ title: 't', exploredCharCount: 42 });
      sub.unsubscribe();
      mod.progressSeen$.next({ title: 't', exploredCharCount: 43 });
      return seen;
    });

    expect(result).toEqual([{ title: 't', exploredCharCount: 42 }]);
  });

  test('synced position ahead offers Jump; accepting persists it', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    // Seeded at position 0 in a 1200-char book (threshold 1000): 1100 qualifies.
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
    await expect(offer).toContainText('Further ahead');

    await page.getByTestId('jump-offer-accept').click();
    await expect(offer).toBeHidden({ timeout: 10000 });

    const stored = await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { database } = await import(/* @vite-ignore */ storePath);
      return database.getBookmark(1);
    });
    expect(stored?.exploredCharCount).toBe(1100);
  });

  test('position behind the threshold stays silent; dismissal never re-fires', async ({ page }) => {
    await seedReaderBook(page);
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    await page.evaluate(
      async ({ title }) => {
        const progressPath = '/src/lib/functions/replication/replication-progress.ts';
        const mod = await import(/* @vite-ignore */ progressPath);
        mod.progressSeen$.next({ title, exploredCharCount: 500 });
      },
      { title: SAMPLE_BOOK.title }
    );

    await expect(page.getByTestId('jump-offer')).toBeHidden({ timeout: 5000 });

    // A qualifying sighting offers once; dismissing it silences re-sightings.
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
    await page.getByTestId('jump-offer-dismiss').click();
    await expect(offer).toBeHidden({ timeout: 10000 });

    await page.evaluate(
      async ({ title }) => {
        const progressPath = '/src/lib/functions/replication/replication-progress.ts';
        const mod = await import(/* @vite-ignore */ progressPath);
        mod.progressSeen$.next({ title, exploredCharCount: 1100 });
      },
      { title: SAMPLE_BOOK.title }
    );
    await expect(page.getByTestId('jump-offer')).toBeHidden({ timeout: 5000 });
  });
});
