/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { expect, test } from '@playwright/test';
import { seedCloudSource } from './fixtures/book-fixture';
import { currentDbVersion } from '../src/lib/data/database/books-db/versions/books-db';

test.describe('OneDrive Default Session Persistence Across Reloads', () => {
  test('restores OneDrive Default session silently on reload and persists rotated refresh token', async ({
    page
  }) => {
    let tokenRequestCount = 0;
    let receivedRefreshToken = '';

    await page.route('**/login.microsoftonline.com/**/token', async (route) => {
      tokenRequestCount += 1;
      const postData = route.request().postData() || '';
      const multipartMatch = postData.match(/name="refresh_token"[^\r\n]*\r?\n\r?\n([^\r\n]+)/);
      const urlEncodedMatch = postData.match(/(?:^|&)refresh_token=([^&]+)/);
      receivedRefreshToken = multipartMatch
        ? multipartMatch[1].trim()
        : urlEncodedMatch
          ? decodeURIComponent(urlEncodedMatch[1])
          : '';

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'Files.ReadWrite.AppFolder User.Read offline_access',
          access_token: `mock-access-token-${tokenRequestCount}`,
          refresh_token: `rotated-refresh-token-${tokenRequestCount}`
        })
      });
    });

    await page.goto('/settings/data');

    // 1. Seed OneDrive Default with an initial refresh token and set as syncTarget
    await seedCloudSource(page, {
      name: 'ttu-onedrive-default',
      refreshToken: 'initial-refresh-token-123'
    });
    await page.evaluate(() => {
      window.localStorage.setItem('syncTarget', 'ttu-onedrive-default');
    });

    // 2. Reload the page: restoreCloudSessions() must silently re-authenticate
    await page.reload();

    const providerCard = page.locator('.astryx-card').filter({ hasText: 'OneDrive Default' });
    await expect(providerCard).toBeVisible();

    // Verify status converges to Connected without opening any login popups or modals
    await expect(providerCard.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 10000
    });
    await expect(providerCard.getByText('test@example.com')).toBeVisible();
    await expect(page.locator('.astryx-dialog-surface')).toHaveCount(0);

    // Verify the /token endpoint was called with the initial refresh token
    expect(tokenRequestCount).toBeGreaterThanOrEqual(1);
    expect(receivedRefreshToken).toBe('initial-refresh-token-123');

    // Verify the rotated refresh token was persisted back to IndexedDB
    const storedSource = await page.evaluate(async (version) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return new Promise<any>((resolve, reject) => {
        const tx = db.transaction(['storageSource'], 'readonly');
        const req = tx.objectStore('storageSource').get('ttu-onedrive-default');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }, currentDbVersion);

    expect(storedSource).toBeTruthy();
    expect(storedSource.encryptionDisabled).toBe(true);
    expect(storedSource.data.refreshToken).toBe('rotated-refresh-token-1');

    // 3. Second reload: verify it uses the rotated refresh token and stays connected
    await page.reload();
    await expect(providerCard.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 10000
    });
    expect(receivedRefreshToken).toBe('rotated-refresh-token-1');
  });

  test('disconnecting OneDrive Default deletes persisted credentials and survives reload', async ({
    page
  }) => {
    await page.route('**/login.microsoftonline.com/**/token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'Files.ReadWrite.AppFolder User.Read offline_access',
          access_token: 'mock-access-token',
          refresh_token: 'rotated-refresh-token'
        })
      });
    });

    await page.goto('/settings/data');

    await seedCloudSource(page, {
      name: 'ttu-onedrive-default',
      refreshToken: 'initial-refresh-token-123'
    });
    await page.evaluate(() => {
      window.localStorage.setItem('syncTarget', 'ttu-onedrive-default');
    });

    await page.reload();

    const providerCard = page.locator('.astryx-card').filter({ hasText: 'OneDrive Default' });
    await expect(providerCard.getByText('Connected', { exact: true }).first()).toBeVisible({
      timeout: 10000
    });

    // Click Disconnect
    const disconnectBtn = providerCard.getByRole('button', { name: 'Disconnect' });
    await expect(disconnectBtn).toBeVisible();
    await disconnectBtn.click();

    // Confirm disconnection in modal if presented
    const confirmBtn = page.getByRole('button', { name: 'Confirm', exact: true });
    if ((await confirmBtn.count()) > 0) {
      await confirmBtn.click();
    }

    // Verify UI reflects disconnected state by switching active card to Local Storage Only
    await expect(
      page.locator('.astryx-card').filter({ hasText: 'Local Storage Only' })
    ).toBeVisible();

    // Verify record was deleted from IndexedDB
    const storedSource = await page.evaluate(async (version) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('books', version);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return new Promise<any>((resolve, reject) => {
        const tx = db.transaction(['storageSource'], 'readonly');
        const req = tx.objectStore('storageSource').get('ttu-onedrive-default');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }, currentDbVersion);

    expect(storedSource).toBeUndefined();

    // Reload and verify it stays disconnected
    await page.reload();
    await expect(
      page.locator('.astryx-card').filter({ hasText: 'Local Storage Only' })
    ).toBeVisible();
  });

  test('getToken refreshes access token silently using persisted refresh token when in-memory cache is empty', async ({
    page
  }) => {
    let tokenRequestCount = 0;
    await page.route('**/login.microsoftonline.com/**/token', async (route) => {
      tokenRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'Files.ReadWrite.AppFolder User.Read offline_access',
          access_token: 'mock-background-access-token',
          refresh_token: 'mock-background-rotated-refresh-token'
        })
      });
    });

    await page.goto('/settings/data');

    await seedCloudSource(page, {
      name: 'ttu-onedrive-default',
      refreshToken: 'persisted-refresh-token-for-get-token'
    });

    // In a clean tab state with no in-memory access token, an API request calling getToken()
    // with allowInteractive: false must use the persisted refresh token to renew silently.
    const token = await page.evaluate(async () => {
      const oauthPath = '/src/lib/data/storage/storage-oauth-manager.ts';
      const { StorageOAuthManager } = await import(/* @vite-ignore */ oauthPath);
      const manager = new StorageOAuthManager('onedrive' as any, '');
      return manager.getToken(
        window,
        'ttu-onedrive-default',
        false,
        undefined,
        undefined,
        undefined,
        { allowInteractive: false }
      );
    });

    expect(token).toBe('mock-background-access-token');
    expect(tokenRequestCount).toBe(1);
  });

  test('handles invalid_grant error cleanly by marking NEEDS_RECONNECT on reload', async ({
    page
  }) => {
    let tokenCalls = 0;
    await page.route('**/login.microsoftonline.com/**/token', async (route) => {
      tokenCalls += 1;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'The refresh token has expired or is invalid.'
        })
      });
    });

    await page.goto('/settings/data');

    await seedCloudSource(page, {
      name: 'ttu-onedrive-default',
      refreshToken: 'expired-or-revoked-token'
    });
    await page.evaluate(() => {
      window.localStorage.setItem('syncTarget', 'ttu-onedrive-default');
    });

    // Reload triggers restoreCloudSessions() -> trySilentRefresh() which fails with 400 invalid_grant
    await page.reload();

    const providerCard = page.locator('.astryx-card').filter({ hasText: 'OneDrive Default' });
    await expect(providerCard).toBeVisible();

    // Verify it transitions to Needs Reconnect
    await expect(
      providerCard.getByText('Session Expired — Reconnect required', { exact: true })
    ).toBeVisible({ timeout: 10000 });

    expect(tokenCalls).toBeGreaterThanOrEqual(1);
  });
});
