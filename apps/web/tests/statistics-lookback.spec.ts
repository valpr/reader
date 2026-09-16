/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from './fixtures/book-fixture';

test.describe('Reading Lookback E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Seed a book and enriched statistics
    await seedReaderBook(page, {
      title: '本好きの下剋上 (Ascendance of a Bookworm)',
      characters: 150000
    });

    const now = new Date();
    const currentYear = now.getFullYear();

    await seedStatistics(page, [
      {
        title: '本好きの下剋上 (Ascendance of a Bookworm)',
        dateKey: `${currentYear}-03-15`,
        charactersRead: 35000,
        readingTime: 5400, // 1.5 hr
        minReadingSpeed: 23333,
        altMinReadingSpeed: 23333,
        lastReadingSpeed: 23333,
        maxReadingSpeed: 25000,
        lastStatisticModified: Date.now(),
        lookupCount: 450, // High lookup count -> Vocab Hunter
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByHour: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2700, 2700
        ], // 10 PM & 11 PM -> Night Owl
        readingTimeByProfile: { 'default-mobile': 4000, 'default-desktop': 1400 }
      },
      {
        title: 'Finished Novel Two',
        dateKey: `${currentYear}-03-16`,
        charactersRead: 15000,
        readingTime: 2000,
        minReadingSpeed: 27000,
        altMinReadingSpeed: 27000,
        lastReadingSpeed: 27000,
        maxReadingSpeed: 27000,
        lastStatisticModified: Date.now(),
        lookupCount: 20,
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByProfile: { 'default-mobile': 2000 }
      },
      {
        title: 'Finished Novel Three',
        dateKey: `${currentYear}-03-17`,
        charactersRead: 18000,
        readingTime: 2200,
        minReadingSpeed: 29000,
        altMinReadingSpeed: 29000,
        lastReadingSpeed: 29000,
        maxReadingSpeed: 29000,
        lastStatisticModified: Date.now(),
        lookupCount: 25,
        completedBook: 1,
        maxProgress: 1.0,
        readingTimeByProfile: { 'default-desktop': 2200 }
      },
      {
        title: 'Another Book',
        dateKey: `${currentYear}-04-10`,
        charactersRead: 12000,
        readingTime: 2400,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: Date.now(),
        lookupCount: 120,
        maxProgress: 0.25, // Unfinished at 25% drop-off
        readingTimeByProfile: { 'default-mobile': 2400 }
      },
      {
        title: 'Third Novel',
        dateKey: `${currentYear}-05-01`,
        charactersRead: 16000,
        readingTime: 2400,
        minReadingSpeed: 24000,
        altMinReadingSpeed: 24000,
        lastReadingSpeed: 24000,
        maxReadingSpeed: 24000,
        lastStatisticModified: Date.now(),
        lookupCount: 60,
        maxProgress: 0.35, // Unfinished at 35% drop-off
        readingTimeByProfile: { 'default-desktop': 2400 }
      },
      {
        title: 'Fourth Novel',
        dateKey: `${currentYear}-05-02`,
        charactersRead: 10000,
        readingTime: 1800,
        minReadingSpeed: 20000,
        altMinReadingSpeed: 20000,
        lastReadingSpeed: 20000,
        maxReadingSpeed: 20000,
        lastStatisticModified: Date.now(),
        lookupCount: 40,
        maxProgress: 0.45, // Unfinished at 45% drop-off (total 3 unfinished -> cliff shown)
        readingTimeByProfile: { 'default-mobile': 1800 }
      }
    ]);
  });

  test('switches to Recap tab, displays rich lookback dashboard, and runs Story Player', async ({
    page
  }) => {
    await page.goto('/statistics');

    // Verify Recap tab exists in SegmentedControl
    const recapTab = page.getByRole('radio', { name: 'Recap' });
    await expect(recapTab).toBeVisible({ timeout: 10000 });

    // Click Recap tab
    await recapTab.click();

    // Visual-state assertion: control itself is active / selected
    await expect(recapTab).toHaveAttribute('aria-checked', 'true');

    // Title filter trigger should be hidden when on Recap tab
    await expect(page.getByLabel('Open Title Filter')).toHaveCount(0);

    // Lookback Dashboard Header
    await expect(page.getByRole('heading', { name: /Reading Lookback/ })).toBeVisible();

    // Play Story CTA button
    const playStoryBtn = page.getByRole('button', { name: /Play Story/ });
    await expect(playStoryBtn).toBeVisible();

    // Hero Persona Card: Vocab Hunter
    await expect(page.getByRole('heading', { name: 'Vocab Hunter' })).toBeVisible();
    await expect(page.getByText('No word left unmined')).toBeVisible();

    // Drop-off Cliff Card
    await expect(page.getByText('Drop-off Cliff Analysis')).toBeVisible();
    await expect(page.getByText('Where You Give Up')).toBeVisible();
    await expect(page.getByText(/most likely to stop reading/i)).toBeVisible();

    // Device Sanctuary Card
    await expect(page.getByText('Device Sanctuary')).toBeVisible();
    await expect(page.getByText('Mobile / Phone').first()).toBeVisible();

    // Chronotype Card
    await expect(page.getByText('24-Hour Reading Rhythm')).toBeVisible();

    // Most Read Books Leaderboard
    await expect(page.getByText('本好きの下剋上 (Ascendance of a Bookworm)')).toBeVisible();

    // Launch Story Player
    await playStoryBtn.click();

    const storyDialog = page.getByRole('dialog', { name: 'Reading Lookback Story' });
    await expect(storyDialog).toBeVisible();

    // Slide 1: Intro
    await expect(storyDialog.getByText(/Your \d+ in Reading/)).toBeVisible();

    // Advance to next slide via Next button
    const nextBtn = storyDialog.getByRole('button', { name: 'Next →' });
    await nextBtn.click();

    // Slide 2: Time & Volume
    await expect(storyDialog.getByText('Time & Volume')).toBeVisible();
    await expect(storyDialog.getByText(/You immersed for/)).toBeVisible();

    // Advance to Slide 3: Drop-off Cliff
    await nextBtn.click();
    await expect(storyDialog.getByText('Drop-off Cliff', { exact: true })).toBeVisible();
    await expect(storyDialog.getByText(/Where You Give Up/)).toBeVisible();

    // Advance to Slide 4: Device Sanctuary
    await nextBtn.click();
    await expect(storyDialog.getByText('Device Sanctuary')).toBeVisible();
    await expect(storyDialog.getByText('Mobile / Phone').first()).toBeVisible();

    // Test Previous button
    const prevBtn = storyDialog.getByRole('button', { name: '← Previous' });
    await prevBtn.click();
    await expect(storyDialog.getByText('Drop-off Cliff', { exact: true })).toBeVisible();

    // Close Story Player
    const closeBtn = storyDialog.getByRole('button', { name: 'Close Story' });
    await closeBtn.click();

    await expect(storyDialog).toHaveCount(0);
    // Back to dashboard
    await expect(page.getByRole('heading', { name: /Reading Lookback/ })).toBeVisible();
  });
});
