/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from './fixtures/book-fixture';

function formatDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

test.describe('Statistics Summary Date Stepper & Activity Management', () => {
  const now = new Date();
  const todayKey = formatDateKey(now);

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = formatDateKey(yesterdayDate);

  test.beforeEach(async ({ page }) => {
    await seedReaderBook(page, { title: 'Kokoro Book', characters: 50000 });
    await seedStatistics(page, [
      {
        title: 'Kokoro Book',
        dateKey: todayKey,
        charactersRead: 6000,
        readingTime: 1200,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: Date.now()
      },
      {
        title: 'Kokoro Book',
        dateKey: yesterdayKey,
        charactersRead: 9000,
        readingTime: 1800,
        minReadingSpeed: 18000,
        altMinReadingSpeed: 18000,
        lastReadingSpeed: 18000,
        maxReadingSpeed: 18000,
        lastStatisticModified: Date.now()
      }
    ]);
  });

  test('navigates to yesterday with 1 click, steps days, returns to today, and edits activity', async ({
    page
  }) => {
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    // Switch to Summary tab
    await page.getByRole('radio', { name: 'Summary' }).click();

    // Check date stepper is visible; default view is today
    const dateLabel = page.getByTestId('summary-date-label');
    await expect(dateLabel).toBeVisible();
    await expect(dateLabel).toContainText('Today');

    // Next Day button is disabled on today
    const nextBtn = page.getByTestId('summary-next-day-btn');
    await expect(nextBtn).toBeDisabled();

    // No instant Today shortcut — today is the default view
    await expect(page.getByTestId('summary-today-btn')).toHaveCount(0);

    // Verify today's activity is shown (20 min = 1200s, 6000 chars)
    await expect(page.getByText('Kokoro Book').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '20 min' })).toBeVisible();
    await expect(page.getByRole('button', { name: '6000' })).toBeVisible();

    // 1-click step back to yesterday using ◀ button
    const prevBtn = page.getByTestId('summary-prev-day-btn');
    await prevBtn.click();

    // Verify date label switched to Yesterday
    await expect(dateLabel).toContainText('Yesterday');

    // Next day button is now enabled; there is no Today shortcut
    await expect(nextBtn).toBeEnabled();
    await expect(page.getByTestId('summary-today-btn')).toHaveCount(0);

    // Verify yesterday's activity is displayed (30 min = 1800s, 9000 chars)
    await expect(page.getByText('Kokoro Book').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '30 min' })).toBeVisible();
    await expect(page.getByRole('button', { name: '9000' })).toBeVisible();

    // Step back 1 more day (to 2 days ago)
    await prevBtn.click();
    await expect(dateLabel).not.toContainText('Today');
    await expect(dateLabel).not.toContainText('Yesterday');

    // Empty state should be visible for date with no activity
    await expect(page.getByText('No reading activity recorded for this date.')).toBeVisible();
    await expect(page.getByTestId('summary-delete-view-btn')).toBeDisabled();

    // Step forward 1 day back to yesterday
    await nextBtn.click();
    await expect(dateLabel).toContainText('Yesterday');
    await expect(page.getByRole('button', { name: '30 min' })).toBeVisible();

    // Step forward once more to return to today (the default view)
    await nextBtn.click();
    await expect(dateLabel).toContainText('Today');
    await expect(nextBtn).toBeDisabled();
    await expect(page.getByTestId('summary-today-btn')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '20 min' })).toBeVisible();

    // Toolbar Delete warns every time
    const toolbarDelete = page.getByTestId('summary-delete-view-btn');
    await expect(toolbarDelete).toBeEnabled();
    await expect(toolbarDelete).toHaveAttribute('title', /confirmation prompt always appears/);
    await toolbarDelete.click();
    await expect(page.getByRole('heading', { name: 'Delete Data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Cancel keeps today's data in place
    await expect(dateLabel).toContainText('Today');
    await expect(page.getByRole('button', { name: '20 min' })).toBeVisible();
  });

  test('adds reading activity on a date and allows inline editing', async ({ page }) => {
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await page.getByRole('radio', { name: 'Summary' }).click();

    // Go to yesterday
    await page.getByTestId('summary-prev-day-btn').click();
    await expect(page.getByTestId('summary-date-label')).toContainText('Yesterday');

    // Open Add Activity dialog
    await page.getByTestId('summary-add-activity-btn').click();
    const dialog = page.getByTestId('statistics-add-activity-dialog');
    await expect(dialog).toBeVisible();

    // Book is selected, existing activity note should be shown
    await expect(page.getByText('Existing activity on this date')).toBeVisible();

    // Enter 15 minutes and 500 characters
    await page.locator('#activityReadingTime').fill('15');
    await page.locator('#activityCharactersRead').fill('500');

    // Calculated speed preview should be visible
    await expect(page.getByText(/~2,000 chars\/hr/)).toBeVisible();

    // Click Add Activity
    await page.getByTestId('add-activity-submit-btn').click();
    await expect(dialog).toHaveCount(0);

    // Verify activity accumulated: was 30 min + 15 min = 45 min, was 9000 chars + 500 = 9500 chars
    await expect(page.getByRole('button', { name: '45 min' })).toBeVisible();
    await expect(page.getByRole('button', { name: '9500' })).toBeVisible();

    // Now test inline row edit via pen icon
    const editBtn = page.getByTitle('Edit Row');
    await editBtn.click();

    // Input fields appear for inline edit
    const inputs = page.locator('input[type="number"]');
    await expect(inputs.first()).toBeVisible();

    // Save changes via floppy disk icon
    const saveBtn = page.getByTitle('Save Changes');
    await saveBtn.click();

    // Confirm dialog appears
    await expect(page.getByText('Update Data')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Row is updated and edit mode exited
    await expect(page.getByTitle('Edit Row')).toBeVisible();
  });

  test('clicking the date picker on desktop calls showPicker and allows changing date', async ({
    page
  }) => {
    await page.goto('/statistics');
    await page.waitForLoadState('networkidle');

    await page.getByRole('radio', { name: 'Summary' }).click();

    const dateInput = page.locator('#summaryDatePicker');
    await expect(dateInput).toBeAttached();

    await page.evaluate(() => {
      const input = document.getElementById('summaryDatePicker') as HTMLInputElement;
      const orig = input.showPicker;
      (window as any).__showPickerErrors = [];
      input.showPicker = function () {
        (window as any).__showPickerCalled = true;
        if (orig) {
          try {
            return orig.call(this);
          } catch (err: any) {
            (window as any).__showPickerErrors.push(err.name + ': ' + err.message);
          }
        }
      };
    });

    // Click on the date picker button
    await page.getByTestId('summary-date-picker-button').click();

    const wasCalled = await page.evaluate(() => (window as any).__showPickerCalled);
    expect(wasCalled).toBe(true);

    // Changing date updates the summary view
    await dateInput.fill('2026-01-01');
    await dateInput.dispatchEvent('change');
    await expect(page.getByTestId('summary-date-label')).toContainText('Jan 1, 2026');
  });
});
