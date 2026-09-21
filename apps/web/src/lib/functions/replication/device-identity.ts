/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import type { BooksDbDeviceIdentity } from '$lib/data/database/books-db/versions/books-db';
import type { DatabaseService } from '$lib/data/database/books-db/database.service';
import { logger } from '$lib/data/logger';

const DEVICE_IDENTITY_STORAGE_KEY = 'syncDeviceIdentity';

export async function ensureDeviceIdentity(
  database: DatabaseService
): Promise<BooksDbDeviceIdentity> {
  const indexed = await database.getDeviceIdentity();
  const stored = readStoredIdentity();

  if (indexed?.deviceId) {
    if (!stored || stored.deviceId !== indexed.deviceId) {
      if (stored?.deviceId && stored.deviceId !== indexed.deviceId) {
        logger.warn('Sync device identity mismatch; retaining the IndexedDB identity.');
      }
      writeStoredIdentity(indexed);
    }
    return indexed;
  }

  if (stored) {
    await database.putDeviceIdentity(stored);
    return stored;
  }

  const identity: BooksDbDeviceIdentity = {
    id: 0,
    deviceId: createDeviceId(),
    deviceLabel: 'This device'
  };
  await database.putDeviceIdentity(identity);
  writeStoredIdentity(identity);
  return identity;
}

function readStoredIdentity(): BooksDbDeviceIdentity | undefined {
  if (typeof localStorage === 'undefined') return undefined;

  try {
    const parsed = JSON.parse(localStorage.getItem(DEVICE_IDENTITY_STORAGE_KEY) || 'null');
    if (
      parsed &&
      typeof parsed.deviceId === 'string' &&
      parsed.deviceId.length > 0 &&
      typeof parsed.deviceLabel === 'string'
    ) {
      return { id: 0, deviceId: parsed.deviceId, deviceLabel: parsed.deviceLabel };
    }
  } catch {
    // Invalid storage is repaired by minting a fresh identity below.
  }

  return undefined;
}

function writeStoredIdentity(identity: BooksDbDeviceIdentity): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // IndexedDB remains authoritative when localStorage is unavailable.
  }
}

export function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
