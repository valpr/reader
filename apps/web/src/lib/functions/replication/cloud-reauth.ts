/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
import MessageDialog from '$lib/components/message-dialog.svelte';
import { dialogManager } from '$lib/data/dialog-manager';
import { getFriendlyStorageSourceName } from '$lib/data/storage/storage-types';
import { StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { markPendingCloudSync, pushTransientNotice } from '$lib/data/store';
import { logger } from '$lib/data/logger';
import { isNetworkUnreachableError } from '$lib/functions/replication/error-handler';
import { triggerCloudSync } from '$lib/functions/replication/cloud-sync';

/** Single delayed retry for transient network failures — never a loop. */
const NETWORK_RETRY_DELAY_MS = 5000;

async function syncAfterReconnect(
  window: Window,
  sourceName: string,
  storageSources: BooksDbStorageSource[]
): Promise<boolean> {
  const error = await triggerCloudSync(window, sourceName, storageSources);
  if (!error) return true;

  // Transient network failure (any data type — profiles, goals, tags, books):
  // keep the pending marker, toast once, retry once after a short delay when
  // the browser still reports connectivity. Auth failures fall through to the
  // manual-retry prompt below with no automatic traffic.
  if (isNetworkUnreachableError(error) && window.navigator?.onLine !== false) {
    markPendingCloudSync(sourceName, error);
    pushTransientNotice(error);
    logger.warn(`Sync after reconnect deferred (retrying once): ${error}`);
    await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
    const retryError = await triggerCloudSync(window, sourceName, storageSources);
    if (!retryError) return true;
    return promptManualRetry(window, sourceName, storageSources, retryError);
  }

  if (isNetworkUnreachableError(error)) {
    markPendingCloudSync(sourceName, error);
  }
  return promptManualRetry(window, sourceName, storageSources, error);
}

async function promptManualRetry(
  window: Window,
  sourceName: string,
  storageSources: BooksDbStorageSource[],
  error: string
): Promise<boolean> {
  const wasCanceled = await new Promise<boolean>((resolve) => {
    dialogManager.dialogs$.next([
      {
        component: ConfirmDialog,
        props: {
          dialogHeader: 'Sync Failed',
          dialogMessage: `Reconnected, but sync failed: ${error}\n\nYour local progress is safe. Retry now?`,
          contentStyles: 'white-space: pre-line;',
          confirmLabel: 'Retry Sync',
          resolver: resolve
        }
      }
    ]);
  });

  if (wasCanceled) return false;

  const retryError = await triggerCloudSync(window, sourceName, storageSources);
  if (!retryError) return true;

  dialogManager.dialogs$.next([
    {
      component: MessageDialog,
      props: {
        title: 'Sync Failed',
        message: `Reconnected, but sync failed: ${retryError}`
      }
    }
  ]);
  return false;
}

/**
 * Explicit re-auth from a button click (banner / top-bar icon / Settings).
 * Call `StorageOAuthManager.openAuthWindowSync()` synchronously in the click
 * handler and pass it in so iOS/Safari does not block the popup.
 *
 * `beforeFullSync` is an optional best-effort fast path that runs after
 * reconnect and before the full library sync (e.g. the reader pulls the
 * open book's read-state first so it can offer a jump without waiting).
 * It never blocks or fails the full sync, which retries and reports
 * through its own flows.
 */
export async function reconnectAndSyncNow(
  window: Window,
  sourceName: string,
  preOpenedWindow: Window | null | undefined,
  storageSources: BooksDbStorageSource[] = [],
  beforeFullSync?: () => Promise<void>
): Promise<boolean> {
  if (!sourceName) return false;
  const connected = await StorageOAuthManager.reconnect(window, sourceName, preOpenedWindow);
  if (!connected) return false;
  try {
    await beforeFullSync?.();
  } catch {
    // Intentionally silent; syncAfterReconnect owns error reporting.
  }
  return syncAfterReconnect(window, sourceName, storageSources);
}

/**
 * Prompt-first variant for passive surfaces: shows a confirm dialog, then
 * reconnects and auto-retries the pending sync. Prefer `reconnectAndSyncNow`
 * from real buttons (iOS-safe); this is for programmatic prompts.
 */
export async function reconnectAndSync(
  window: Window,
  sourceName: string,
  storageSources: BooksDbStorageSource[] = []
): Promise<boolean> {
  if (!sourceName) return false;

  const confirmed = await new Promise<boolean>((resolve) => {
    dialogManager.dialogs$.next([
      {
        component: ConfirmDialog,
        props: {
          dialogHeader: 'Session Expired',
          dialogMessage: `Syncing with "${getFriendlyStorageSourceName(sourceName)}" is paused because the session expired.\n\nReconnect now to resume syncing? Your local progress is safe and will sync after reconnecting.`,
          contentStyles: 'white-space: pre-line;',
          resolver: resolve
        },
        disableCloseOnClick: true
      }
    ]);
  });

  if (!confirmed) return false;

  const preOpened = StorageOAuthManager.openAuthWindowSync(window);
  return reconnectAndSyncNow(window, sourceName, preOpened, storageSources);
}
