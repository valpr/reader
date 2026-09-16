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
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3600, 3600
        ],
        readingTimeByProfile: { 'default-mobile': 7200 }
      },
      {
        title: 'Finished Mobile Book Two',
        dateKey: `${currentYear}-02-11`,
        charactersRead: 15000,
        readingTime: 3600,
        minReadingSpeed: 15000,
        altMinReadingSpeed: 15000,
        lastReadingSpeed: 15000,
        maxReadingSpeed: 15000,
        lastStatisticModified: Date.now(),
        lookupCount: 50,
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1800, 1800
        ],
        readingTimeByProfile: { 'default-mobile': 3600 }
      },
      {
        title: 'Finished Mobile Book Three',
        dateKey: `${currentYear}-02-12`,
        charactersRead: 18000,
        readingTime: 3600,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: Date.now(),
        lookupCount: 60,
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1800, 1800
        ],
        readingTimeByProfile: { 'default-mobile': 3600 }
      },
      {
        title: 'Second Book with Medium Length Title',
        dateKey: `${currentYear}-02-13`,
        charactersRead: 12000,
        readingTime: 2400,
        minReadingSpeed: 15000,
        altMinReadingSpeed: 15000,
        lastReadingSpeed: 15000,
        maxReadingSpeed: 15000,
        lastStatisticModified: Date.now(),
        lookupCount: 40,
        maxProgress: 0.3,
        readingTimeByProfile: { 'default-mobile': 2400 }
      },
      {
        title: 'Third Book Abandoned Early',
        dateKey: `${currentYear}-02-14`,
        charactersRead: 8000,
        readingTime: 1800,
        minReadingSpeed: 16000,
        altMinReadingSpeed: 16000,
        lastReadingSpeed: 16000,
        maxReadingSpeed: 16000,
        lastStatisticModified: Date.now(),
        lookupCount: 20,
        maxProgress: 0.15,
        readingTimeByProfile: { 'default-mobile': 1800 }
      },
      {
        title: 'Fourth Unfinished Book',
        dateKey: `${currentYear}-02-15`,
        charactersRead: 9000,
        readingTime: 1800,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: Date.now(),
        lookupCount: 30,
        maxProgress: 0.4,
        readingTimeByProfile: { 'default-mobile': 1800 }
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
    await expect(page.getByText('Drop-off Cliff Analysis', { exact: true })).toBeVisible();
    await expect(page.getByText('Device Sanctuary', { exact: true })).toBeVisible();

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
