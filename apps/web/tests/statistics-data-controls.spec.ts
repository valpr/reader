/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook, seedStatistics } from './fixtures/book-fixture';

function todayKey() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

test.beforeEach(async ({ page }) => {
  await seedReaderBook(page, { title: 'Alpha Book', characters: 50000 });
  await seedStatistics(page, [
    {
      title: 'Alpha Book',
      dateKey: todayKey(),
      charactersRead: 12000,
      readingTime: 2400,
      minReadingSpeed: 18000,
      altMinReadingSpeed: 18000,
      lastReadingSpeed: 18000,
      maxReadingSpeed: 18000,
      lastStatisticModified: Date.now()
    },
    {
      title: 'Beta Book',
      dateKey: todayKey(),
      charactersRead: 6000,
      readingTime: 1200,
      minReadingSpeed: 18000,
      altMinReadingSpeed: 18000,
      lastReadingSpeed: 18000,
      maxReadingSpeed: 18000,
      lastStatisticModified: Date.now()
    }
  ]);
});

test('data controls sheet: scope bar, tabs, apply filter updates scope', async ({ page }) => {
  await page.goto('/statistics');
  await page.waitForLoadState('networkidle');

  // Switch to Summary tab
  await page.getByRole('radio', { name: 'Summary' }).click();

  // Scope bar shows committed selection
  await expect(page.getByText('2 of 2 titles')).toBeVisible();
  await expect(page.getByTitle('Open Advanced Filtering (dates)')).toBeVisible();

  // Header data-controls entry with count badge
  const dataBtn = page.getByRole('button', { name: 'Open Advanced Filtering' });
  await expect(dataBtn).toBeVisible();

  // Open sheet at Dates tab by default
  await dataBtn.click();
  await expect(page.getByText('Advanced Filtering').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Dates' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Template')).toBeVisible();
  await expect(page.getByText('Date range applies to the Summary tab only.')).toBeVisible();

  // Editing From inside the sheet forwards through to the page: template flips
  // to Custom, the sheet stays open, and in-range data is preserved
  await page.getByLabel('From').fill('2026-01-01');
  await expect(page.getByLabel('Template')).toHaveValue('Custom');
  await expect(page.getByRole('tab', { name: 'Dates' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '2 of 2 titles' })).toBeVisible();

  // Switch to Titles tab; sheet stays open with search + instant actions
  await page.getByRole('tab', { name: 'Titles' }).click();
  await expect(page.getByRole('tab', { name: 'Titles' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByPlaceholder('Search titles…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'None', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'In range' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Beta Book' })).toBeVisible();

  // Toggle a view-only switch: sheet must stay open
  await page.getByRole('button', { name: 'In range' }).click();
  await expect(page.getByPlaceholder('Search titles…')).toBeVisible();
  await page.getByRole('button', { name: 'In range' }).click();

  // Removing a title applies immediately: scope updates, sheet stays open
  await page.getByRole('button', { name: 'Remove Beta Book' }).click();
  await expect(page.getByText('1 of 2 titles').first()).toBeVisible();
  await expect(page.getByText('Advanced Filtering').first()).toBeVisible();

  // Searching finds the removed title; picking it re-adds it immediately
  await page.getByPlaceholder('Search titles…').fill('Beta');
  await page.getByRole('option', { name: 'Beta Book' }).click();
  await expect(page.getByRole('button', { name: 'Remove Beta Book' })).toBeVisible();
  await expect(page.getByText('2 of 2 titles').first()).toBeVisible();

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('2 of 2 titles')).toBeVisible();
  await expect(page.getByText('Advanced Filtering').first()).toHaveCount(0);
});

test('recap tab shows ignore-filters caption and no data button', async ({ page }) => {
  await page.goto('/statistics');
  await page.waitForLoadState('networkidle');

  await page.getByRole('radio', { name: 'Recap' }).click();
  await expect(page.getByText('Recap ignores date and title filters.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Advanced Filtering' })).toHaveCount(0);
});

test('display tab changes aggregation and actions tab groups copy/export only', async ({
  page
}) => {
  await page.goto('/statistics');
  await page.waitForLoadState('networkidle');

  await page.getByRole('radio', { name: 'Summary' }).click();
  await expect(page.getByText('2 of 2 titles')).toBeVisible();

  // Legacy settings entry is gone; copy shortcut opens the sheet at Actions
  await expect(page.getByRole('button', { name: 'Statistics Settings' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open data actions' }).click();
  await expect(page.getByRole('tab', { name: 'Actions' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Copy Reading Time' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Characters Read' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export current view' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export everything' })).toBeVisible();

  // Delete lives in the Summary toolbar now, not in Advanced Filtering
  await expect(page.getByRole('button', { name: 'Delete current view' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete everything' })).toHaveCount(0);

  // No grouping chip while aggregation is None
  await expect(page.getByRole('button', { name: /grouped by/ })).toHaveCount(0);

  // Display tab: switching aggregation updates the scope bar and stays open
  await page.getByRole('tab', { name: 'Display' }).click();
  await expect(page.getByText('Primary Aggregation')).toBeVisible();
  await page.getByRole('radio', { name: 'Title' }).click();
  await expect(page.getByRole('tab', { name: 'Display' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('grouped by Title')).toBeVisible();

  // Close via footer; scope bar keeps the new aggregation
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('grouped by Title')).toBeVisible();
  await expect(page.getByText('Advanced Filtering').first()).toHaveCount(0);
});
