/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from './fixtures/book-fixture';

test.describe('Reading speed trend in Recap', () => {
  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, { title: 'Speed Trend Book Alpha', characters: 90000 });

    const currentYear = new Date().getFullYear();

    await seedStatistics(page, [
      {
        title: 'Speed Trend Book Alpha',
        dateKey: `${currentYear}-01-10`,
        charactersRead: 12000,
        readingTime: 3600,
        minReadingSpeed: 12000,
        altMinReadingSpeed: 12000,
        lastReadingSpeed: 12000,
        maxReadingSpeed: 12000,
        lastStatisticModified: Date.now()
      },
      {
        title: 'Speed Trend Book Alpha',
        dateKey: `${currentYear}-02-10`,
        charactersRead: 12000,
        readingTime: 3600,
        minReadingSpeed: 12000,
        altMinReadingSpeed: 12000,
        lastReadingSpeed: 12000,
        maxReadingSpeed: 12000,
        lastStatisticModified: Date.now()
      },
      {
        title: 'Speed Trend Book Beta',
        dateKey: `${currentYear}-02-11`,
        charactersRead: 24000,
        readingTime: 3600,
        minReadingSpeed: 24000,
        altMinReadingSpeed: 24000,
        lastReadingSpeed: 24000,
        maxReadingSpeed: 24000,
        lastStatisticModified: Date.now()
      },
      {
        title: 'Speed Trend Book Beta',
        dateKey: `${currentYear}-03-05`,
        charactersRead: 18000,
        readingTime: 1800,
        minReadingSpeed: 36000,
        altMinReadingSpeed: 36000,
        lastReadingSpeed: 36000,
        maxReadingSpeed: 36000,
        lastStatisticModified: Date.now()
      }
    ]);
  });

  test('shows trendline with average line, breakdown list, and drill-down', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    // Totals: 66000 chars / 12600 s -> round(66000/12600*3600) = 18857/hr
    const expectedAverage = Math.round((66000 / 12600) * 3600);

    await page.goto('/statistics');

    const recapTab = page.getByRole('radio', { name: 'Recap' });
    await expect(recapTab).toBeVisible({ timeout: 10000 });
    await recapTab.click();
    await expect(recapTab).toHaveAttribute('aria-checked', 'true');

    const card = page.getByTestId('speed-trend-card');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Reading Speed Over Time' })).toBeVisible();

    // Average reference line matches the time-weighted overall average
    // (SVG geometry has no fill box, so the line is attached while its label is visible)
    await expect(page.getByTestId('speed-trend-avg-line')).toBeAttached();
    await expect(page.getByTestId('speed-trend-avg-label')).toContainText(
      `Avg ${expectedAverage.toLocaleString()}/hr`
    );

    // Default selection is the latest month with data (March)
    const breakdown = page.getByTestId('speed-trend-breakdown');
    await expect(breakdown).toContainText('March');
    await expect(breakdown).toContainText('36,000/hr');
    await expect(breakdown).toContainText('Speed Trend Book Beta');

    // Select February: control state + per-title breakdown (single line + list)
    const febDot = page.getByTestId(`speed-trend-dot-${currentYear}-02`);
    await febDot.click();
    await expect(febDot).toHaveAttribute('aria-pressed', 'true');
    await expect(breakdown).toContainText('February');
    await expect(breakdown).toContainText('18,000/hr');
    await expect(breakdown).toContainText('Speed Trend Book Alpha');
    await expect(breakdown).toContainText('Speed Trend Book Beta');

    // Drill into February weeks
    await page.getByTestId('speed-trend-drill').click();
    const breadcrumb = page.getByTestId('speed-trend-breadcrumb');
    await expect(breadcrumb.getByText('February', { exact: false }).first()).toBeVisible();
    // Week of Feb 9 holds both reading days (Monday-start default)
    const weekDot = page.getByTestId(`speed-trend-dot-${currentYear}-02-09`);
    await expect(weekDot).toBeVisible();
    await weekDot.click();
    await expect(weekDot).toHaveAttribute('aria-pressed', 'true');
    await expect(breakdown).toContainText('18,000/hr');

    // Drill into days of that week
    await page.getByTestId('speed-trend-drill').click();
    const dayDot = page.getByTestId(`speed-trend-dot-${currentYear}-02-11`);
    await expect(dayDot).toBeVisible();
    await dayDot.click();
    await expect(breakdown).toContainText('24,000/hr');
    await expect(breakdown).toContainText('Speed Trend Book Beta');

    // Breadcrumb back up to the year view
    await breadcrumb.getByRole('button', { name: `${currentYear}`, exact: true }).click();
    await expect(page.getByTestId(`speed-trend-dot-${currentYear}-02`)).toBeVisible();
    await expect(page.getByTestId('speed-trend-drill')).toBeVisible();
  });
});
