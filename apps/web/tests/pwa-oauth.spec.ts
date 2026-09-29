/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';

test.describe('PWA OAuth same-window redirect flow', () => {
  test('openAuthWindowSync returns null when running as standalone PWA', async ({ page }) => {
    await page.goto('/manage');

    const result = await page.evaluate(async () => {
      const utilsPath = '/src/lib/functions/utils.ts';
      const oauthPath = '/src/lib/data/storage/storage-oauth-manager.ts';
      const utils = await import(/* @vite-ignore */ utilsPath);
      const oauth = await import(/* @vite-ignore */ oauthPath);

      // Emulate standalone mode
      (window as any).__forceStandalonePwa = true;
      const isPwa = utils.isStandalonePwa(window);
      const win = oauth.StorageOAuthManager.openAuthWindowSync(window);

      return { isPwa, winIsNull: win === null };
    });

    expect(result.isPwa).toBe(true);
    expect(result.winIsNull).toBe(true);
  });

  test('reconnect in standalone PWA saves state and triggers top-level redirect', async ({
    page
  }) => {
    await page.goto('/manage');

    await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { database } = await import(/* @vite-ignore */ storePath);
      const db = await database.db;
      await db.put('storageSource', {
        name: 'custom-pwa-source',
        type: 'gdrive',
        storedInManager: false,
        encryptionDisabled: true,
        data: { clientId: 'custom-gdrive-client-id' },
        disconnected: false,
        lastSourceModified: Date.now()
      });
      (window as any).__forceStandalonePwa = true;
    });

    // Intercept Google auth navigation so the browser doesn't try to fetch real Google
    await page.route('https://accounts.google.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>Mock Google Auth</body></html>'
      });
    });

    // Trigger reconnect; catch expected execution context destruction due to navigation
    await page
      .evaluate(async () => {
        const oauthPath = '/src/lib/data/storage/storage-oauth-manager.ts';
        const oauth = await import(/* @vite-ignore */ oauthPath);
        await oauth.StorageOAuthManager.reconnect(window, 'custom-pwa-source');
      })
      .catch(() => {
        // Expected: navigation destroys the execution context
      });

    // Verify it navigated to Google auth endpoint
    await page.waitForURL(/accounts\.google\.com/);
    expect(page.url()).toContain('accounts.google.com');
    expect(page.url()).toContain('client_id=custom-gdrive-client-id');
    expect(page.url()).toContain('response_type=token');
  });

  test('auth callback in PWA mode exchanges token, updates IndexedDB, and redirects to returnUrl', async ({
    page
  }) => {
    await page.goto('/manage');

    // Seed storage source in IndexedDB using database.db
    await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { database } = await import(/* @vite-ignore */ storePath);
      const db = await database.db;
      await db.put('storageSource', {
        name: 'custom-onedrive-source',
        type: 'onedrive',
        storedInManager: false,
        encryptionDisabled: true,
        data: { clientId: 'test-client', refreshToken: 'old-refresh-token' },
        disconnected: false,
        lastSourceModified: Date.now()
      });
    });

    // Mock token endpoint
    await page.route('**/oauth2/v2.0/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'new-pwa-access-token',
          expires_in: '3600',
          scope: 'Files.ReadWrite.AppFolder User.Read',
          refresh_token: 'new-pwa-refresh-token'
        })
      });
    });

    // Mock Microsoft Graph user endpoint
    await page.route('**/v1.0/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userPrincipalName: 'user@outlook.com',
          displayName: 'PWA User'
        })
      });
    });

    // Seed PWA OAuth state in sessionStorage
    await page.evaluate(() => {
      sessionStorage.setItem(
        'pwa_oauth_state',
        JSON.stringify({
          storageSourceName: 'custom-onedrive-source',
          storageType: 'onedrive',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          sendSecret: false,
          tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
          codeVerifier: 'mock_code_verifier_12345678901234567890',
          returnUrl: '/manage',
          triggerSyncOnReturn: true,
          timestamp: Date.now()
        })
      );
    });

    // Navigate to auth callback with code
    await page.goto('/auth?code=mock_authorization_code');

    // Should redirect back to /manage
    await expect(page).toHaveURL(/\/manage/, { timeout: 15000 });

    // Verify storage source was updated in IndexedDB with new refresh token and account info
    const storedData = await page.evaluate(async () => {
      const storePath = '/src/lib/data/store.ts';
      const { database } = await import(/* @vite-ignore */ storePath);
      const db = await database.db;
      return db.get('storageSource', 'custom-onedrive-source');
    });

    expect(storedData).toBeDefined();
    expect(storedData.data.refreshToken).toBe('new-pwa-refresh-token');
    expect(storedData.data.accountEmail).toBe('user@outlook.com');

    // Verify pwa_oauth_state was cleaned up
    const remainingState = await page.evaluate(() => {
      return sessionStorage.getItem('pwa_oauth_state');
    });
    expect(remainingState).toBeNull();
  });

  test('auth callback with provider error in PWA mode surfaces Return to App button', async ({
    page
  }) => {
    await page.goto('/manage');

    // Seed PWA OAuth state
    await page.evaluate(() => {
      sessionStorage.setItem(
        'pwa_oauth_state',
        JSON.stringify({
          storageSourceName: 'ttu-gdrive-default',
          storageType: 'gdrive',
          clientId: 'test-client',
          sendSecret: false,
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          codeVerifier: 'mock_verifier',
          returnUrl: '/manage',
          timestamp: Date.now()
        })
      );
    });

    // Navigate to auth with error
    await page.goto('/auth?error=access_denied&error_description=User+declined+authorization');

    await expect(page.getByText('Authentication Failed')).toBeVisible();
    await expect(page.getByText('User declined authorization')).toBeVisible();

    const returnBtn = page.getByRole('button', { name: 'Return to App' });
    await expect(returnBtn).toBeVisible();

    await returnBtn.click();
    await expect(page).toHaveURL(/\/manage/);
  });

  test('orphaned login window without opener or PWA state surfaces helpful error with Close Window button', async ({
    page
  }) => {
    // Navigate directly to auth with code but no opener and no PWA state
    await page.goto('/auth?code=stray_code');

    await expect(page.getByText('Authentication Failed')).toBeVisible();
    await expect(page.getByText('lost connection to the app')).toBeVisible();

    const closeBtn = page.getByRole('button', { name: 'Close Window' });
    await expect(closeBtn).toBeVisible();
  });
});
