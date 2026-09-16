/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from '../fixtures/book-fixture';
import { expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

for (const width of [412, 360]) {
  test(`statistics lookback fits and functions at ${width}px without overflow`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 915 });

    await seedReaderBook(page, {
      title:
        '本好きの下剋上〜司書になるためには手段を選んでいられません〜 (Very Long Unbroken Title)',
      characters: 180000
    });

    const now = new Date();
    const currentYear = now.getFullYear();

    await seedStatistics(page, [
      {
        title:
          '本好きの下剋上〜司書になるためには手段を選んでいられません〜 (Very Long Unbroken Title)',
        dateKey: `${currentYear}-02-10`,
        charactersRead: 40000,
        readingTime: 7200,
        minReadingSpeed: 20000,
        altMinReadingSpeed: 20000,
        lastReadingSpeed: 20000,
        maxReadingSpeed: 22000,
        lastStatisticModified: Date.now(),
        lookupCount: 300,
        maxProgress: 0.95,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3600, 3600
        ],
        readingTimeByProfile: { 'default-mobile': 7200 }
      }
    ]);

    await page.goto('/statistics');

    // Check header at start
    await expectNoHorizontalOverflow(page);

    const recapTab = page.getByRole('radio', { name: 'Recap' });
    await expect(recapTab).toBeVisible({ timeout: 10000 });

    // Tap Recap tab
    await recapTab.tap();

    // Verify control state
    await expect(recapTab).toHaveAttribute('aria-checked', 'true');

    // Assert no horizontal overflow on the lookback dashboard
    await expectNoHorizontalOverflow(page);

    // Verify key elements are visible and bounded
    await expect(page.getByRole('heading', { name: 'Vocab Hunter' })).toBeVisible();
    await expect(page.getByText('Drop-off Cliff Analysis')).toBeVisible();
    await expect(page.getByText('Device Sanctuary')).toBeVisible();

    // Tap Play Story
    const playBtn = page.getByRole('button', { name: /Play Story/ });
    await expect(playBtn).toBeVisible();
    await playBtn.tap();

    // Story dialog must open
    const storyDialog = page.getByRole('dialog', { name: 'Reading Lookback Story' });
    await expect(storyDialog).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Tap next slide
    const nextBtn = storyDialog.getByRole('button', { name: 'Next →' });
    await nextBtn.tap();
    await expect(storyDialog.getByText('Time & Volume')).toBeVisible();

    // Tap close button
    const closeBtn = storyDialog.getByRole('button', { name: 'Close Story' });
    await closeBtn.tap();
    await expect(storyDialog).toHaveCount(0);

    // Assert no overflow after closing
    await expectNoHorizontalOverflow(page);
  });
}
