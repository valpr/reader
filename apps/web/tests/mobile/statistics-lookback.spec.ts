/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from '../fixtures/book-fixture';
import { expectDialogFitsViewport, expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

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

    // Most Read Books carousel scrolls internally without page overflow
    const carousel = page.getByRole('region', { name: 'Most read books' });
    await expect(carousel).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Carousel controls are fully in viewport and cycle slides
    const viewport = page.viewportSize();
    expect(viewport, 'no viewport size').not.toBeNull();
    const nextSlide = page.getByRole('button', { name: 'Next slide' });
    await expect(nextSlide).toBeVisible();
    const nextBox = await nextSlide.boundingBox();
    expect(nextBox, 'Next slide has no bounding box').not.toBeNull();
    expect(nextBox!.x + nextBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
    await nextSlide.tap();
    await expect(page.getByRole('button', { name: 'Go to slide 2' })).toHaveAttribute(
      'aria-current',
      'true'
    );

    // Tapping a slide opens the reading-details dialog inside the viewport
    const longTitle =
      '本好きの下剋上〜司書になるためには手段を選んでいられません〜 (Very Long Unbroken Title)';
    await carousel.getByRole('button', { name: `${longTitle}: view reading details` }).tap();
    await expect(page.getByRole('heading', { name: longTitle })).toBeVisible();
    const details = page.getByTestId('lookback-book-details');
    await expect(details).toBeVisible();
    await expectDialogFitsViewport(details);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(page.getByRole('heading', { name: longTitle })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

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

for (const width of [412, 360]) {
  test(`statistics lookback export image downloads at ${width}px without overflow`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 915 });

    await seedReaderBook(page, {
      title: 'Export Seed Book One',
      characters: 90000
    });

    const now = new Date();
    const currentYear = now.getFullYear();

    await seedStatistics(page, [
      {
        title: 'Export Seed Book One',
        dateKey: `${currentYear}-02-10`,
        charactersRead: 30000,
        readingTime: 5400,
        minReadingSpeed: 20000,
        altMinReadingSpeed: 20000,
        lastReadingSpeed: 20000,
        maxReadingSpeed: 22000,
        lastStatisticModified: Date.now(),
        lookupCount: 200,
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByProfile: { 'default-mobile': 5400 }
      },
      {
        title: 'Export Seed Book Two',
        dateKey: `${currentYear}-02-11`,
        charactersRead: 20000,
        readingTime: 3600,
        minReadingSpeed: 20000,
        altMinReadingSpeed: 20000,
        lastReadingSpeed: 20000,
        maxReadingSpeed: 20000,
        lastStatisticModified: Date.now(),
        lookupCount: 60,
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByProfile: { 'default-mobile': 3600 }
      },
      {
        title: 'Export Seed Book Three',
        dateKey: `${currentYear}-02-12`,
        charactersRead: 25000,
        readingTime: 3600,
        minReadingSpeed: 25000,
        altMinReadingSpeed: 25000,
        lastReadingSpeed: 25000,
        maxReadingSpeed: 25000,
        lastStatisticModified: Date.now(),
        lookupCount: 80,
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByProfile: { 'default-mobile': 3600 }
      }
    ]);

    await page.goto('/statistics');

    const recapTab = page.getByRole('radio', { name: 'Recap' });
    await expect(recapTab).toBeVisible({ timeout: 10000 });
    await recapTab.tap();
    await expect(recapTab).toHaveAttribute('aria-checked', 'true');
    await expectNoHorizontalOverflow(page);

    // Visual-state assertion: export is enabled once recap data is sufficient.
    const exportBtn = page.getByRole('button', { name: /Export Image/ });
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();
    const exportBox = await exportBtn.boundingBox();
    expect(exportBox, 'Export Image has no bounding box').not.toBeNull();
    expect(exportBox!.x + exportBox!.width).toBeLessThanOrEqual(width + 1);

    const [download] = await Promise.all([page.waitForEvent('download'), exportBtn.tap()]);
    expect(download.suggestedFilename()).toMatch(/reading-recap-.*\.png/);
    await expectNoHorizontalOverflow(page);
  });
}
