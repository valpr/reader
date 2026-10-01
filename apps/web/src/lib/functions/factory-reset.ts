/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { database } from '$lib/data/store';
import { gDriveRevokeEndpoint } from '$lib/data/env';
import { userFontsCacheName } from '$lib/data/fonts';
import { logger } from '$lib/data/logger';
import { StorageOAuthManager, storageOAuthTokens } from '$lib/data/storage/storage-oauth-manager';
import { StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';

/**
 * Full factory reset: drops all cloud sessions, wipes the local IndexedDB
 * database, clears cached user fonts, resets every localStorage-backed
 * setting to its default, and reloads the app.
 *
 * Cloud files are never touched — reconnecting later merges them back under
 * the normal sync rules. Order matters:
 * 1. Revoke first, while token and source records still exist.
 * 2. Wipe IndexedDB, fonts cache, and localStorage back-to-back.
 * 3. Reload synchronously so nothing can write in between.
 */
export async function factoryReset(): Promise<void> {
  await revokeInMemoryGDriveTokens();

  await database.clearAll();

  try {
    await caches.delete(userFontsCacheName);
    await caches.delete('ttu-userfonts');
  } catch (err: any) {
    logger.warn(`Factory reset: could not clear font cache: ${err?.message || err}`);
  }

  localStorage.clear();
  location.reload();
}

/**
 * Best-effort server-side revocation for GDrive tokens already held in
 * memory. Never unlocks password-protected sources (which would pop an
 * interactive prompt mid-reset): local sessions die with the wipe below
 * regardless, and revocation itself is fire-and-forget. OneDrive has no
 * client-callable revoke endpoint, so its sessions end with the local wipe;
 * users can remove the server-side grant at account.microsoft.com.
 */
async function revokeInMemoryGDriveTokens(): Promise<void> {
  try {
    const db = await database.db;
    const sources = await db.getAll('storageSource').catch(() => []);
    const typeByName = new Map((sources || []).map((source) => [source.name, source.type]));

    for (const [name, token] of storageOAuthTokens) {
      const refreshToken = token?.refreshToken;
      if (!refreshToken) continue;

      const isGDrive =
        name === StorageSourceDefault.GDRIVE_DEFAULT || typeByName.get(name) === StorageKey.GDRIVE;
      if (isGDrive) {
        StorageOAuthManager.revokeToken(gDriveRevokeEndpoint, refreshToken);
      }
    }
  } catch (err: any) {
    logger.warn(`Factory reset: token revocation skipped: ${err?.message || err}`);
  }
}
