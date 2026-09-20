<script lang="ts">
  import { browser } from '$app/environment';
  import {
    faArrowsRotate,
    faChevronDown,
    faChevronRight,
    faCloud,
    faPenToSquare,
    faPlus,
    faRightFromBracket,
    faSpinner,
    faTrash,
    faTriangleExclamation
  } from '@fortawesome/free-solid-svg-icons';
  import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
  import MessageDialog from '$lib/components/message-dialog.svelte';
  import SettingsStorageSource from '$lib/components/settings/settings-storage-source.svelte';
  import {
    Button,
    Card,
    IconButton,
    List,
    ListItem,
    ListSection,
    Select,
    Switch,
    Tooltip
  } from '@custom-ereader/ui';
  import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { gDriveClientId, gDriveRevokeEndpoint, oneDriveClientId } from '$lib/data/env';
  import {
    StorageOAuthManager,
    clearProactiveRefresh,
    scheduleProactiveRefresh,
    storageOAuthTokens,
    storageConnectionStates$,
    getConnectionState,
    sessionsRestoring$,
    StorageConnectionState
  } from '$lib/data/storage/storage-oauth-manager';
  import {
    isAppDefault,
    isRemoteContext,
    setStorageSourceDefault,
    type FsHandle,
    type StorageSourceSaveResult,
    type StorageUnlockAction,
    type RemoteContext,
    unlockStorageData
  } from '$lib/data/storage/storage-source-manager';
  import {
    StorageKey,
    StorageSourceDefault,
    getFriendlyStorageSourceName
  } from '$lib/data/storage/storage-types';
  import { getStorageIconData } from '$lib/data/storage/storage-view';
  import {
    autoReplication$,
    database,
    fsStorageSource$,
    gDriveStorageSource$,
    isOnline$,
    lastSyncBySource$,
    oneDriveStorageSource$,
    syncTarget$
  } from '$lib/data/store';
  import { AutoReplicationType } from '$lib/functions/replication/replication-options';
  import { triggerCloudSync } from '$lib/functions/replication/cloud-sync';
  import { formatRelativeTime } from '$lib/functions/time-util';
  import { logger } from '$lib/data/logger';
  import { onDestroy, onMount } from 'svelte';
  import Fa from 'svelte-fa';

  export let storageSources: BooksDbStorageSource[];

  let listLoading = true;
  let actionLoading: Record<string, boolean> = {};
  let isSyncing = false;
  let enableAutoSyncOnConnect = true;
  let showAdvanced = false;
  // Remount key for the sync-target dropdown: the Astryx Select keeps its
  // own copy of the chosen value, so cancelling the switch confirm must
  // force a remount to show the still-active target again.
  let selectKey = 0;

  $: if (storageSources) {
    listLoading = false;
  }

  $: fileSystemAvailable = browser && 'showDirectoryPicker' in window;

  let relativeSyncTime = 'Never synced';
  let timeInterval: ReturnType<typeof setInterval> | undefined;

  function updateRelativeTime() {
    const sourceTime = activeSource ? $lastSyncBySource$[activeSource.name] : 0;
    relativeSyncTime = formatRelativeTime(sourceTime || 0);
  }

  $: if (activeSource && $lastSyncBySource$[activeSource.name] !== undefined) {
    updateRelativeTime();
  }

  onMount(() => {
    updateRelativeTime();
    timeInterval = setInterval(updateRelativeTime, 30000);
  });

  onDestroy(() => {
    if (timeInterval) {
      clearInterval(timeInterval);
    }
  });

  $: dropdownOptions = [
    { value: '', label: 'None (Local Storage Only)' },
    {
      value: StorageSourceDefault.GDRIVE_DEFAULT,
      label: getFriendlyStorageSourceName(StorageSourceDefault.GDRIVE_DEFAULT)
    },
    {
      value: StorageSourceDefault.ONEDRIVE_DEFAULT,
      label: getFriendlyStorageSourceName(StorageSourceDefault.ONEDRIVE_DEFAULT)
    },
    ...(fileSystemAvailable && storageSources
      ? storageSources
          .filter((s) => s.type === StorageKey.FS)
          .map((s) => ({ value: s.name, label: `Filesystem (${s.name})` }))
      : []),
    ...(storageSources
      ? storageSources
          // Disconnected sources stay selectable (selecting one shows its
          // Connect button) but carry a text-style warning sign, since native
          // <option> elements cannot render the icon used elsewhere.
          .filter((s) => !isAppDefault(s.name) && s.type !== StorageKey.FS)
          .map((s) => ({
            value: s.name,
            label: `${s.disconnected ? '⚠︎ ' : ''}${s.name} (${s.type === StorageKey.GDRIVE ? 'Google Drive' : 'OneDrive'})`
          }))
      : [])
  ];

  $: activeSource =
    storageSources?.find((s) => s.name === $syncTarget$) ||
    ($syncTarget$ === StorageSourceDefault.GDRIVE_DEFAULT
      ? {
          name: StorageSourceDefault.GDRIVE_DEFAULT,
          type: StorageKey.GDRIVE,
          storedInManager: false,
          encryptionDisabled: false,
          data: new ArrayBuffer(0),
          lastSourceModified: 0
        }
      : $syncTarget$ === StorageSourceDefault.ONEDRIVE_DEFAULT
        ? {
            name: StorageSourceDefault.ONEDRIVE_DEFAULT,
            type: StorageKey.ONEDRIVE,
            storedInManager: false,
            encryptionDisabled: false,
            data: new ArrayBuffer(0),
            lastSourceModified: 0
          }
        : null);
  $: activeConnectionState = activeSource
    ? $storageConnectionStates$[activeSource.name] ||
      getConnectionState(activeSource.name, activeSource)
    : StorageConnectionState.DISCONNECTED;
  $: checkingConnection =
    $sessionsRestoring$ &&
    (activeSource?.type === StorageKey.GDRIVE || activeSource?.type === StorageKey.ONEDRIVE) &&
    activeConnectionState !== StorageConnectionState.CONNECTED &&
    activeConnectionState !== StorageConnectionState.NEEDS_RECONNECT;
  $: isCloudSource =
    activeSource?.type === StorageKey.GDRIVE || activeSource?.type === StorageKey.ONEDRIVE;
  $: isSourceConfigured =
    !activeSource ||
    !isAppDefault(activeSource.name) ||
    (activeSource.name === StorageSourceDefault.GDRIVE_DEFAULT && !!gDriveClientId) ||
    (activeSource.name === StorageSourceDefault.ONEDRIVE_DEFAULT && !!oneDriveClientId);
  $: activeEmail = activeSource ? getAccountEmail(activeSource) : '';
  $: activeIcon = activeSource
    ? getStorageIconData(activeSource.type)
    : getStorageIconData(StorageKey.BROWSER);

  $: customSources = storageSources?.filter((s) => !isAppDefault(s.name)) || [];

  async function handleDropdownChange(e: CustomEvent<{ value: string | number }>) {
    const val = `${e.detail.value}`;
    if (!val) {
      $syncTarget$ = '';
      return;
    }

    const found =
      storageSources?.find((s) => s.name === val) ||
      (val === StorageSourceDefault.GDRIVE_DEFAULT
        ? {
            name: StorageSourceDefault.GDRIVE_DEFAULT,
            type: StorageKey.GDRIVE,
            storedInManager: false,
            encryptionDisabled: false,
            data: new ArrayBuffer(0),
            lastSourceModified: 0
          }
        : val === StorageSourceDefault.ONEDRIVE_DEFAULT
          ? {
              name: StorageSourceDefault.ONEDRIVE_DEFAULT,
              type: StorageKey.ONEDRIVE,
              storedInManager: false,
              encryptionDisabled: false,
              data: new ArrayBuffer(0),
              lastSourceModified: 0
            }
          : null);

    if (!found) return;

    const connState = getConnectionState(val, found as BooksDbStorageSource);
    const isAlreadyConnected = connState === StorageConnectionState.CONNECTED;

    if (isAlreadyConnected && $syncTarget$ && $syncTarget$ !== val) {
      const confirmed = await new Promise<boolean>((resolve) => {
        dialogManager.dialogs$.next([
          {
            component: ConfirmDialog,
            props: {
              dialogHeader: 'Switch Sync Target',
              dialogMessage: `Switch active sync target to "${getProviderDisplayName(found as BooksDbStorageSource)}"?\n\nYour local reading progress, statistics, and settings will now synchronize with this provider.`,
              contentStyles: 'white-space: pre-line;',
              resolver: resolve
            },
            disableCloseOnClick: true
          }
        ]);
      });

      if (!confirmed) {
        selectKey += 1;
        return;
      }
    }

    $syncTarget$ = val;

    if (isAlreadyConnected) {
      setStorageSourceDefault(val, found.type);
      await triggerManualSync(val);
    }
  }

  function getProviderDisplayName(source: BooksDbStorageSource | null) {
    if (!source) return 'None';
    if (
      source.name === StorageSourceDefault.GDRIVE_DEFAULT ||
      source.name === StorageSourceDefault.ONEDRIVE_DEFAULT
    )
      return getFriendlyStorageSourceName(source.name);
    return source.name;
  }

  function getAccountEmail(storageSource: BooksDbStorageSource) {
    if (storageSource.encryptionDisabled && isRemoteContext(storageSource.data)) {
      return storageSource.data.accountEmail || '';
    }
    return '';
  }

  function getSourceConnectionState(storageSource: BooksDbStorageSource) {
    return (
      $storageConnectionStates$[storageSource.name] ||
      getConnectionState(storageSource.name, storageSource)
    );
  }

  function isFSHandle(
    type: StorageKey,
    data: FsHandle | ArrayBuffer | RemoteContext
  ): data is FsHandle {
    return !!data && type === StorageKey.FS;
  }

  function isStorageSourceDefault(name: string, type: StorageKey, _sources: string[] = []) {
    switch (type) {
      case StorageKey.GDRIVE:
        return name === $gDriveStorageSource$;
      case StorageKey.ONEDRIVE:
        return name === $oneDriveStorageSource$;
      case StorageKey.FS:
        return name === $fsStorageSource$;
      default:
        return false;
    }
  }

  async function connectAndInitialSync(source: BooksDbStorageSource) {
    // Open synchronously in the click handler so mobile browsers don't block it.
    const preOpened = StorageOAuthManager.openAuthWindowSync(window);
    actionLoading[source.name] = true;
    actionLoading = { ...actionLoading };

    try {
      const connected = await StorageOAuthManager.reconnect(window, source.name, preOpened);
      if (connected) {
        $syncTarget$ = source.name;
        setStorageSourceDefault(source.name, source.type);

        if (enableAutoSyncOnConnect) {
          $autoReplication$ = AutoReplicationType.All;
        }

        await triggerManualSync(source.name);
      }
    } finally {
      actionLoading[source.name] = false;
      actionLoading = { ...actionLoading };
    }
  }

  async function reconnectStorageSource(source: BooksDbStorageSource) {
    // Open synchronously in the click handler so mobile browsers don't block it.
    // Reconnect resumes with a sync below so expired sessions recover fully.
    const preOpened = StorageOAuthManager.openAuthWindowSync(window);
    actionLoading[source.name] = true;
    actionLoading = { ...actionLoading };

    try {
      const connected = await StorageOAuthManager.reconnect(window, source.name, preOpened);
      if (connected && source.name === $syncTarget$) {
        await triggerManualSync(source.name);
      }
    } finally {
      actionLoading[source.name] = false;
      actionLoading = { ...actionLoading };
    }
  }

  async function disconnectStorageSource(source: BooksDbStorageSource) {
    actionLoading[source.name] = true;
    actionLoading = { ...actionLoading };

    try {
      await StorageOAuthManager.disconnect(source.name);
    } finally {
      actionLoading[source.name] = false;
      actionLoading = { ...actionLoading };
    }
  }

  async function triggerManualSync(sourceName: string) {
    if (!sourceName || isSyncing) return;

    isSyncing = true;
    try {
      // Single-target sync shared with banner/header reconnect flows: only
      // the selected target is synced (progress/stats/goals/bookmarks) plus
      // a metadata-only cloud book-list refresh. The other cloud is left
      // untouched and syncs on demand when one of its books is opened.
      const error = await triggerCloudSync(window, sourceName, storageSources || []);

      if (error) {
        throw new Error(error);
      }

      updateRelativeTime();
    } catch (err: any) {
      logger.error(`Manual sync failed: ${err.message}`);
      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Sync Failed',
            message: `Failed to synchronize: ${err.message}`
          }
        }
      ]);
    } finally {
      isSyncing = false;
    }
  }

  async function modifyStorageSource(storageSource?: BooksDbStorageSource) {
    let configuredRemoteData: StorageUnlockAction | undefined;
    let configuredFSData: FsHandle | undefined;

    if (storageSource && storageSource.type !== StorageKey.FS) {
      const unlockResult = await unlockStorageData(
        storageSource,
        'You are trying to access protected data',
        {
          action: `Enter the correct password for ${storageSource.name} to proceed`,
          encryptedData: storageSource.data
        }
      );

      if (!unlockResult) {
        return;
      }

      configuredRemoteData = unlockResult;
    } else if (storageSource && isFSHandle(storageSource.type, storageSource.data)) {
      configuredFSData = {
        directoryHandle: storageSource.data.directoryHandle,
        fsPath: storageSource.data.fsPath
      };
    }

    const saveResult = await new Promise<StorageSourceSaveResult>((resolver) => {
      dialogManager.dialogs$.next([
        {
          component: SettingsStorageSource,
          props: {
            configuredName: storageSource?.name,
            configuredType: storageSource?.type,
            configuredIsSyncTarget: storageSource ? $syncTarget$ === storageSource.name : false,
            configuredIsStorageSourceDefault: storageSource
              ? isStorageSourceDefault(storageSource.name, storageSource.type)
              : false,
            configuredFSData,
            configuredRemoteData,
            configuredStoredInManager: storageSource?.storedInManager,
            configuredEncryptionDisabled: storageSource?.encryptionDisabled,
            resolver
          },
          disableCloseOnClick: true
        }
      ]);
    });

    if (!saveResult) {
      return;
    }

    if (saveResult.old) {
      const oldToken = storageOAuthTokens.get(saveResult.old);
      storageOAuthTokens.delete(saveResult.old);
      clearProactiveRefresh(saveResult.old);

      if (oldToken && saveResult.new.type === storageSource?.type) {
        storageOAuthTokens.set(saveResult.new.name, oldToken);
        scheduleProactiveRefresh(saveResult.new.name);
      }

      database.storageSourcesChanged$.next(
        storageSources.map((entry) => (entry.name === saveResult.old ? saveResult.new : entry))
      );
    } else {
      database.storageSourcesChanged$.next([...storageSources, saveResult.new]);
    }
  }

  async function deleteStorageSource(
    storageSource: BooksDbStorageSource,
    wasSyncTarget: boolean,
    wasSourceDefault: boolean
  ) {
    const unlockResult = await unlockStorageData(
      storageSource,
      storageSource.type === StorageKey.FS
        ? 'You are trying to delete data'
        : 'You are trying to delete protected data',
      {
        action:
          storageSource.type === StorageKey.FS
            ? `Please confirm to proceed with deleting ${storageSource.name}`
            : `Enter the correct password for ${storageSource.name} to proceed`,
        requiresSecret: storageSource.type !== StorageKey.FS,
        showCancel: true,
        encryptedData: storageSource.type !== StorageKey.FS ? storageSource.data : undefined
      }
    );

    if (!unlockResult) {
      return;
    }

    const invalidateToken = storageSource.type === StorageKey.GDRIVE && unlockResult.refreshToken;

    if (invalidateToken && !$isOnline$) {
      dialogManager.dialogs$.next([
        {
          component: MessageDialog,
          props: {
            title: 'Error',
            message: 'You need to be online to delete this storage source'
          }
        }
      ]);
      return;
    }

    await database.deleteStorageSource(storageSource, wasSyncTarget, wasSourceDefault);

    storageOAuthTokens.delete(storageSource.name);

    if (invalidateToken && unlockResult.refreshToken) {
      StorageOAuthManager.revokeToken(gDriveRevokeEndpoint, unlockResult.refreshToken);
    }

    database.storageSourcesChanged$.next(
      storageSources.filter((source) => source.name !== storageSource.name)
    );
  }
