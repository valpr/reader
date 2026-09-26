/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

// Desktop visitors must never see the first-run profile choice modal:
// detectSuggestedProfileId returns null for desktop/laptop.
test.describe('First-run profile choice (desktop)', () => {
  test('no profile choice modal is offered on desktop', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('profile-choice-modal')).toHaveCount(0);

    // The choice was never offered, so no dismissal flag is stored.
    const seen = await page.evaluate(() => localStorage.getItem('profileChoiceSeen'));
    expect(seen).toBeNull();
  });
});
