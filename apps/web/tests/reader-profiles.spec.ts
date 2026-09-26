/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedReaderBook } from './fixtures/book-fixture';

test.describe('Reader Profiles System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/reader/profiles');
    // Ensure we are on the Reader Profiles section and Svelte has mounted
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Active').first()).toBeVisible({ timeout: 10000 });
    // Wait for JS hydration so profile actions (modal, sliders) are interactive
    await page.waitForLoadState('networkidle');
  });

  test('displays default reader profiles and active indicator', async ({ page }) => {
    await expect(page.locator('text=PC / Desktop')).toBeVisible();
    await expect(page.locator('text=Mobile / Phone')).toBeVisible();
    await expect(page.locator('[role="button"]:has-text("Tablet")')).toBeVisible();
    await expect(page.locator('text=E-Reader / E-Ink')).toBeVisible();

    // Default profile should show Active badge
    const activeBadge = page.locator('text=Active').first();
    await expect(activeBadge).toBeVisible();
  });

  test('switches profile and updates reading settings values', async ({ page }) => {
    // Initial desktop font size should be 20px
    const fontSizeDisplay = page.locator('text=20px').first();
    await expect(fontSizeDisplay).toBeVisible();

    // Click on Mobile / Phone profile
    await page.locator('[role="button"]:has-text("Mobile / Phone")').click();

    // Font size should update to 17px for mobile profile
    await expect(page.locator('text=17px').first()).toBeVisible();

    // No unsaved-changes banner exists anymore (settings auto-save)
    await expect(page.getByTestId('unsaved-changes-banner')).toHaveCount(0);

    // Switch to Tablet
    await page.locator('[role="button"]:has-text("Tablet")').click();
    await expect(page.locator('text=22px').first()).toBeVisible();
    await expect(page.getByTestId('unsaved-changes-banner')).toHaveCount(0);

    // Switch to E-Reader / E-Ink
    await page.locator('[role="button"]:has-text("E-Reader / E-Ink")').click();
    await expect(page.locator('text=20px').first()).toBeVisible();
    await expect(page.getByTestId('unsaved-changes-banner')).toHaveCount(0);

    // Switch back to PC / Desktop
    await page.locator('[role="button"]:has-text("PC / Desktop")').click();
    await expect(page.locator('text=20px').first()).toBeVisible();
    await expect(page.getByTestId('unsaved-changes-banner')).toHaveCount(0);
  });

  test('auto-saves modifications to active profile locally without a banner', async ({ page }) => {
    // Font size slider lives in the Typography section (bare /settings/reader
    // defaults to the profiles section, which has no sliders).
    await page.goto('/settings/reader/typography');
    await expect(
      page
        .getByTestId('reader-settings-content-panel')
        .getByRole('heading', { name: 'Typography & Fonts' })
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    // Modify font size slider by triggering an input change or pressing arrow key
    const slider = page.locator('input[type="range"]').first();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // No banner or manual save buttons anymore
    await expect(page.getByTestId('unsaved-changes-banner')).toHaveCount(0);
    await expect(page.locator('button:has-text("Revert")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Update Profile")')).toHaveCount(0);

    // Active profile in localStorage should reflect the updated font size (auto-saved locally)
    const activeFontSize = await page.evaluate(() => {
      const profiles = JSON.parse(localStorage.getItem('readerProfiles') || '[]');
      const activeId = localStorage.getItem('activeProfileId') || 'default-desktop';
      const active = profiles.find((p: any) => p.id === activeId);
      return active?.settings?.fontSize;
    });
    expect(activeFontSize).toBe(22);

    // Edits survive a profile switch round-trip (switch to profiles section first)
    await page
      .getByTestId('reader-settings-sidebar')
      .locator('.astryx-list-item', { hasText: 'Reader Profiles' })
      .click();
    await page.locator('[role="button"]:has-text("Mobile / Phone")').click();
    await expect(page.locator('text=17px').first()).toBeVisible();
    await page.locator('[role="button"]:has-text("PC / Desktop")').click();
    await expect(page.locator('text=22px').first()).toBeVisible();
  });

  test('creates a new custom profile via modal', async ({ page }) => {
    // Click "New Profile" button
    const newProfileBtn = page.locator('button:has-text("New Profile")');
    await expect(newProfileBtn).toBeVisible();
    await newProfileBtn.click();

    // Modal should be visible
    await expect(page.locator('text=Create Reader Profile')).toBeVisible({ timeout: 10000 });

    // Fill in profile name
    const nameInput = page.locator('#new-profile-name');
    await nameInput.fill('OLED Night Reader');

    // Click "Create Profile" button in modal
    await page.locator('button:has-text("Create Profile")').last().click();

    // New profile should appear in the list and be active
    await expect(page.locator('text=OLED Night Reader')).toBeVisible();
  });

  test('deletes a profile after confirmation dialog', async ({ page }) => {
    // Create a new profile to delete
    await page.locator('button:has-text("New Profile")').click();
    await expect(page.locator('text=Create Reader Profile')).toBeVisible();
    await page.locator('#new-profile-name').fill('Profile To Delete');
    await page.locator('button:has-text("Create Profile")').last().click();
    await expect(page.locator('text=Profile To Delete')).toBeVisible();

    // Find the profile card for "Profile To Delete"
    const profileCard = page.locator('div[role="button"]').filter({ hasText: 'Profile To Delete' });
    const deleteButton = profileCard.getByRole('button', { name: 'Delete profile' });
    await expect(deleteButton).toBeVisible();

    // Click delete button - confirmation dialog should appear
    await deleteButton.click();
    await expect(page.locator('text=Delete Profile')).toBeVisible();
    await expect(
      page.locator('text=Are you sure you want to delete the profile "Profile To Delete"?')
    ).toBeVisible();

    // Click Cancel: profile should NOT be deleted
    await page.locator('button:has-text("Cancel")').click();
    await expect(page.locator('text=Delete Profile')).not.toBeVisible();
    await expect(page.locator('text=Profile To Delete')).toBeVisible();

    // Click delete button again and confirm
    await deleteButton.click();
    await page.locator('button:has-text("Confirm")').click();

    // Confirmation dialog closes and profile is removed
    await expect(page.locator('text=Delete Profile')).not.toBeVisible();
    await expect(page.locator('text=Profile To Delete')).not.toBeVisible();
  });

  test('e-reader profile pins the header and disables tap edge', async ({ page }) => {
    const keepSwitch = () =>
      page
        .locator('li.astryx-list-item', { hasText: 'Keep Reader Header Visible' })
        .getByRole('switch');
    const tapSwitch = () =>
      page.locator('li.astryx-list-item', { hasText: 'Tap Edge to Flip' }).getByRole('switch');
    const breakSwitch = () =>
      page
        .locator('li.astryx-list-item', { hasText: 'Avoid Mid-Sentence Page Breaks' })
        .getByRole('switch');

    async function selectProfileAndOpenNavigation(name: string, id: string) {
      await page.locator(`[role="button"]:has-text("${name}")`).click();
      // Wait for the switch to flush to localStorage before navigating away
      await expect
        .poll(async () => page.evaluate(() => localStorage.getItem('activeProfileId')), {
          timeout: 5000
        })
        .toBe(id);
      await page.goto('/settings/reader/navigation');
      await expect(page.locator('text=Keep Reader Header Visible')).toBeVisible();
    }

    // E-Reader / E-Ink preset: pinned header ON, tap edge OFF, no mid-sentence breaks
    await selectProfileAndOpenNavigation('E-Reader / E-Ink', 'default-ereader');
    await expect(keepSwitch()).toHaveAttribute('aria-checked', 'true');
    await expect(tapSwitch()).toHaveAttribute('aria-checked', 'false');
    await expect(breakSwitch()).toHaveAttribute('aria-checked', 'true');

    // PC / Desktop preset: pinned header OFF (auto-hide overlay)
    await page.goto('/settings/reader/profiles');
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Active').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await selectProfileAndOpenNavigation('PC / Desktop', 'default-desktop');
    await expect(keepSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  test('mobile responsive layout does not crush description into vertical line', async ({
    page
  }) => {
    // Resize viewport to mobile screen (iPhone SE: 375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/settings/reader/profiles');
    await page.waitForLoadState('networkidle');

    // Verify "Profile Backup & Transfer" description is rendered with wide text width (not crushed)
    const backupDescription = page.locator('text=Export or import reader profiles as a JSON file');
    await expect(backupDescription).toBeVisible();

    const descBox = await backupDescription.boundingBox();
    expect(descBox).not.toBeNull();
    // In mobile stacked layout, description should be wide (> 250px), not a narrow column
    expect(descBox!.width).toBeGreaterThan(250);
  });
});

test.describe('First-run dark mode seeding', () => {
  test.use({ colorScheme: 'dark' });

  test('seeds dark reader theme in appearance settings for new users with dark OS', async ({
    page
  }) => {
    await page.goto('/settings/reader/appearance');
    await expect(page.locator('text=Appearance & Themes').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // The Reader Palette radio group should have gray-theme selected (aria-checked=true)
    const grayThemeRadio = page.locator('button[role="radio"][title="gray-theme"]');
    await expect(grayThemeRadio).toBeVisible();
    await expect(grayThemeRadio).toHaveAttribute('aria-checked', 'true');

    const lightThemeRadio = page.locator('button[role="radio"][title="light-theme"]');
    await expect(lightThemeRadio).toBeVisible();
    await expect(lightThemeRadio).toHaveAttribute('aria-checked', 'false');
  });

  test('reader body background uses dark theme on first run when dark mode is enabled', async ({
    page
  }) => {
    await seedReaderBook(page);
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    // In dark mode, reader palette defaults to gray-theme (rgb(35, 39, 42))
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(35, 39, 42)');
  });

  test('existing user stored light theme is preserved even when dark mode is enabled', async ({
    page
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('theme', 'light-theme');
    });
    await seedReaderBook(page);
    await page.goto('/b?id=1');
    await expect(page.locator('.book-content')).toBeVisible({ timeout: 15000 });

    // light-theme background is rgb(255, 255, 255)
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('profile switching respects seeded dark theme and forced light e-reader preset', async ({
    page
  }) => {
    await page.goto('/settings/reader/profiles');
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Switch to E-Reader / E-Ink: reader theme should switch to light-theme
    await page.locator('[role="button"]:has-text("E-Reader / E-Ink")').click();
    await page.goto('/settings/reader/appearance');
    await expect(page.locator('button[role="radio"][title="light-theme"]')).toHaveAttribute(
      'aria-checked',
      'true'
    );

    // Switch back to PC / Desktop: reader theme should be back to gray-theme
    await page.goto('/settings/reader/profiles');
    await expect(page.locator('text=Reader Profiles').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.locator('[role="button"]:has-text("PC / Desktop")').click();
    await page.goto('/settings/reader/appearance');
    await expect(page.locator('button[role="radio"][title="gray-theme"]')).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });
});
