/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from '../fixtures/book-fixture';
import { expectDialogFitsViewport, expectNoHorizontalOverflow } from '../helpers/mobile-assertions';

function formatDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

test.describe('Mobile (Pixel 9): Summary Date Stepper & Activity Dialog', () => {
  const now = new Date();
  const todayKey = formatDateKey(now);

  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, {
      title: 'A Very Long Book Title That Tests Containment In Mobile Dialogs 吾輩は猫である',
      characters: 60000
    });
    await seedStatistics(page, [
      {
        title: 'A Very Long Book Title That Tests Containment In Mobile Dialogs 吾輩は猫である',
        dateKey: todayKey,
        charactersRead: 5000,
        readingTime: 1500,
        minReadingSpeed: 12000,
        altMinReadingSpeed: 12000,
        lastReadingSpeed: 12000,
        maxReadingSpeed: 12000,
        lastStatisticModified: Date.now()
      }
    ]);
  });

  test('no horizontal overflow at 412px and 360px widths', async ({ page }) => {
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    // Switch to Summary tab
    await page.getByRole('radio', { name: 'Summary' }).tap();

    // Check at default 412px
    await expect(page.getByTestId('summary-date-stepper')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Step to yesterday
    await page.getByTestId('summary-prev-day-btn').tap();
    await expect(page.getByTestId('summary-date-label')).toContainText('Yesterday');
    await expectNoHorizontalOverflow(page);

    // Test narrow 360px viewport
    await page.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalOverflow(page);

    // Tap Today to return
    await page.getByTestId('summary-today-btn').tap();
    await expect(page.getByTestId('summary-date-label')).toContainText('Today');
    await expectNoHorizontalOverflow(page);
  });

  test('add activity dialog fits viewport and has reachable actions', async ({ page }) => {
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await page.getByRole('radio', { name: 'Summary' }).tap();

    // Step to yesterday
    await page.getByTestId('summary-prev-day-btn').tap();

    // Open Add Activity dialog
    await page.getByTestId('summary-add-activity-btn').tap();

    const dialogSurface = page.locator('.astryx-dialog-surface');
    await expectDialogFitsViewport(dialogSurface);

    // Assert primary footer action is visible, enabled, and tappable
    const submitBtn = page.getByTestId('add-activity-submit-btn');
    await expect(submitBtn).toBeVisible();

    // Fill inputs
    await page.locator('#activityReadingTime').fill('20');
    await page.locator('#activityCharactersRead').fill('800');
    await expect(submitBtn).toBeEnabled();

    // Tap Add Activity
    await submitBtn.tap();

    // Dialog closes and page does not overflow
    await expect(dialogSurface).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
