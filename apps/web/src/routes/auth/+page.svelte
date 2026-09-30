<script lang="ts">
  import { browser } from '$app/environment';
  import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
  import { BookLoader } from '@custom-ereader/ui';
  import { loaderMode$, syncTarget$ } from '$lib/data/store';
  import { gDriveRevokeEndpoint } from '$lib/data/env';
  import {
    convertAuthErrorResponse,
    NETWORK_UNREACHABLE_MESSAGE,
    isNetworkUnreachableError
  } from '$lib/functions/replication/error-handler';
  import {
    StorageOAuthManager,
    getPwaOAuthState,
    clearPwaOAuthState,
    storageOAuthTokens,
    setConnectionState,
    StorageConnectionState,
    type PwaOAuthState,
    type OAuthTokenData
  } from '$lib/data/storage/storage-oauth-manager';
  import { StorageKey } from '$lib/data/storage/storage-types';
  import { database, clearPendingCloudSync } from '$lib/data/store';
  import {
    encrypt,
    setStorageSourceDefault,
    type RemoteContext
  } from '$lib/data/storage/storage-source-manager';
  import Fa from 'svelte-fa';

  let errorMessage = '';
  let signedIn = false;
  let closeListenerAttached = false;
  let pwaState: PwaOAuthState | null = null;
  let mismatchWarning = false;
  let mismatchPreviousEmail = '';
  let mismatchCurrentEmail = '';
  let mismatchPendingAction: (() => Promise<void>) | null = null;
  let mismatchCancelAction: (() => void) | null = null;

  $: if (browser) {
    pwaState = getPwaOAuthState();
    attachCloseListener();
    handleAuthRequest().catch((error: any) => {
      try {
        reportError(
          window.location.origin,
          'Sign-in setup failed',
          error?.message || String(error)
        );
      } catch {
        errorMessage = 'Sign-in setup failed';
      }
    });
  }

  /**
   * Honor a parent-initiated close: after the app receives the token it posts
   * {type:'close'} (see StorageOAuthManager.clearAuthData). A popup can often
   * close itself even when the parent can no longer close it — e.g. a Firefox
   * Android home-screen launch opens the auth page in a Custom Tab that the
   * parent's window.close() cannot dismiss, leaving "Completing sign-in…"
   * stuck on screen until the user closes it manually.
   */
  function attachCloseListener() {
    if (closeListenerAttached) {
      return;
    }
    closeListenerAttached = true;
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'close') {
        try {
          window.close();
        } catch {
          // no-op: the fallback "Signed in" UI below lets the user close manually
        }
      }
    });
  }

  async function handleAuthRequest() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.substring(1));
    const hashError =
      hashParams.has('error_description') ||
      hashParams.has('error') ||
      url.searchParams.has('error_description') ||
      url.searchParams.has('error');
    const redirectUri = `${url.origin}${url.pathname}`;

    if (hashError) {
      reportError(
        url.origin,
        'Authorization failed',
        hashParams.get('error_description') ||
          hashParams.get('error') ||
          url.searchParams.get('error_description') ||
          url.searchParams.get('error') ||
          'Unknown error'
      );
    } else if (url.searchParams.has('code')) {
      const params = new URLSearchParams();
      let clientId: string;
      let clientSecret: string | undefined;
      let sendSecret: boolean;
      let tokenEndpoint: string;
      let codeVerifier: string;

      if (window.opener) {
        const authVars = await getDataFromOpener(url.origin, {
          type: 'getAuthVariables'
        });
        clientId = authVars.clientId;
        clientSecret = authVars.clientSecret;
        sendSecret = authVars.sendSecret;
        tokenEndpoint = authVars.tokenEndpoint;
        codeVerifier = await getDataFromOpener(url.origin, { type: 'getCodeVerifier' });
      } else if (pwaState) {
        // CSRF check for same-window redirects: the provider must echo the
        // `state` we stored before leaving. Old states predate this field,
        // so only enforce when both sides present.
        const returnedState = url.searchParams.get('state');
        if (pwaState.oauthState && returnedState && returnedState !== pwaState.oauthState) {
          reportError(
            url.origin,
            'Authorization failed',
            'State mismatch — the sign-in response did not match this device request.\n\nPlease return to the app and retry sync.'
          );
          return undefined;
        }
        clientId = pwaState.clientId;
        clientSecret = pwaState.clientSecret;
        sendSecret = pwaState.sendSecret;
        tokenEndpoint = pwaState.tokenEndpoint;
        codeVerifier = pwaState.codeVerifier;
      } else {
        throw new Error(
          'The login window lost connection to the app (e.g. it was opened in a separate browser tab via "Open in Firefox").\n\nPlease close this window and retry sync from the app.'
        );
      }

      params.append('grant_type', 'authorization_code');
      params.append('redirect_uri', redirectUri);
      params.append('client_id', clientId);

      if (sendSecret && clientSecret) {
        params.append('client_secret', clientSecret);
      }

      params.append('code', url.searchParams.get('code') || '');
      params.append('code_verifier', codeVerifier);

      fetch(tokenEndpoint, {
        method: 'POST',
        body: params.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await convertAuthErrorResponse(response));
          }

          return response.json();
        })
        .then((tokenData) => {
          void checkAuthResponse(
            url.origin,
            tokenData.access_token,
            tokenData.expires_in,
            tokenData.scope,
            true,
            tokenData.refresh_token
          );
        })
        .catch((error) => {
          const detail = isNetworkUnreachableError(error)
            ? NETWORK_UNREACHABLE_MESSAGE
            : error.message;
          reportError(url.origin, 'Code authorization request failed', detail);
        });
    } else if (hashParams.has('access_token')) {
      // Legacy implicit flow is retired (OAuth 2.1). Public clients must use
      // Authorization Code + PKCE. If a provider still returns a fragment
      // token (stale bookmark / cached provider page), force a fresh retry
      // instead of persisting a session with no refresh_token that would
      // silently die on the next reload.
      reportError(
        url.origin,
        'Legacy sign-in flow no longer supported',
        'The app received an implicit access token without a refresh token.\n\nPlease return to the app and retry sync to use the secure Authorization Code flow.'
      );
    } else if (url.searchParams.has('ttu-init-auth')) {
      const params = new URLSearchParams();

      const { clientId, clientSecret, authEndpoint, tokenEndpoint, scope } =
        await getDataFromOpener(url.origin, { type: 'getAuthVariables' });

      if (!clientId || !scope || !authEndpoint) {
        return reportError(
          url.origin,
          'A required authentication input was not found',
          `ClientId: ${!!clientId}\nScope: ${!!scope}\nAuthEndpoint: ${!!authEndpoint}`
        );
      }

      params.append('client_id', clientId);
      params.append('redirect_uri', redirectUri);
      params.append('scope', scope);

      // Option A: popups use the same Code + PKCE flow as PWA redirects.
      // Never fall back to implicit `response_type=token`.
      if (tokenEndpoint) {
        params.append('response_type', 'code');
        params.append('access_type', 'offline');
        params.append('code_challenge_method', 'S256');
        params.append(
          'code_challenge',
          await getDataFromOpener(url.origin, { type: 'getCodeChallenge' })
        );
        params.append('prompt', 'consent');
      } else {
        params.append('response_type', 'token');
      }

      window.location.assign(`${authEndpoint}?${params.toString()}`);
    } else if (url.searchParams.has('ttu-init-wait')) {
      // idle until location reassign for iOS workaround of blocking popups in async context
    } else {
      reportError(
        url.origin,
        'Unexpected authentication context',
        `Url: ${url.href}\nHash: ${url.hash || '-'}`
      );
    }

    return undefined;
  }

  function reportError(origin: string, baseError: string, detail: string) {
    errorMessage = `${baseError}\n${detail}`;

    if (!window.opener) {
      return;
    }

    window.opener.postMessage(
      {
        type: 'failure',
        payload: {
          message: baseError,
          detail: `${baseError}\n${detail}`
        }
      },
      origin
    );
  }

  async function checkAuthResponse(
    origin: string,
    accessToken: string | null,
    expiration: string | null,
    scope: string | null,
    withRefreshToken = false,
    refreshToken?: string | null
  ) {
    // Do not hard-require refresh_token here: the PWA persist step produces
    // the actionable "no refresh token" error (offline_access / SPA guidance)
    // and can fall back to a previously stored refresh for returning users.
    if (!accessToken || !expiration || !scope) {
      reportError(
        origin,
        'A required authentication property was not found',
        `Had Token: ${!!accessToken}\nHad Expiration: ${!!expiration}\nHad Scope"${!!scope}${
          withRefreshToken ? `\nHad Refresh Token"${!!refreshToken}` : ''
        }`
      );
      return;
    }

    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'auth',
          payload: {
            accessToken,
            scope,
            expiration: Date.now() + (Number.parseInt(expiration, 10) - 600) * 1000,
            refreshToken
          }
        },
        origin
      );

      // The token is now with the app: try to get out of the way immediately so
      // the popup only flashes briefly (non-PWA behavior). Where the parent can
      // no longer close us (e.g. Firefox Android Custom Tabs), this self-close
      // is the only programmatic dismiss; if it fails, the "Signed in" fallback
      // below lets the user close manually.
      signedIn = true;
      try {
        window.close();
      } catch {
        // no-op: fallback UI covers manual close
      }
      return;
    }

    if (pwaState) {
      await completePwaAuth(accessToken, expiration, scope, refreshToken);
      return;
    }

    reportError(
      origin,
      'Sign-in incomplete',
      'The login window lost connection to the app (e.g. it was opened in a separate browser tab via "Open in Firefox").\n\nPlease close this window and retry sync from the app.'
    );
  }

  async function completePwaAuth(
    accessToken: string,
    expiration: string,
    scope: string,
    refreshToken?: string | null
  ) {
    if (!pwaState) return;

    const tokenData: OAuthTokenData = {
      accessToken,
      scope,
      expiration: Date.now() + (Number.parseInt(expiration, 10) - 600) * 1000,
      refreshToken: refreshToken || undefined
    };

    let accountEmail = '';
    let accountName = '';
    try {
      const accountInfo =
        pwaState.storageType === StorageKey.GDRIVE
          ? await StorageOAuthManager.fetchGoogleAccount(accessToken)
          : await StorageOAuthManager.fetchOneDriveAccount(accessToken);
      accountEmail = accountInfo.email || '';
      accountName = accountInfo.name || '';
    } catch {
      // Continue even if account lookup is unavailable
    }

    const previousEmail = pwaState.previousEmail;
    if (
      previousEmail &&
      accountEmail &&
      previousEmail.trim().toLowerCase() !== accountEmail.trim().toLowerCase()
    ) {
      mismatchPreviousEmail = previousEmail;
      mismatchCurrentEmail = accountEmail;
      mismatchWarning = true;
      mismatchPendingAction = async () => {
        await persistPwaAuth(tokenData, accountEmail, accountName);
      };
      mismatchCancelAction = () => {
        if (tokenData.refreshToken && pwaState?.storageType === StorageKey.GDRIVE) {
          StorageOAuthManager.revokeToken(gDriveRevokeEndpoint, tokenData.refreshToken);
        }
        const returnUrl = pwaState?.returnUrl || '/';
        clearPwaOAuthState();
        window.location.replace(returnUrl);
      };
      return;
    }

    await persistPwaAuth(tokenData, accountEmail, accountName);
  }

  async function persistPwaAuth(
    tokenData: OAuthTokenData,
    accountEmail: string,
    accountName: string
  ) {
    if (!pwaState) return;

    try {
      const db = await database.db;
      const existing = pwaState.existingStorageSourceData ||
        (await db.get('storageSource', pwaState.storageSourceName)) || {
          storedInManager: false,
          encryptionDisabled: false
        };

      const finalRefreshToken = tokenData.refreshToken || existing.data?.refreshToken;
      if (!finalRefreshToken) {
        // Code flow must yield a durable refresh_token (OneDrive needs the
        // `offline_access` scope + SPA platform; Google needs
        // `access_type=offline`). Without it the session would die on the
        // next reload, so fail loudly instead of silently storing undefined.
        reportError(
          window.location.origin,
          'Sign-in incomplete — no refresh token',
          'The provider did not return a refresh token.\n\nFor OneDrive, ensure the app registration grants `offline_access` and uses a Single-Page Application redirect URI. Then return to the app and retry sync.'
        );
        return;
      }
      const remoteContext: RemoteContext = {
        clientId: pwaState.clientId,
        clientSecret: pwaState.clientSecret || '',
        refreshToken: finalRefreshToken,
        accountEmail: accountEmail || existing.data?.accountEmail,
        accountName: accountName || existing.data?.accountName
      };

      const newData = existing.encryptionDisabled
        ? remoteContext
        : pwaState.secret
          ? await encrypt(window, JSON.stringify(remoteContext), pwaState.secret)
          : existing.data;

      await db.put('storageSource', {
        ...existing,
        name: pwaState.storageSourceName,
        type: pwaState.storageType,
        data: newData,
        disconnected: false,
        lastSourceModified: Date.now()
      });

      storageOAuthTokens.set(pwaState.storageSourceName, tokenData);
      setConnectionState(pwaState.storageSourceName, StorageConnectionState.CONNECTED);
      clearPendingCloudSync(pwaState.storageSourceName);

      if (pwaState.setAsSyncTarget) {
        $syncTarget$ = pwaState.storageSourceName;
        setStorageSourceDefault(pwaState.storageSourceName, pwaState.storageType);
      }

      if (pwaState.triggerSyncOnReturn) {
        window.localStorage.setItem('pwa_sync_after_redirect', pwaState.storageSourceName);
      }

      const returnUrl = pwaState.returnUrl || '/';
      clearPwaOAuthState();
      window.location.replace(returnUrl);
    } catch (err: any) {
      reportError(
        window.location.origin,
        'Failed to save storage credentials',
        err?.message || String(err)
      );
    }
  }

  /**
   * Ask the opener for data over a MessageChannel. Never hangs forever: an
   * orphaned login window (no opener, e.g. via "Open in Firefox") or an
   * unresponsive app rejects so the caller surfaces an error with a Close
   * button instead of sitting on "Completing sign-in…" indefinitely.
   */
  function getDataFromOpener(origin: string, payload: any, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!window.opener) {
        reject(
          new Error(
            'The login window lost connection to the app (e.g. it was opened in a separate browser tab via "Open in Firefox"). Close this window and retry sync from the app.'
          )
        );
        return;
      }

      const channel = new MessageChannel();

      const timer = window.setTimeout(() => {
        channel.port1.close();
        reject(
          new Error('Timed out waiting for the app. Close this window and retry sync from the app.')
        );
      }, timeoutMs);

      channel.port1.onmessage = ({ data }) => {
        window.clearTimeout(timer);
        channel.port1.close();

        if (data.error) {
          reject(new Error(data.error));
        } else {
          resolve(data.result);
        }
      };

      try {
        window.opener.postMessage(payload, origin, [channel.port2]);
      } catch (error: any) {
        window.clearTimeout(timer);
        channel.port1.close();
        reject(error);
      }
    });
  }
</script>

{#if errorMessage}
  <div
    class="fixed inset-0 flex flex-col items-center justify-center p-6 text-center text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900"
  >
    <div class="text-amber-500 text-5xl mb-4">
      <Fa icon={faTriangleExclamation} />
    </div>
    <h2 class="text-lg font-semibold mb-2">Authentication Failed</h2>
    <pre
      class="text-xs text-zinc-600 dark:text-zinc-400 max-w-md whitespace-pre-wrap mb-6 font-mono bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-left border border-zinc-200 dark:border-zinc-700">{errorMessage}</pre>
    {#if pwaState}
      <button
        class="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 hover:opacity-90 transition-opacity"
        on:click={() => {
          const returnUrl = pwaState?.returnUrl || '/';
          clearPwaOAuthState();
          window.location.replace(returnUrl);
        }}
      >
        Return to App
      </button>
    {:else}
      <button
        class="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 hover:opacity-90 transition-opacity"
        on:click={() => window.close()}
      >
        Close Window
      </button>
    {/if}
  </div>
{:else if mismatchWarning}
  <div
    class="fixed inset-0 flex flex-col items-center justify-center p-6 text-center text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900"
  >
    <div class="text-amber-500 text-5xl mb-4">
      <Fa icon={faTriangleExclamation} />
    </div>
    <h2 class="text-lg font-semibold mb-2">Account Mismatch Warning</h2>
    <p
      class="text-sm text-zinc-600 dark:text-zinc-400 max-w-md min-w-0 break-words [overflow-wrap:anywhere] mb-6"
    >
      This storage source was previously linked to "{mismatchPreviousEmail}", but you just
      authenticated as "{mismatchCurrentEmail}". Connecting a different account may cause books,
      reading progress, and statistics to be mixed across accounts.
    </p>
    <div class="flex gap-3">
      <button
        class="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        on:click={() => mismatchCancelAction?.()}
      >
        Cancel
      </button>
      <button
        class="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 hover:opacity-90 transition-opacity"
        on:click={() => mismatchPendingAction?.()}
      >
        Switch Account
      </button>
    </div>
  </div>
{:else if signedIn}
  <div
    class="fixed inset-0 flex flex-col items-center justify-center p-6 text-center text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900"
  >
    <h2 class="text-lg font-semibold mb-2">Signed in</h2>
    <p
      class="text-sm text-zinc-600 dark:text-zinc-400 max-w-md min-w-0 break-words [overflow-wrap:anywhere] mb-6"
    >
      Sync is continuing in the app. You can close this window.
    </p>
    <button
      class="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 hover:opacity-90 transition-opacity"
      on:click={() => window.close()}
    >
      Close Window
    </button>
  </div>
{:else}
  <div class="fixed inset-0 flex h-full w-full items-center justify-center">
    <BookLoader stage="Completing sign-in…" mode={$loaderMode$ === 'debug' ? 'debug' : 'flavor'} />
  </div>
{/if}
