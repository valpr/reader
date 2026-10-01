/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
import MessageDialog from '$lib/components/message-dialog.svelte';
import StorageUnlock from '$lib/components/storage-unlock.svelte';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { dialogManager } from '$lib/data/dialog-manager';
import {
  gDriveAuthEndpoint,
  gDriveClientId,
  gDriveClientSecret,
  gDriveRefreshEndpoint,
  gDriveRevokeEndpoint,
  gDriveScope,
  gDriveTokenEndpoint,
  oneDriveAuthEndpoint,
  oneDriveClientId,
  oneDriveClientSecret,
  oneDriveScope,
  oneDriveTokenEndpoint,
  pagePath
} from '$lib/data/env';
import { logger } from '$lib/data/logger';
import {
  encrypt,
  isAppDefault,
  isRemoteContext,
  unlockStorageData,
  type RemoteContext,
  type StorageUnlockAction
} from '$lib/data/storage/storage-source-manager';
import { StorageSourceDefault, StorageKey } from '$lib/data/storage/storage-types';
import {
  clearPendingCloudSync,
  database,
  markPendingCloudSync,
  syncTarget$
} from '$lib/data/store';
import {
  convertAuthErrorResponse,
  isNetworkUnreachableError
} from '$lib/functions/replication/error-handler';
import { writableSubject } from '$lib/functions/svelte/store';
import { isMobile, isStandalonePwa } from '$lib/functions/utils';

export enum StorageConnectionState {
  CONNECTED = 'connected',
  NEEDS_RECONNECT = 'needs_reconnect',
  DISCONNECTED = 'disconnected'
}

export const storageConnectionStates$ = writableSubject<Record<string, StorageConnectionState>>({});

/**
 * True while cloud sessions are being silently re-validated at app start.
 * Connection state, tokens, and refresh timers live in memory only, so after
 * a refresh the persisted refresh tokens in IndexedDB are used to converge
 * each source to CONNECTED / NEEDS_RECONNECT instead of flashing DISCONNECTED.
 */
export const sessionsRestoring$ = writableSubject<boolean>(false);

let inFlightRestore: Promise<void> | null = null;

/**
 * Silently re-validate persisted cloud sessions on app start / reconnect.
 * Never interactive: no popups or unlock dialogs. Sources with a fresh cached
 * token or a working persisted refresh token converge to CONNECTED; genuinely
 * expired sessions are surfaced as NEEDS_RECONNECT by the refresh attempt.
 * Idempotent: concurrent calls share one run, and it may be re-invoked after
 * the app comes back online.
 */
export function restoreCloudSessions(): Promise<void> {
  if (inFlightRestore) return inFlightRestore;
  sessionsRestoring$.next(true);
  inFlightRestore = restoreAllCloudSessions().finally(() => {
    sessionsRestoring$.next(false);
    inFlightRestore = null;
  });
  return inFlightRestore;
}

async function restoreAllCloudSessions(): Promise<void> {
  try {
    const db = await database.db;
    const sources = await db.getAll('storageSource');
    await Promise.allSettled(
      sources
        .filter(
          (s) => !s.disconnected && (s.type === StorageKey.GDRIVE || s.type === StorageKey.ONEDRIVE)
        )
        .map(async (s) => {
          try {
            const ok = await StorageOAuthManager.trySilentRefresh(s.name);
            if (ok) {
              scheduleProactiveRefresh(s.name);
            }
          } catch {
            // trySilentRefresh already swallows and logs errors; stay resilient
          }
        })
    );
  } catch (error: any) {
    logger.error(`Cloud session restore failed: ${error?.message}`);
  }
}

/**
 * Resolve the primary sync target when it needs attention: the primary target
 * only, when it needs reconnect or has a deferred sync. Global surfaces
 * (library banner, reader icon, live announcement) stay primary-only so two
 * clouds can never compete for attention; per-source status in Settings still
 * reflects every source, and secondary clouds sync on demand when opened.
 */
export function getExpiredSyncTargets(
  syncTarget: string,
  states: Record<string, StorageConnectionState>,
  pending: Record<string, unknown>
): string[] {
  if (!syncTarget) return [];
  if (states[syncTarget] === StorageConnectionState.NEEDS_RECONNECT || !!pending[syncTarget]) {
    return [syncTarget];
  }
  return [];
}

/**
 * Detects expired-cloud-session failures from error text. Auth failures are
 * surfaced through banner/icon + reconnect affordances (never modals), so
 * error presenters should check this first and stay silent when it matches.
 */
export function isSessionExpiredError(error: unknown) {
  const message = error instanceof Error ? error.message : `${error ?? ''}`;

  return /session expired|needs reconnect|reconnect to resume syncing/i.test(message);
}

export function setConnectionState(storageSourceName: string, state: StorageConnectionState) {
  const current = storageConnectionStates$.getValue();
  if (current[storageSourceName] !== state) {
    storageConnectionStates$.next({
      ...current,
      [storageSourceName]: state
    });
  }
  if (state === StorageConnectionState.CONNECTED) {
    clearPendingCloudSync(storageSourceName);
  } else {
    clearProactiveRefresh(storageSourceName);
  }
}

export interface OAuthTokenData {
  accessToken: string;
  expiration: number;
  scope: string;
  refreshToken?: string;
}

export const PWA_OAUTH_STATE_KEY = 'pwa_oauth_state';

export interface PwaOAuthState {
  storageSourceName: string;
  storageType: StorageKey;
  clientId: string;
  clientSecret?: string;
  sendSecret: boolean;
  tokenEndpoint: string;
  codeVerifier: string;
  oauthState?: string;
  returnUrl: string;
  secret?: string;
  existingStorageSourceData?: any;
  previousEmail?: string;
  setAsSyncTarget?: boolean;
  triggerSyncOnReturn?: boolean;
  timestamp: number;
}

export function getPwaOAuthState(): PwaOAuthState | null {
  try {
    const raw =
      (typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(PWA_OAUTH_STATE_KEY)
        : null) ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem(PWA_OAUTH_STATE_KEY) : null);
    if (!raw) return null;
    const parsed: PwaOAuthState = JSON.parse(raw);
    // Ignore states older than 15 minutes
    if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
      clearPwaOAuthState();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPwaOAuthState() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PWA_OAUTH_STATE_KEY);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PWA_OAUTH_STATE_KEY);
    }
  } catch {
    // no-op
  }
}

