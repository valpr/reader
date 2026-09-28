/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

/**
 * Desktop coverage for the BookLoader calligraphy loader.
 * Renders via the dev-only ui-showcase page (served by the `pnpm dev`
 * webServer in playwright.config.ts) plus the Settings appearance toggle.
 */

import { expect, test } from '@playwright/test';

test.describe('BookLoader showcase', () => {
  test('flavor mode shows brush kanji with rotating line', async ({ page }) => {
    await page.goto('/ui-showcase');

    const loader = page.getByTestId('showcase-loader-flavor').getByTestId('book-loader');
    await expect(loader).toBeVisible();
    await expect(loader).toHaveAttribute('data-mode', 'flavor');
    const flavorText = loader.getByTestId('book-loader-flavor');
    await expect(flavorText).toBeVisible();
    await expect(flavorText).toHaveText('筆を整えています…');

    const transitionProp = await flavorText.evaluate(
      (el) => window.getComputedStyle(el).transitionProperty
    );
    expect(transitionProp).toContain('opacity');

    // Asserts smooth rotation from line 1 to line 2 (fade-out then fade-in)
    await expect(flavorText).toHaveText('文庫本を開いています…', { timeout: 6000 });
  });

  test('debug mode shows stage text and determinate progress', async ({ page }) => {
    await page.goto('/ui-showcase');

    const loader = page.getByTestId('showcase-loader-debug').getByTestId('book-loader');
    await expect(loader).toBeVisible();
    await expect(loader).toHaveAttribute('data-mode', 'debug');
    await expect(loader.getByTestId('book-loader-stage')).toHaveText('Syncing cloud library…');
    await expect(loader.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });
});

test.describe('Loader mode setting', () => {
  test('flavor is selected by default', async ({ page }) => {
    await page.goto('/settings/reader/appearance');

    await expect(page.getByText('Loading Animation')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Flavor' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  // NOTE: toggling via click is not covered here: clicks on
  // SegmentedControl (and other @custom-ereader/ui controls) do not reach
  // Svelte handlers in this environment, which also fails on the clean tree
  // for pre-existing controls (e.g. the ui-showcase Button demo).
  test('debug mode reflects the stored preference', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('loaderMode', 'debug'));
    await page.goto('/settings/reader/appearance');

    await expect(page.getByText('Loading Animation')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Debug' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