</script>

<ListSection
  title="Cloud & Storage Sync"
  description="Select your primary cloud sync target. Automatic sync runs only against this target — reading progress, statistics, goals, and bookmarks stay on one provider so two clouds can never conflict. Your library shows local books plus books on this target; the other cloud is only touched when you open one of its books, and you will be asked to reconnect first if its session expired."
>
  <ListItem layout="stacked">
    <div class="flex flex-col gap-4 w-full min-w-0">
      <!-- Dropdown Selector -->
      <div class="w-full">
        {#key selectKey}
          <Select
            id="cloud-storage-select"
            label="Statistics Sync Target"
            helperText="Automatic sync runs only for this target; the other cloud syncs on demand when you open one of its books"
            options={dropdownOptions}
            value={$syncTarget$}
            on:change={handleDropdownChange}
          />
        {/key}
        {#if $syncTarget$}
          <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
            Tip: To continue reading seamlessly across devices, select the same Sync Target on both
            your phone and computer. Switch targets to browse and sync the other cloud's books.
          </p>
        {/if}
      </div>

      <!-- Active Provider Card -->
      {#if !listLoading}
        {#if activeSource}
          <Card
            variant="surface"
            padding="md"
            class="w-full max-w-full min-w-0 border border-zinc-200 dark:border-zinc-800"
          >
            <div class="flex flex-col gap-3 w-full min-w-0">
              <!-- Header Row -->
              <div class="flex items-center justify-between gap-3 min-w-0">
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    class="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-700 dark:text-zinc-300"
                  >
                    <svg class="h-5 w-5 fill-current" viewBox={activeIcon.viewBox}>
                      <path d={activeIcon.d} />
                    </svg>
                  </div>
                  <div class="min-w-0 flex-1">
                    <h4
                      class="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight truncate"
                      title={getProviderDisplayName(activeSource)}
                    >
                      {getProviderDisplayName(activeSource)}
                    </h4>
                    <div
                      class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate"
                      title={isCloudSource &&
                      activeConnectionState === StorageConnectionState.CONNECTED &&
                      activeEmail
                        ? `Connected as ${activeEmail}`
                        : undefined}
                    >
                      {#if isCloudSource}
                        {#if activeConnectionState === StorageConnectionState.CONNECTED}
                          {activeEmail ? `Connected as ${activeEmail}` : 'Connected'}
                        {:else if activeConnectionState === StorageConnectionState.NEEDS_RECONNECT}
                          Session Expired — Reconnect required
                        {:else if checkingConnection}
                          Checking connection…
                        {:else if !isSourceConfigured}
                          OAuth Client ID not configured
                        {:else}
                          Not connected
                        {/if}
                      {:else}
                        Local file system storage
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Status Badge -->
                <div class="shrink-0">
                  {#if isCloudSource}
                    {#if activeConnectionState === StorageConnectionState.CONNECTED}
                      <span
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap"
                      >
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"
                        ></span>
                        Connected
                      </span>
                    {:else if activeConnectionState === StorageConnectionState.NEEDS_RECONNECT}
                      <span
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 shrink-0 whitespace-nowrap"
                      >
                        <Fa icon={faTriangleExclamation} />
                        Needs Reconnect
                      </span>
                    {:else if checkingConnection}
                      <span
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 shrink-0 whitespace-nowrap"
                      >
                        Checking
                      </span>
                    {:else if !isSourceConfigured}
                      <span
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 shrink-0 whitespace-nowrap"
                      >
                        <Fa icon={faTriangleExclamation} />
                        Setup Required
                      </span>
                    {:else}
                      <span
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0 whitespace-nowrap"
                      >
                        Disconnected
                      </span>
                    {/if}
                  {:else}
                    <span
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 shrink-0 whitespace-nowrap"
                    >
                      Local Filesystem
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Sync Status Row -->
              <div
                class="flex flex-wrap items-center justify-between gap-2 py-2.5 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 min-w-0"
              >
                <div
                  class="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 min-w-0"
                >
                  {#if isSyncing}
                    <Fa icon={faSpinner} spin class="text-sky-500 shrink-0" />
                    <span class="font-medium break-words [overflow-wrap:anywhere]"
                      >Syncing data with cloud...</span
                    >
                  {:else}
                    <Fa icon={faCloud} class="text-zinc-400 dark:text-zinc-500 shrink-0" />
                    <span class="break-words [overflow-wrap:anywhere]"
                      >Sync status: <strong class="font-medium text-zinc-900 dark:text-zinc-100"
                        >{relativeSyncTime}</strong
                      ></span
                    >
                  {/if}
                </div>

                {#if isCloudSource && activeConnectionState === StorageConnectionState.CONNECTED}
                  <Button
                    size="sm"
                    variant="secondary"
                    class="shrink-0"
                    disabled={isSyncing}
                    on:click={() => triggerManualSync(activeSource?.name || '')}
                  >
                    <Fa
                      icon={isSyncing ? faSpinner : faArrowsRotate}
                      spin={isSyncing}
                      class="mr-1.5"
                    />
                    <span>Sync Now</span>
                  </Button>
                {/if}
              </div>

              <!-- Disconnected State: Opt-In Switch & Connect Button -->
              {#if isCloudSource && activeConnectionState !== StorageConnectionState.CONNECTED && activeConnectionState !== StorageConnectionState.NEEDS_RECONNECT}
                <div
                  class="flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 mt-1 min-w-0"
                >
                  <div class="min-w-0 flex-1">
                    <div
                      class="text-sm font-medium text-zinc-900 dark:text-zinc-100 break-words [overflow-wrap:anywhere]"
                    >
                      Enable automatic background sync across devices (Recommended)
                    </div>
                    <div
                      class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 break-words [overflow-wrap:anywhere]"
                    >
                      Automatically keeps your reading progress, bookmarks, and statistics in sync
                      as you read.
                    </div>
                  </div>
                  <div class="shrink-0">
                    <Switch bind:checked={enableAutoSyncOnConnect} />
                  </div>
                </div>

                {#if isCloudSource && !isSourceConfigured}
                  <div
                    class="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 mt-1 flex flex-col gap-1.5 min-w-0"
                  >
                    <div class="font-semibold flex items-center gap-1.5">
                      <Fa icon={faTriangleExclamation} class="shrink-0" />
                      <span>OAuth Setup Required</span>
                    </div>
                    <div class="break-words [overflow-wrap:anywhere]">
                      {getProviderDisplayName(activeSource)} requires an OAuth Client ID to connect. You
                      can provide
                      <code
                        class="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 font-mono text-[11px] break-all"
                      >
                        {activeSource.name === StorageSourceDefault.GDRIVE_DEFAULT
                          ? 'VITE_GDRIVE_CLIENT_ID'
                          : 'VITE_ONEDRIVE_CLIENT_ID'}
                      </code>
                      in your build environment, or register custom credentials using
                      <strong>Add Custom Source</strong> in the Advanced section below.
                    </div>
                  </div>
                {/if}

                <div class="flex justify-end mt-2 min-w-0">
                  <Button
                    variant="primary"
                    disabled={!!actionLoading[activeSource.name]}
                    on:click={() => activeSource && connectAndInitialSync(activeSource)}
                  >
                    {#if actionLoading[activeSource.name]}
                      <Fa icon={faSpinner} spin class="mr-1.5" />
                    {/if}
                    <span>Connect {getProviderDisplayName(activeSource)}</span>
                  </Button>
                </div>
              {/if}

              <!-- Connected State: Inline Auto-Sync & Session Actions -->
              {#if isCloudSource && (activeConnectionState === StorageConnectionState.CONNECTED || activeConnectionState === StorageConnectionState.NEEDS_RECONNECT)}
                <div
                  class="flex items-center justify-between gap-3 py-2 border-t border-zinc-100 dark:border-zinc-800 mt-1 min-w-0"
                >
                  <div class="min-w-0 flex-1">
                    <div
                      class="text-sm font-medium text-zinc-900 dark:text-zinc-100 break-words [overflow-wrap:anywhere]"
                    >
                      Automatic Background Sync
                    </div>
                    <div
                      class="text-xs text-zinc-500 dark:text-zinc-400 break-words [overflow-wrap:anywhere]"
                    >
                      {$autoReplication$ !== AutoReplicationType.Off
                        ? 'Enabled (two-way background sync active while reading)'
                        : 'Disabled (manual sync only via Sync Now)'}
                    </div>
                  </div>
                  <div class="shrink-0">
                    <Switch
                      checked={$autoReplication$ !== AutoReplicationType.Off}
                      on:change={(e) => {
                        $autoReplication$ = e.detail
                          ? AutoReplicationType.All
                          : AutoReplicationType.Off;
                      }}
                    />
                  </div>
                </div>

                <!-- Action buttons -->
                <div
                  class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-1 min-w-0"
                >
                  {#if activeConnectionState === StorageConnectionState.NEEDS_RECONNECT}
                    <div
                      class="text-xs text-amber-500 dark:text-amber-400 font-medium min-w-0 break-words [overflow-wrap:anywhere]"
                    >
                      Session has expired. Please reconnect to resume syncing.
                    </div>
                  {/if}
                  <div class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:ml-auto">
                    <Button
                      size="sm"
                      variant={activeConnectionState === StorageConnectionState.NEEDS_RECONNECT
                        ? 'primary'
                        : 'secondary'}
                      disabled={!!actionLoading[activeSource.name]}
                      on:click={() => activeSource && reconnectStorageSource(activeSource)}
                    >
                      <Fa
                        icon={actionLoading[activeSource.name] ? faSpinner : faArrowsRotate}
                        spin={!!actionLoading[activeSource.name]}
                        class="mr-1.5"
                      />
                      <span
                        >{activeConnectionState === StorageConnectionState.NEEDS_RECONNECT
                          ? 'Reconnect Session'
                          : 'Re-authenticate'}</span
                      >
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      class="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      disabled={!!actionLoading[activeSource.name]}
                      on:click={() => activeSource && disconnectStorageSource(activeSource)}
                    >
                      <Fa icon={faRightFromBracket} class="mr-1.5" />
                      <span>Disconnect</span>
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          </Card>
        {:else}
          <!-- No Storage Source Selected (Local Only) -->
          <Card
            variant="surface"
            padding="md"
            class="w-full max-w-full min-w-0 border border-zinc-200 dark:border-zinc-800"
          >
            <div class="flex items-start gap-3 min-w-0">
              <div
                class="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-600 dark:text-zinc-400"
              >
                <svg
                  class="h-5 w-5 fill-current"
                  viewBox={getStorageIconData(StorageKey.BROWSER).viewBox}
                >
                  <path d={getStorageIconData(StorageKey.BROWSER).d} />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Local Storage Only
                </h4>
                <p
                  class="text-sm text-zinc-500 dark:text-zinc-400 mt-1 break-words [overflow-wrap:anywhere]"
                >
                  Your reading progress, statistics, and bookmarks are saved strictly on this
                  device. To enable automatic backups and cross-device sync, select <strong
                    >Google Drive</strong
                  >
                  or <strong>OneDrive</strong> from the dropdown above.
                </p>
              </div>
            </div>
          </Card>
        {/if}
      {:else}
        <div class="py-8 flex justify-center text-xl text-zinc-400">
          <Fa icon={faSpinner} spin />
        </div>
      {/if}

      <!-- Advanced / Custom Credentials Collapsible -->
      <div class="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <button
          type="button"
          class="flex items-center justify-between gap-2 w-full min-w-0 text-left text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 py-1 transition-colors"
          on:click={() => (showAdvanced = !showAdvanced)}
        >
          <span class="flex items-center gap-2 min-w-0 flex-1">
            <Fa icon={showAdvanced ? faChevronDown : faChevronRight} class="text-xs shrink-0" />
            <span class="truncate">Advanced: Custom Credentials & Directory Folders</span>
          </span>
          <span class="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
            {customSources.length} custom {customSources.length === 1 ? 'source' : 'sources'}
          </span>
        </button>

        {#if showAdvanced}
          <div class="mt-3 flex flex-col gap-3 min-w-0">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
              <p
                class="text-xs text-zinc-500 dark:text-zinc-400 min-w-0 break-words [overflow-wrap:anywhere]"
              >
                Configure your own OAuth Client IDs, master password encryption, or local folder
                directory handles.
              </p>
              <Button
                size="sm"
                variant="secondary"
                class="shrink-0 self-start sm:self-auto"
                on:click={() => modifyStorageSource()}
              >
                <Fa icon={faPlus} class="mr-1.5" />
                <span>Add Custom Source</span>
              </Button>
            </div>

            {#if customSources.length === 0}
              <div
                class="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/30 rounded-md border border-zinc-100 dark:border-zinc-800"
              >
                No custom storage sources configured. Using the default cloud integration.
              </div>
            {:else}
              <List variant="bordered" divided={true}>
                {#each customSources as storageSource (storageSource.name)}
                  {@const icon = getStorageIconData(storageSource.type)}
                  {@const isSourceSyncTarget = storageSource.name === $syncTarget$}
                  {@const sourceState = getSourceConnectionState(storageSource)}
                  {@const isCloudRow =
                    storageSource.type === StorageKey.GDRIVE ||
                    storageSource.type === StorageKey.ONEDRIVE}
                  {@const checkingRow =
                    $sessionsRestoring$ &&
                    isCloudRow &&
                    sourceState !== StorageConnectionState.CONNECTED &&
                    sourceState !== StorageConnectionState.NEEDS_RECONNECT}
                  <ListItem
                    headline={storageSource.name}
                    description={storageSource.type === StorageKey.FS
                      ? 'Filesystem directory'
                      : `${storageSource.type === StorageKey.GDRIVE ? 'Custom Google Drive' : 'Custom OneDrive'}`}
                  >
                    <div
                      slot="prefix"
                      class="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-700 dark:text-zinc-300"
                    >
                      <svg class="h-4 w-4 fill-current" viewBox={icon.viewBox}>
                        <path d={icon.d} />
                      </svg>
                    </div>

                    <div slot="suffix" class="flex items-center gap-1 shrink-0 min-w-0">
                      {#if isCloudRow}
                        {#if sourceState === StorageConnectionState.CONNECTED}
                          <span
                            class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shrink-0 whitespace-nowrap"
                          >
                            Connected
                          </span>
                        {:else if sourceState === StorageConnectionState.NEEDS_RECONNECT}
                          <span
                            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 shrink-0 whitespace-nowrap"
                          >
                            <Fa icon={faTriangleExclamation} />
                            Needs Reconnect
                          </span>
                        {:else if checkingRow}
                          <span
                            class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 shrink-0 whitespace-nowrap"
                          >
                            Checking
                          </span>
                        {:else}
                          <span
                            class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0 whitespace-nowrap"
                          >
                            Disconnected
                          </span>
                        {/if}
                      {/if}

                      {#if isCloudRow && sourceState !== StorageConnectionState.CONNECTED && !checkingRow}
                        <Tooltip content="Reconnect source">
                          <IconButton
                            nativeTooltip={false}
                            size="sm"
                            variant="ghost"
                            label="Reconnect source"
                            data-testid={`reconnect-${storageSource.name}`}
                            disabled={!!actionLoading[storageSource.name]}
                            on:click={() => reconnectStorageSource(storageSource)}
                          >
                            {#if actionLoading[storageSource.name]}
                              <Fa icon={faSpinner} spin />
                            {:else}
                              <Fa icon={faArrowsRotate} />
                            {/if}
                          </IconButton>
                        </Tooltip>
                      {/if}

                      <Tooltip content="Edit source credentials">
                        <IconButton
                          nativeTooltip={false}
                          size="sm"
                          variant="ghost"
                          label="Edit source"
                          on:click={() => modifyStorageSource(storageSource)}
                        >
                          <Fa icon={faPenToSquare} />
                        </IconButton>
                      </Tooltip>

                      <Tooltip content="Delete source">
                        <IconButton
                          nativeTooltip={false}
                          size="sm"
                          variant="ghost"
                          label="Delete source"
                          class="hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                          on:click={() =>
                            deleteStorageSource(
                              storageSource,
                              isSourceSyncTarget,
                              isStorageSourceDefault(storageSource.name, storageSource.type)
                            )}
                        >
                          <Fa icon={faTrash} />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </ListItem>
                {/each}
              </List>
            {/if}
          </div>
        {/if}
      </div>
    </div></ListItem
  >
</ListSection>