export interface StorageAuthOptions {
  /**
   * When false (default for background sync), never open a popup window or
   * show an unlock/login dialog. Instead mark NEEDS_RECONNECT and throw.
   * Pass true only from an explicit user gesture (Reconnect button / banner).
   */
  allowInteractive?: boolean;
}

export const storageOAuthTokens = new Map<string, OAuthTokenData>();

/**
 * Single-flight refresh promises keyed by storage source name. Manager
 * instances are per-handler and handlers are reconfigured per source, so the
 * map must live at module level — otherwise parallel background requests for
 * the same source would fire parallel `/token` exchanges and, under refresh
 * token rotation, all but the first would fail with `invalid_grant`.
 */
const inFlightRefreshes = new Map<string, Promise<OAuthTokenData | undefined>>();

/**
 * Lead time before (buffered) access-token expiry to attempt a silent refresh.
 * Industry consensus is 30-60s clock-skew leeway with proactive refresh
 * minutes before expiry; our stored expiry already subtracts a 600s buffer
 * at issue time, so this 60s scheduling headroom yields ~11min total margin
 * on 1-hour Google tokens — at the conservative end of the 5-10min guidance.
 * No jitter: single-user app, at most a couple of sources per tab.
 */
const proactiveRefreshLeewayMs = 60000;

const proactiveRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearProactiveRefresh(storageSourceName: string) {
  const timer = proactiveRefreshTimers.get(storageSourceName);
  if (timer !== undefined) {
    clearTimeout(timer);
    proactiveRefreshTimers.delete(storageSourceName);
  }
}

/**
 * Schedule a silent token refresh ahead of expiry so background sync rarely
 * hits an expired token. Fires `trySilentRefresh` once; that path never opens
 * popups or dialogs. Rescheduling happens at every token-store site.
 */
export function scheduleProactiveRefresh(storageSourceName: string) {
  clearProactiveRefresh(storageSourceName);
  const token = storageOAuthTokens.get(storageSourceName);
  if (!token) return;

  const delay = token.expiration - Date.now() - proactiveRefreshLeewayMs;
  if (delay <= 0) {
    void StorageOAuthManager.trySilentRefresh(storageSourceName);
    return;
  }

  proactiveRefreshTimers.set(
    storageSourceName,
    setTimeout(() => {
      proactiveRefreshTimers.delete(storageSourceName);
      void StorageOAuthManager.trySilentRefresh(storageSourceName);
    }, delay)
  );
}

export class StorageOAuthManager {
  private storageType: StorageKey;

  private refreshEndpoint;

  private parentWindow: Window | undefined;

  private storageSourceName = '';

  private remoteData: RemoteContext | undefined;

  private authWindow: Window | null = null;

  private codeVerifier = '';

  private authResolver: ((value: OAuthTokenData | PromiseLike<OAuthTokenData>) => void) | undefined;

  private authRejector: ((error: Error) => void) | undefined;

  private rebindedWinHandler: ((event: MessageEvent) => void) | undefined;

  private authCloseIntervalTime = 500;

  private authCloseInterval: number | undefined;

  private authTimeout = 45000;

  private authTimeoutTimer: number | undefined;

  constructor(type: StorageKey, refreshEndpoint: string) {
    this.storageType = type;
    this.refreshEndpoint = refreshEndpoint;
  }

  async getToken(
    window: Window,
    storageSourceName: string,
    askForStorageUnlock: boolean,
    authWindow?: Window | null,
    oldUnlockResult?: StorageUnlockAction,
    oldStorageSource?: BooksDbStorageSource | undefined,
    options?: StorageAuthOptions
  ): Promise<string | undefined> {
    const allowInteractive = options?.allowInteractive ?? !!authWindow;
    const oldToken = storageOAuthTokens.get(storageSourceName);
    const shallUnlock = !oldToken || askForStorageUnlock;

    if (!oldToken || this.storageSourceName !== storageSourceName) {
      this.remoteData = undefined;
      this.storageSourceName = storageSourceName;
    }

    let token = await this.verifyToken(oldToken);

    if (token) {
      return token.accessToken;
    }

    this.remoteData = undefined;

    let secret: string | undefined;
    let unlockResult = oldUnlockResult;
    let storageSource = oldStorageSource;

    if (storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT) {
      this.storageType = StorageKey.GDRIVE;
      this.refreshEndpoint = this.refreshEndpoint || gDriveRefreshEndpoint;
      if (!gDriveClientId) {
        throw new Error(
          'Google Drive OAuth Client ID is not configured (VITE_GDRIVE_CLIENT_ID missing)'
        );
      }
      this.remoteData = {
        clientId: gDriveClientId,
        clientSecret: ''
      };
    } else if (storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT) {
      this.storageType = StorageKey.ONEDRIVE;
      this.refreshEndpoint = this.refreshEndpoint || oneDriveTokenEndpoint;
      const db = await database.db;
      storageSource = (await db.get('storageSource', storageSourceName)) || oldStorageSource;
      const storedContext =
        storageSource && isRemoteContext(storageSource.data) ? storageSource.data : undefined;
      const clientId = oneDriveClientId || storedContext?.clientId;
      if (!clientId) {
        throw new Error(
          'OneDrive OAuth Client ID is not configured (VITE_ONEDRIVE_CLIENT_ID missing)'
        );
      }
      this.remoteData = {
        clientId,
        clientSecret: '',
        refreshToken: storedContext?.refreshToken,
        accountEmail: storedContext?.accountEmail,
        accountName: storedContext?.accountName
      };

      if (this.remoteData.refreshToken) {
        token = await this.verifyToken(token);
        if (token) {
          return token.accessToken;
        }
      }
    } else {
      if (!unlockResult) {
        const db = await database.db;

        storageSource = await db.get('storageSource', storageSourceName);

        if (!storageSource) {
          throw new Error(`No storage source with name ${storageSourceName} found`);
        }

        unlockResult = await unlockStorageData(
          storageSource,
          'You are trying to access protected data',
          shallUnlock
            ? {
                action: `Enter the correct password for ${storageSourceName} and login to your account if required to proceed`,
                encryptedData: storageSource.data,
                forwardSecret: true
              }
            : undefined
        );

        if (!unlockResult) {
          if (!allowInteractive) {
            setConnectionState(storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
            throw new Error(
              `Session expired for "${storageSourceName}". Please reconnect to resume syncing.`
            );
          }
          throw new Error(`Unable to unlock required data`);
        }
      }

      this.remoteData = {
        clientId: unlockResult.clientId,
        clientSecret: unlockResult.clientSecret,
        refreshToken: unlockResult.refreshToken,
        accountEmail: unlockResult.accountEmail,
        accountName: unlockResult.accountName
      };

      token = await this.verifyToken(token);

      if (token) {
        return token.accessToken;
      }

      secret = unlockResult.secret;
    }

    this.parentWindow = window;

    if (authWindow) {
      this.authWindow = authWindow;
      this.authWindow.location.assign(`${pagePath}/auth?reader-init-auth=1`);
    } else if (shallUnlock && allowInteractive) {
      if (this.parentWindow && isStandalonePwa(this.parentWindow)) {
        await StorageOAuthManager.startPwaRedirectAuth(
          this.parentWindow,
          storageSourceName,
          this.storageType,
          unlockResult,
          storageSource,
          {
            setAsSyncTarget: false,
            triggerSyncOnReturn: true
          }
        );
        return undefined;
      }
      this.authWindow = StorageOAuthManager.createWindow(
        `${pagePath}/auth?reader-init-auth=1`,
        'auth',
        Math.min(Math.max(this.parentWindow.innerWidth, 300), 560),
        Math.min(Math.max(this.parentWindow.innerHeight, 300), 560),
        window
      );
    } else {
      this.authWindow = null;
    }

    if (!this.authWindow) {
      if (shallUnlock && allowInteractive) {
        await new Promise<undefined>((resolver) => {
          dialogManager.dialogs$.next([
            {
              component: StorageUnlock,
              props: {
                description: 'You are trying to access external data',
                action: 'Login to your account when prompted',
                requiresSecret: false,
                encryptedData: undefined,
                resolver
              },
              disableCloseOnClick: true
            }
          ]);
        });

        return this.getToken(
          window,
          storageSourceName,
          false,
          StorageOAuthManager.createWindow(
            `${pagePath}/auth?reader-init-wait=1`,
            'auth',
            Math.min(Math.max(this.parentWindow.innerWidth, 300), 560),
            Math.min(Math.max(this.parentWindow.innerHeight, 300), 560),
            window
          ),
          unlockResult,
          storageSource,
          { allowInteractive: true }
        );
      }

      if (!allowInteractive) {
        setConnectionState(storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
        throw new Error(
          `Session expired for "${storageSourceName}". Please reconnect to resume syncing.`
        );
      }

      throw new Error('Unable to open login window. Please check your popup settings');
    }

    let errorMessage = '';

    try {
      const existingStorageSourceData = storageSource || {
        storedInManager: false,
        encryptionDisabled: false
      };

      token = await this.waitForAuth(window);

      storageOAuthTokens.set(storageSourceName, token);
      setConnectionState(storageSourceName, StorageConnectionState.CONNECTED);
      scheduleProactiveRefresh(storageSourceName);

      if (this.remoteData && !this.remoteData.accountEmail && token.accessToken) {
        const account =
          this.storageType === StorageKey.GDRIVE
            ? await StorageOAuthManager.fetchGoogleAccount(token.accessToken)
            : await StorageOAuthManager.fetchOneDriveAccount(token.accessToken);
        if (account.email) {
          this.remoteData.accountEmail = account.email;
          this.remoteData.accountName = account.name;
        }
      }

      const isOneDriveDefault = storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT;
      if (
        this.parentWindow &&
        this.remoteData.clientId &&
        (this.storageType !== StorageKey.GDRIVE || this.remoteData.clientSecret) &&
        token.refreshToken &&
        (token.refreshToken !== this.remoteData.refreshToken || isOneDriveDefault) &&
        (secret || existingStorageSourceData.encryptionDisabled || isOneDriveDefault)
      ) {
        this.remoteData.refreshToken = token.refreshToken;

        try {
          const db = await database.db;
          const contextToStore: RemoteContext = {
            clientId: this.remoteData.clientId,
            clientSecret: this.remoteData.clientSecret,
            refreshToken: token.refreshToken,
            accountEmail: this.remoteData.accountEmail,
            accountName: this.remoteData.accountName
          };
          const shouldDisableEncryption =
            existingStorageSourceData.encryptionDisabled || isOneDriveDefault;
          const newData = shouldDisableEncryption
            ? contextToStore
            : await encrypt(this.parentWindow, JSON.stringify(contextToStore), secret!);

          await db.put('storageSource', {
            ...existingStorageSourceData,
            name: storageSourceName,
            type: this.storageType,
            data: newData,
            encryptionDisabled: shouldDisableEncryption,
            disconnected: false,
            lastSourceModified: Date.now()
          });

          const updatedSources = await db.getAll('storageSource');
          database.storageSourcesChanged$.next(updatedSources);
        } catch (err: any) {
          logger.error(`Error updating refresh token for ${storageSourceName}: ${err.message}`);
        }
      }
    } catch (error: any) {
      errorMessage = error.message;
    } finally {
      // Wipe the secret from memory; the value is intentionally never read afterwards.
      // eslint-disable-next-line no-useless-assignment
      secret = '';
      this.clearAuthData();
    }

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return token?.accessToken;
  }

  private async verifyToken(token: OAuthTokenData | undefined) {
    if (!token && !this.remoteData) {
      return undefined;
    }

    if (token && token.expiration > Date.now()) {
      setConnectionState(this.storageSourceName, StorageConnectionState.CONNECTED);
      return token;
    }

    return this.refreshToken();
  }

  private async refreshToken(): Promise<OAuthTokenData | undefined> {
    const sourceName = this.storageSourceName;
    const inFlight = sourceName ? inFlightRefreshes.get(sourceName) : undefined;
    if (inFlight) {
      return inFlight;
    }

    const refreshPromise = this.doRefreshToken();
    if (sourceName) {
      inFlightRefreshes.set(sourceName, refreshPromise);
    }

    try {
      return await refreshPromise;
    } finally {
      if (sourceName && inFlightRefreshes.get(sourceName) === refreshPromise) {
        inFlightRefreshes.delete(sourceName);
      }
    }
  }

  private async doRefreshToken(): Promise<OAuthTokenData | undefined> {
    if (this.storageSourceName && this.remoteData) {
      try {
        const db = await database.db;
        const sourceRecord = await db.get('storageSource', this.storageSourceName);
        if (
          sourceRecord &&
          sourceRecord.encryptionDisabled &&
          isRemoteContext(sourceRecord.data) &&
          sourceRecord.data.refreshToken
        ) {
          this.remoteData.refreshToken = sourceRecord.data.refreshToken;
          if (sourceRecord.data.clientId) {
            this.remoteData.clientId = sourceRecord.data.clientId;
          }
          if (sourceRecord.data.clientSecret) {
            this.remoteData.clientSecret = sourceRecord.data.clientSecret;
          }
        }
      } catch {
        // Ignore database read error
      }
    }

    if (!(
      this.refreshEndpoint &&
      this.storageSourceName &&
      this.remoteData?.clientId &&
      (this.storageType !== StorageKey.GDRIVE || this.remoteData.clientSecret) &&
      this.remoteData.refreshToken
    )) {
      // Missing credentials/refresh token on an existing source means the
      // session cannot be silently renewed — surface as needing reconnect
      // rather than plain disconnected so background sync defers to in-app UI.
      if (this.storageSourceName && (this.remoteData?.clientId || this.remoteData?.refreshToken)) {
        setConnectionState(this.storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
      }
      return undefined;
    }

    const form = new FormData();
    form.append('client_id', this.remoteData.clientId);
    form.append('refresh_token', this.remoteData.refreshToken);
    form.append('grant_type', 'refresh_token');

    if (this.storageType === StorageKey.GDRIVE) {
      form.append('client_secret', this.remoteData.clientSecret);
    }

    let networkDeferred = false;
    let authErrorOccurred = false;
    const response = await fetch(this.refreshEndpoint, { method: 'POST', body: form })
      .then(async (httpResponse) => {
        if (!httpResponse.ok) {
          throw new Error(await convertAuthErrorResponse(httpResponse));
        }

        return httpResponse.json();
      })
      .catch((error) => {
        // Network-level failure: transient, not an expired grant. Keep the
        // refresh token + connection state so the next online run retries
        // silently instead of forcing a reconnect.
        if (isNetworkUnreachableError(error)) {
          logger.warn(`Token refresh deferred (offline) for ${this.storageSourceName}`);
          markPendingCloudSync(this.storageSourceName, error?.message || 'network unreachable');
          networkDeferred = true;
          return undefined;
        }
        logger.error(`Unable to refresh token for ${this.storageSourceName}: ${error.message}`);
        authErrorOccurred = true;
        return undefined;
      });

    if (!response) {
      // Network deferral above already retained credentials — do not wipe.
      if (networkDeferred) {
        return undefined;
      }

      // Check if another tab refreshed the token while we were requesting
      if (authErrorOccurred && this.storageSourceName && this.remoteData) {
        try {
          const db = await database.db;
          const sourceRecord = await db.get('storageSource', this.storageSourceName);
          if (
            sourceRecord &&
            sourceRecord.encryptionDisabled &&
            isRemoteContext(sourceRecord.data) &&
            sourceRecord.data.refreshToken &&
            sourceRecord.data.refreshToken !== this.remoteData.refreshToken
          ) {
            this.remoteData.refreshToken = sourceRecord.data.refreshToken;
            return this.doRefreshToken();
          }
        } catch {
          // Ignore database read error
        }
      }

      setConnectionState(this.storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
      this.remoteData.refreshToken = undefined;
      return undefined;
    }

    const {
      access_token: accessToken,
      expires_in: expiration,
      scope,
      refresh_token: rotatedRefreshToken
    } = response;

    if (!accessToken || !expiration || !scope) {
      setConnectionState(this.storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
      this.remoteData.refreshToken = undefined;
      logger.error(
        `A required authentication property was not found\nhad token: ${!!accessToken}\nhad expiration: ${!!expiration}\nhad scope: ${!!scope}`
      );
      return undefined;
    }

    const effectiveRefreshToken = rotatedRefreshToken || this.remoteData.refreshToken;
    this.remoteData.refreshToken = effectiveRefreshToken;

    const token: OAuthTokenData = {
      accessToken,
      scope,
      expiration: Date.now() + (Number.parseInt(expiration, 10) - 600) * 1000,
      refreshToken: effectiveRefreshToken
    };

    if (rotatedRefreshToken && this.storageSourceName) {
      try {
        const db = await database.db;
        const sourceRecord = await db.get('storageSource', this.storageSourceName);
        if (sourceRecord && sourceRecord.encryptionDisabled && isRemoteContext(sourceRecord.data)) {
          sourceRecord.data.refreshToken = rotatedRefreshToken;
          sourceRecord.lastSourceModified = Date.now();
          await db.put('storageSource', sourceRecord);

          const updatedSources = await db.getAll('storageSource');
          database.storageSourcesChanged$.next(updatedSources);
        }
      } catch (err: any) {
        logger.warn(
          `Failed to persist rotated refresh token for ${this.storageSourceName}: ${err?.message}`
        );
      }
    }

    storageOAuthTokens.set(this.storageSourceName, token);
    setConnectionState(this.storageSourceName, StorageConnectionState.CONNECTED);
    scheduleProactiveRefresh(this.storageSourceName);

    return token;
  }

  static base64Url(buffer: ArrayBuffer | Uint8Array, win?: Window) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const winObj = win || (typeof window !== 'undefined' ? window : null);
    if (winObj) {
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      return winObj.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return Buffer.from(bytes).toString('base64url');
  }

  private waitForAuth(window: Window): Promise<OAuthTokenData> {
    return new Promise((resolve, reject) => {
      if (!this.parentWindow) {
        reject(new Error('Parent window not defined'));
        return;
      }

      this.authResolver = resolve;
      this.authRejector = reject;
      this.rebindedWinHandler = this.winHandler.bind(this);
      this.parentWindow.addEventListener('message', this.rebindedWinHandler, false);

      this.authCloseInterval = window.setInterval(() => {
        if (this.authWindow?.closed) {
          reject(new Error('Window was closed before login'));
        }
      }, this.authCloseIntervalTime);

      this.authTimeoutTimer = window.setTimeout(() => {
        reject(new Error('Login timeout'));
      }, this.authTimeout);
    });
  }

  private async winHandler(event: MessageEvent) {
    if (
      !this.parentWindow ||
      !this.remoteData ||
      event.source !== this.authWindow ||
      !this.authResolver ||
      !this.authRejector
    ) {
      return;
    }

    switch (event.data.type) {
      case 'getAuthVariables':
        event.ports[0].postMessage({
          result: {
            ...this.remoteData,
            ...StorageOAuthManager.getAuthVariables(this.storageType),
            sendSecret:
              this.storageType === StorageKey.GDRIVE && !isAppDefault(this.storageSourceName)
          }
        });
        break;
      case 'auth':
        this.authResolver(event.data.payload);
        break;
      case 'getCodeChallenge':
        if (!this.codeVerifier) {
          const arr = new Uint8Array(32);

          this.parentWindow.crypto.getRandomValues(arr);
          this.codeVerifier = StorageOAuthManager.base64Url(arr, this.parentWindow);
        }

        event.ports[0].postMessage({
          result: StorageOAuthManager.base64Url(
            await this.parentWindow.crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(this.codeVerifier)
            ),
            this.parentWindow
          )
        });
        break;
      case 'getCodeVerifier':
        event.ports[0].postMessage({
          result: this.codeVerifier
        });
        break;
      case 'failure':
        logger.error(event.data.payload.detail);
        this.authRejector(new Error(event.data.payload.message));
        break;

      default:
        break;
    }
  }

  private clearAuthData() {
    clearTimeout(this.authTimeoutTimer);
    clearInterval(this.authCloseInterval);

    if (this.parentWindow && this.rebindedWinHandler) {
      this.parentWindow.removeEventListener('message', this.rebindedWinHandler, false);
    }

    try {
      // Ask the popup to close itself first: a popup can often honor its own
      // window.close() even when the parent can no longer close it (e.g. a
      // Firefox Android home-screen Custom Tab). The parent close below is
      // kept for regular browser popups.
      const targetOrigin = this.parentWindow?.location.origin;
      if (targetOrigin) {
        try {
          this.authWindow?.postMessage({ type: 'close' }, targetOrigin);
        } catch {
          // no-op: the popup may already have navigated away
        }
      }
      if (!this.authWindow?.closed) {
        this.authWindow?.close();
      }
    } catch (_) {
      // no-op
    }

    this.authResolver = undefined;
    this.authRejector = undefined;
    this.rebindedWinHandler = undefined;
    this.parentWindow = undefined;
    this.authWindow = null;
    this.codeVerifier = '';
  }

  static createWindow(url: string, title: string, w: number, h: number, window: Window) {
    const onMobile = isMobile(window);
    const screenX = typeof window.screenX !== 'undefined' ? window.screenX : window.screenLeft;
    const screenY = typeof window.screenY !== 'undefined' ? window.screenY : window.screenTop;
    const outerWidth =
      typeof window.outerWidth !== 'undefined'
        ? window.outerWidth
        : document.documentElement.clientWidth;
    const outerHeight =
      typeof window.outerHeight !== 'undefined'
        ? window.outerHeight
        : document.documentElement.clientHeight - 22;
    const targetWidth = onMobile ? null : w;
    const targetHeight = onMobile ? null : h;
    const V = screenX < 0 ? window.screen.width + screenX : screenX;
    const left = targetWidth ? parseInt(`${V + (outerWidth - targetWidth) / 2}`, 10) : 0;
    const right = targetHeight
      ? parseInt(`${screenY + (outerHeight - targetHeight) / 2.5}`, 10)
      : 0;
    const features = [];

    if (targetWidth !== null) {
      features.push(`width=${targetWidth}`);
    }

    if (targetHeight !== null) {
      features.push(`height=${targetHeight}`);
    }

    features.push(`left=${left}`);
    features.push(`top=${right}`);
    features.push('scrollbars=1');

    const newWindow = window.open(url, title, features.join(','));

    return newWindow;
  }

  static getAuthVariables(target: StorageKey) {
    switch (target) {
      case StorageKey.GDRIVE:
        return {
          authEndpoint: gDriveAuthEndpoint,
          tokenEndpoint: gDriveTokenEndpoint,
          scope: gDriveScope
        };

      case StorageKey.ONEDRIVE:
        return {
          authEndpoint: oneDriveAuthEndpoint,
          tokenEndpoint: oneDriveTokenEndpoint,
          scope: oneDriveScope
        };

      default:
        return {};
    }
  }

  static revokeToken(revokeEndpoint: string, token: string) {
    const params = new URLSearchParams();

    params.append('token', token);

    fetch(`${revokeEndpoint}?${params.toString()}`, { method: 'POST' }).catch(() => {
      // no-op
    });
  }

  static async fetchGoogleAccount(accessToken: string): Promise<{ email?: string; name?: string }> {
    try {
      const res = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      if (res.ok) {
        const json = await res.json();
        return {
          email: json.user?.emailAddress,
          name: json.user?.displayName
        };
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch Google Drive account info: ${err.message}`);
    }
    return {};
  }

  static async fetchOneDriveAccount(
    accessToken: string
  ): Promise<{ email?: string; name?: string }> {
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (res.ok) {
        const json = await res.json();
        return {
          email: json.userPrincipalName || json.mail,
          name: json.displayName
        };
      }
    } catch (err: any) {
      logger.warn(`Failed to fetch OneDrive account info: ${err.message}`);
    }
    return {};
  }

  /**
   * Open a blank auth window synchronously inside a user-gesture handler
   * (click/tap) so iOS/Safari does not block it as a popup. The caller must
   * pass the returned window into `reconnect()`; `getToken()` will then
   * navigate it to the provider. Returns null when blocked.
   */
  static openAuthWindowSync(window: Window): Window | null {
    if (isStandalonePwa(window)) {
      return null;
    }
    return StorageOAuthManager.createWindow(
      `${pagePath}/auth?reader-init-wait=1`,
      'auth',
      Math.min(Math.max(window.innerWidth, 300), 560),
      Math.min(Math.max(window.innerHeight, 300), 560),
      window
    );
  }

  /**
   * Attempt a fully silent token renewal: no popups, no unlock dialogs.
   * Used by the proactive refresh scheduler and safe to call from timers.
   * Returns true when a usable access token is cached afterwards.
   */
  static async trySilentRefresh(storageSourceName: string): Promise<boolean> {
    try {
      if (!storageSourceName) return false;

      let storageSourceType = StorageKey.GDRIVE;
      let refreshEndpoint = gDriveRefreshEndpoint;
      let remoteData: RemoteContext | undefined;

      if (isAppDefault(storageSourceName)) {
        if (storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT) {
          if (!gDriveClientId) return false;
          remoteData = { clientId: gDriveClientId, clientSecret: '' };
        } else if (storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT) {
          const db = await database.db;
          const storageSource = await db.get('storageSource', storageSourceName);
          if (!storageSource || storageSource.disconnected) return false;
          const storedContext =
            storageSource && isRemoteContext(storageSource.data) ? storageSource.data : undefined;
          const clientId = oneDriveClientId || storedContext?.clientId;
          if (!clientId || !storedContext?.refreshToken) return false;
          storageSourceType = StorageKey.ONEDRIVE;
          refreshEndpoint = oneDriveTokenEndpoint;
          remoteData = {
            clientId,
            clientSecret: '',
            refreshToken: storedContext.refreshToken,
            accountEmail: storedContext.accountEmail,
            accountName: storedContext.accountName
          };
        } else {
          return false;
        }
      } else {
        const db = await database.db;
        const storageSource = await db.get('storageSource', storageSourceName);
        if (
          !storageSource ||
          (storageSource.type !== StorageKey.GDRIVE && storageSource.type !== StorageKey.ONEDRIVE)
        ) {
          return false;
        }

        storageSourceType = storageSource.type;
        refreshEndpoint =
          storageSource.type === StorageKey.GDRIVE ? gDriveRefreshEndpoint : oneDriveTokenEndpoint;

        // Silent only: no unlock props, so this resolves from the password
        // manager / unencrypted context or returns undefined without a dialog.
        const unlockResult = await unlockStorageData(
          storageSource,
          'Proactive token refresh',
          undefined
        );
        if (!unlockResult) return false;

        remoteData = {
          clientId: unlockResult.clientId,
          clientSecret: unlockResult.clientSecret,
          refreshToken: unlockResult.refreshToken,
          accountEmail: unlockResult.accountEmail,
          accountName: unlockResult.accountName
        };
      }

      const manager = new StorageOAuthManager(storageSourceType, refreshEndpoint);
      manager.storageSourceName = storageSourceName;
      manager.remoteData = remoteData;

      const token = await manager.verifyToken(storageOAuthTokens.get(storageSourceName));
      return !!token;
    } catch (error: any) {
      logger.error(`Silent refresh failed for ${storageSourceName}: ${error?.message}`);
      return false;
    }
  }

  /**
   * PWA same-window redirect OAuth: instead of opening a child popup that
   * cannot be closed on mobile browsers (e.g. Firefox for Android Custom Tabs
   * / standalone activities), save the pending auth context in sessionStorage
   * and navigate top-level window directly to the provider's authorization endpoint.
   */
  static async startPwaRedirectAuth(
    window: Window,
    storageSourceName: string,
    storageSourceType: StorageKey,
    unlockResult?: StorageUnlockAction,
    storageSource?: BooksDbStorageSource,
    options?: {
      setAsSyncTarget?: boolean;
      triggerSyncOnReturn?: boolean;
    }
  ): Promise<never> {
    const isDefault = isAppDefault(storageSourceName);
    let clientId: string;
    let clientSecret: string | undefined;

    if (isDefault) {
      const storedClientId =
        storageSource && isRemoteContext(storageSource.data)
          ? storageSource.data.clientId
          : undefined;
      clientId =
        storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT
          ? gDriveClientId
          : oneDriveClientId || storedClientId || '';
      clientSecret =
        storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT
          ? gDriveClientSecret
          : oneDriveClientSecret;
    } else {
      clientId = unlockResult?.clientId || '';
      clientSecret = unlockResult?.clientSecret || '';
    }

    const authVars = StorageOAuthManager.getAuthVariables(storageSourceType);
    const sendSecret = storageSourceType === StorageKey.GDRIVE && !isAppDefault(storageSourceName);

    const arr = new Uint8Array(32);
    window.crypto.getRandomValues(arr);
    const codeVerifier = StorageOAuthManager.base64Url(arr, window);
    const digest = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(codeVerifier)
    );
    const codeChallenge = StorageOAuthManager.base64Url(digest, window);

    const redirectUri = `${window.location.origin}${pagePath}/auth`;
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('redirect_uri', redirectUri);
    if (authVars.scope) {
      params.append('scope', authVars.scope);
    }

    // Option A (OAuth 2.1): public SPA/PWA clients always use Authorization
    // Code + PKCE — never the deprecated implicit `response_type=token`.
    // `client_secret` is only sent on the back-channel token exchange for
    // confidential custom GDrive clients (see sendSecret); the authorize
    // redirect itself never needs a secret.
    if (!authVars.tokenEndpoint) {
      throw new Error(`No token endpoint configured for storage source "${storageSourceName}"`);
    }

    params.append('response_type', 'code');
    params.append('access_type', 'offline');
    params.append('code_challenge_method', 'S256');
    params.append('code_challenge', codeChallenge);
    params.append('prompt', 'consent');

    const stateArr = new Uint8Array(16);
    window.crypto.getRandomValues(stateArr);
    const oauthState = StorageOAuthManager.base64Url(stateArr, window);
    params.append('state', oauthState);

    const stateData: PwaOAuthState = {
      storageSourceName,
      storageType: storageSourceType,
      clientId,
      clientSecret: clientSecret || undefined,
      sendSecret,
      tokenEndpoint: authVars.tokenEndpoint || '',
      codeVerifier,
      oauthState,
      returnUrl: window.location.pathname + window.location.search + window.location.hash,
      secret: unlockResult?.secret,
      existingStorageSourceData: storageSource,
      previousEmail: unlockResult?.accountEmail,
      setAsSyncTarget: options?.setAsSyncTarget ?? false,
      triggerSyncOnReturn: options?.triggerSyncOnReturn ?? true,
      timestamp: Date.now()
    };

    try {
      sessionStorage.setItem(PWA_OAUTH_STATE_KEY, JSON.stringify(stateData));
    } catch {
      // no-op
    }
    try {
      localStorage.setItem(PWA_OAUTH_STATE_KEY, JSON.stringify(stateData));
    } catch {
      // no-op
    }

    window.location.assign(`${authVars.authEndpoint}?${params.toString()}`);
    return new Promise<never>(() => {});
  }

  static async reconnect(
    window: Window,
    storageSourceName: string,
    preOpenedWindow?: Window | null,
    options?: {
      setAsSyncTarget?: boolean;
      enableAutoSync?: boolean;
    }
  ): Promise<boolean> {
    // Close a caller-pre-opened window when bailing out early so no stray
    // blank tab is left behind (e.g. unconfigured provider, cancelled unlock).
    const abortPreOpened = () => {
      try {
        if (preOpenedWindow && !preOpenedWindow.closed) {
          preOpenedWindow.close();
        }
      } catch {
        // no-op
      }
    };

    const isDefault = isAppDefault(storageSourceName);
    let storageSourceType = StorageKey.GDRIVE;
    let refreshEndpoint = gDriveRefreshEndpoint;
    let storageSource: BooksDbStorageSource | undefined;
    let unlockResult: StorageUnlockAction | undefined;

    if (isDefault) {
      if (storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT && !storageSource) {
        const db = await database.db;
        storageSource = await db.get('storageSource', storageSourceName);
      }
      const storedClientId =
        storageSource && isRemoteContext(storageSource.data)
          ? storageSource.data.clientId
          : undefined;
      const missingClientId =
        (storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT && !gDriveClientId) ||
        (storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT &&
          !oneDriveClientId &&
          !storedClientId);

      if (missingClientId) {
        const providerName =
          storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT ? 'Google Drive' : 'OneDrive';
        const envVar =
          storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT
            ? 'VITE_GDRIVE_CLIENT_ID'
            : 'VITE_ONEDRIVE_CLIENT_ID';
        dialogManager.dialogs$.next([
          {
            component: MessageDialog,
            props: {
              title: `${providerName} Setup Required`,
              message: `${providerName} OAuth Client ID is not configured.\n\nPlease set ${envVar} in your environment or add a custom storage source with your own credentials in the Advanced section below.`
            },
            disableCloseOnClick: true
          }
        ]);
        abortPreOpened();
        return false;
      }

      if (storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT) {
        storageSourceType = StorageKey.ONEDRIVE;
        refreshEndpoint = oneDriveTokenEndpoint;
      }
    } else {
      const db = await database.db;
      storageSource = await db.get('storageSource', storageSourceName);

      if (!storageSource) {
        logger.error(`Storage source ${storageSourceName} not found for reconnect`);
        abortPreOpened();
        return false;
      }

      if (storageSource.type !== StorageKey.GDRIVE && storageSource.type !== StorageKey.ONEDRIVE) {
        logger.error(`Cannot reconnect non-cloud storage source ${storageSourceName}`);
        abortPreOpened();
        return false;
      }

      storageSourceType = storageSource.type;
      refreshEndpoint =
        storageSource.type === StorageKey.GDRIVE ? gDriveRefreshEndpoint : oneDriveTokenEndpoint;

      unlockResult = await unlockStorageData(
        storageSource,
        'You are trying to reconnect cloud storage',
        {
          action: `Enter the password for ${storageSourceName} to reconnect`,
          encryptedData: storageSource.data,
          forwardSecret: true
        }
      );

      if (!unlockResult) {
        abortPreOpened();
        return false;
      }
    }

    if (isStandalonePwa(window)) {
      abortPreOpened();
      await StorageOAuthManager.startPwaRedirectAuth(
        window,
        storageSourceName,
        storageSourceType,
        unlockResult,
        storageSource,
        {
          setAsSyncTarget: options?.setAsSyncTarget ?? false,
          triggerSyncOnReturn: true
        }
      );
      return false;
    }

    const authWindow =
      preOpenedWindow ||
      StorageOAuthManager.createWindow(
        `${pagePath}/auth?reader-init-auth=1`,
        'auth',
        Math.min(Math.max(window.innerWidth, 300), 560),
        Math.min(Math.max(window.innerHeight, 300), 560),
        window
      );

    if (!authWindow) {
      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Popup Blocked',
            message: 'Unable to open login window. Please check your browser popup settings.'
          },
          disableCloseOnClick: true
        }
      ]);
      return false;
    }

    const manager = new StorageOAuthManager(storageSourceType, refreshEndpoint);

    try {
      const accessToken = await manager.getToken(
        window,
        storageSourceName,
        false,
        authWindow,
        unlockResult,
        storageSource,
        { allowInteractive: true }
      );

      if (!accessToken) {
        return false;
      }

      const previousEmail =
        unlockResult?.accountEmail ||
        (storageSource && isRemoteContext(storageSource.data)
          ? storageSource.data.accountEmail
          : undefined);

      const accountInfo = {
        email: manager.remoteData?.accountEmail || unlockResult?.accountEmail,
        name: manager.remoteData?.accountName || unlockResult?.accountName
      };

      if (!accountInfo.email) {
        const fetched =
          storageSourceType === StorageKey.GDRIVE
            ? await StorageOAuthManager.fetchGoogleAccount(accessToken)
            : await StorageOAuthManager.fetchOneDriveAccount(accessToken);
        accountInfo.email = fetched.email;
        accountInfo.name = fetched.name;
      }

      if (
        previousEmail &&
        accountInfo.email &&
        previousEmail.trim().toLowerCase() !== accountInfo.email.trim().toLowerCase()
      ) {
        const wasCanceled = await new Promise<boolean>((resolve) => {
          dialogManager.dialogs$.next([
            {
              component: ConfirmDialog,
              props: {
                dialogHeader: 'Account Mismatch Warning',
                dialogMessage: `This storage source was previously linked to "${previousEmail}", but you just authenticated as "${accountInfo.email}".\n\nConnecting a different account may cause books, reading progress, and statistics to be mixed across accounts.\n\nDo you want to switch accounts to "${accountInfo.email}"?`,
                contentStyles: 'white-space: pre-line;',
                resolver: resolve
              },
              disableCloseOnClick: true
            }
          ]);
        });

        if (wasCanceled) {
          const tokenData = storageOAuthTokens.get(storageSourceName);
          if (tokenData?.refreshToken && storageSourceType === StorageKey.GDRIVE) {
            StorageOAuthManager.revokeToken(gDriveRevokeEndpoint, tokenData.refreshToken);
          }
          storageOAuthTokens.delete(storageSourceName);
          setConnectionState(storageSourceName, StorageConnectionState.DISCONNECTED);
          return false;
        }
      }

      if (storageSource && unlockResult) {
        const tokenData = storageOAuthTokens.get(storageSourceName);
        if (tokenData?.refreshToken) {
          const db = await database.db;
          const updatedContext: RemoteContext = {
            clientId: unlockResult.clientId,
            clientSecret: unlockResult.clientSecret,
            refreshToken: tokenData.refreshToken,
            accountEmail: accountInfo.email || unlockResult.accountEmail,
            accountName: accountInfo.name || unlockResult.accountName
          };

          const newData = storageSource.encryptionDisabled
            ? updatedContext
            : await encrypt(window, JSON.stringify(updatedContext), unlockResult.secret || '');

          await db.put('storageSource', {
            ...storageSource,
            data: newData,
            disconnected: false,
            lastSourceModified: Date.now()
          });
        }
      }

      setConnectionState(storageSourceName, StorageConnectionState.CONNECTED);

      const db = await database.db;
      const updatedSources = await db.getAll('storageSource');
      database.storageSourcesChanged$.next(updatedSources);

      return true;
    } catch (err: any) {
      logger.error(`Reconnect failed for ${storageSourceName}: ${err.message}`);
      setConnectionState(storageSourceName, StorageConnectionState.NEEDS_RECONNECT);
      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Reconnect Failed',
            message: `Failed to reconnect ${storageSourceName}: ${err.message}`
          },
          disableCloseOnClick: true
        }
      ]);
      return false;
    }
  }

  static async disconnectOtherCloudSources(currentSourceName: string) {
    const sourcesToDisconnect = new Set<string>();

    if (
      currentSourceName !== StorageSourceDefault.GDRIVE_DEFAULT &&
      (storageOAuthTokens.has(StorageSourceDefault.GDRIVE_DEFAULT) ||
        storageConnectionStates$.getValue()[StorageSourceDefault.GDRIVE_DEFAULT] ===
          StorageConnectionState.CONNECTED)
    ) {
      sourcesToDisconnect.add(StorageSourceDefault.GDRIVE_DEFAULT);
    }

    if (
      currentSourceName !== StorageSourceDefault.ONEDRIVE_DEFAULT &&
      (storageOAuthTokens.has(StorageSourceDefault.ONEDRIVE_DEFAULT) ||
        storageConnectionStates$.getValue()[StorageSourceDefault.ONEDRIVE_DEFAULT] ===
          StorageConnectionState.CONNECTED)
    ) {
      sourcesToDisconnect.add(StorageSourceDefault.ONEDRIVE_DEFAULT);
    }

    try {
      const db = await database.db;
      const allSources = await db.getAll('storageSource');
      for (const src of allSources) {
        if (
          src.name !== currentSourceName &&
          (src.type === StorageKey.GDRIVE || src.type === StorageKey.ONEDRIVE) &&
          (!src.disconnected || storageOAuthTokens.has(src.name))
        ) {
          sourcesToDisconnect.add(src.name);
        }
      }
    } catch (_) {
      // Ignore database read errors
    }

    for (const name of sourcesToDisconnect) {
      await StorageOAuthManager.disconnect(name, true);
    }
  }

  static async disconnect(storageSourceName: string, skipConfirmation = false): Promise<boolean> {
    if (!skipConfirmation) {
      const wasCanceled = await new Promise<boolean>((resolve) => {
        dialogManager.dialogs$.next([
          {
            component: ConfirmDialog,
            props: {
              dialogHeader: 'Disconnect Storage Source',
              dialogMessage: `Are you sure you want to disconnect "${storageSourceName}"?\n\nYour local books and remote cloud files will remain completely safe. You can reconnect at any time.`,
              contentStyles: 'white-space: pre-line;',
              resolver: resolve
            },
            disableCloseOnClick: true
          }
        ]);
      });

      if (wasCanceled) {
        return false;
      }
    }

    const isDefault = isAppDefault(storageSourceName);

    if (!isDefault) {
      const db = await database.db;
      const storageSource = await db.get('storageSource', storageSourceName);

      if (storageSource) {
        let unlockResult: StorageUnlockAction | undefined;

        try {
          unlockResult = await unlockStorageData(storageSource, 'Unlinking storage session', {
            requiresSecret: false,
            encryptedData: storageSource.data
          });
        } catch (_) {
          // Continue even if silent unlock fails
        }

        const refreshTokenToRevoke =
          unlockResult?.refreshToken || storageOAuthTokens.get(storageSourceName)?.refreshToken;

        if (refreshTokenToRevoke && storageSource.type === StorageKey.GDRIVE) {
          StorageOAuthManager.revokeToken(gDriveRevokeEndpoint, refreshTokenToRevoke);
        }

        if (unlockResult) {
          const updatedContext: RemoteContext = {
            clientId: unlockResult.clientId,
            clientSecret: unlockResult.clientSecret,
            refreshToken: '',
            accountEmail: unlockResult.accountEmail,
            accountName: unlockResult.accountName
          };

          const newData = storageSource.encryptionDisabled
            ? updatedContext
            : unlockResult.secret
              ? await encrypt(window, JSON.stringify(updatedContext), unlockResult.secret)
              : storageSource.data;

          await db.put('storageSource', {
            ...storageSource,
            data: newData,
            disconnected: true,
            lastSourceModified: Date.now()
          });
        } else {
          await db.put('storageSource', {
            ...storageSource,
            disconnected: true,
            lastSourceModified: Date.now()
          });
        }
      }
    } else {
      const tokenData = storageOAuthTokens.get(storageSourceName);
      if (tokenData?.refreshToken && storageSourceName === StorageSourceDefault.GDRIVE_DEFAULT) {
        StorageOAuthManager.revokeToken(gDriveRevokeEndpoint, tokenData.refreshToken);
      }
      if (storageSourceName === StorageSourceDefault.ONEDRIVE_DEFAULT) {
        const db = await database.db;
        await db.delete('storageSource', storageSourceName);
      }
    }

    storageOAuthTokens.delete(storageSourceName);
    setConnectionState(storageSourceName, StorageConnectionState.DISCONNECTED);

    if (syncTarget$.getValue() === storageSourceName) {
      syncTarget$.next('');
    }

    const db = await database.db;
    const updatedSources = await db.getAll('storageSource');
    database.storageSourcesChanged$.next(updatedSources);

    return true;
  }
}

export function getConnectionState(
  storageSourceName: string,
  storageSource?: BooksDbStorageSource
): StorageConnectionState {
  const stateMap = storageConnectionStates$.getValue();
  if (stateMap[storageSourceName]) {
    return stateMap[storageSourceName];
  }

  if (storageSource) {
    if (storageSource.type !== StorageKey.GDRIVE && storageSource.type !== StorageKey.ONEDRIVE) {
      return StorageConnectionState.CONNECTED;
    }

    if (storageSource.disconnected) {
      return StorageConnectionState.DISCONNECTED;
    }

    const token = storageOAuthTokens.get(storageSourceName);
    if (token && token.expiration > Date.now()) {
      return StorageConnectionState.CONNECTED;
    }

    if (storageSource.encryptionDisabled && isRemoteContext(storageSource.data)) {
      if (!storageSource.data.refreshToken) {
        return StorageConnectionState.DISCONNECTED;
      }
      return StorageConnectionState.NEEDS_RECONNECT;
    }

    return StorageConnectionState.DISCONNECTED;
  }

  const defaultToken = storageOAuthTokens.get(storageSourceName);
  if (defaultToken && defaultToken.expiration > Date.now()) {
    return StorageConnectionState.CONNECTED;
  }

  return StorageConnectionState.DISCONNECTED;
}
