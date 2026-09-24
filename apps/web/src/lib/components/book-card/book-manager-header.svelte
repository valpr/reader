<script lang="ts">
  import { browser, dev } from '$app/environment';
  import { goto, preloadCode } from '$app/navigation';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import SyncActivityIcon from '$lib/components/cloud/sync-activity-icon.svelte';
  import { mergeEntries } from '$lib/components/merged-header-icon/merged-entries';
  import MergedHeaderIcon from '$lib/components/merged-header-icon/merged-header-icon.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import {
    Button,
    CloudStatusIcon,
    IconButton,
    Input,
    SegmentedControl,
    Tooltip,
    TopBar
  } from '@custom-ereader/ui';
  import { pagePath } from '$lib/data/env';
  import { logger } from '$lib/data/logger';
  import { normalizeTag } from '$lib/data/book-tags';
  import {
    DEFAULT_LIBRARY_FILTERS,
    PROGRESS_FILTER_OPTIONS,
    getActiveFilterCount,
    type ProgressFilter
  } from '$lib/data/library-filters';
  import { SortDirection } from '$lib/data/sort-types';
  import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
  import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
  import {
    getConnectionState,
    sessionsRestoring$,
    storageConnectionStates$,
    StorageConnectionState
  } from '$lib/data/storage/storage-oauth-manager';
  import { StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';
  import {
    database,
    fileCountData$,
    isOnline$,
    libraryFilters$,
    librarySortOption$,
    librarySourceFilter$
  } from '$lib/data/store';
  import { inputAllowDirectory } from '$lib/functions/file-dom/input-allow-directory';
  import { inputFile } from '$lib/functions/file-dom/input-file';
  import { dummyFn, isMobile$, isOnOldUrl } from '$lib/functions/utils';
  import {
    faArrowDownShortWide,
    faArrowDownWideShort,
    faCalendarXmark,
    faChartLine,
    faCheck,
    faChevronDown,
    faCircleXmark,
    faCloudArrowUp,
    faMagnifyingGlass,
    faSortDown,
    faSortUp,
    faTimes,
    faTrash,
    faTriangleExclamation
  } from '@fortawesome/free-solid-svg-icons';
  import { createEventDispatcher, onMount } from 'svelte';
  import Fa from 'svelte-fa';

  export let hasBookOpened: boolean;
  export let selectMode: boolean;
  export let selectedCount: number;
  export let hasBooks: boolean;
  export let cancelTooltip: string;
  export let replicationProgress: number;
  export let replicationToProgress: number;
  export let replicationProgressRemaining: string;
  export let showCloudWarning = false;
  export let cloudWarningLabel = 'Cloud session expired. Reconnect to resume syncing.';
  export let availableTags: string[] = [];

  const dispatch = createEventDispatcher<{
    selectAllClick: void;
    removeClick: void;
    domainHintClick: void;
    bugReportClick: void;
    backToBookClick: void;
    filesChange: FileList;
    importBackup: File;
    selectionToStatistics: void;
    deleteStatistics: void;
    replicateData: void;
    cancelReplication: void;
    cloudReconnectClick: void;
  }>();

  let importMenuItems = [mergeEntries.FILE_IMPORT];

  interface SourceFilterEntry {
    label: string;
    key: StorageKey | null;
    requiresConnectivity: boolean;
    setup?: boolean;
  }

  // Known cloud records for per-type availability. Reloaded on mount and
  // whenever sources change (add/delete/disconnect), so the filter list
  // tracks connected sources instead of always offering both clouds.
  let storageSourceRecords: BooksDbStorageSource[] = [];
  let sourceRecordsLoaded = false;

  async function reloadSourceRecords() {
    try {
      storageSourceRecords = (await database.getStorageSources().catch(() => [])) || [];
    } catch {
      storageSourceRecords = [];
    } finally {
      sourceRecordsLoaded = true;
    }
  }

  onMount(() => {
    reloadSourceRecords();
    const subscription = database.storageSourcesChanged$.subscribe(() => reloadSourceRecords());
    return () => subscription.unsubscribe();
  });

  type CloudTypeStatus = 'connected' | 'expired' | 'none';

  // A cloud type is offered when any source of that type (default or custom
  // record) is connected or holds an expired session awaiting reconnect.
  // Fully disconnected types (or deleted records) resolve to 'none'.
  function cloudTypeStatus(
    type: StorageKey,
    connectionStates: Record<string, StorageConnectionState>,
    records: BooksDbStorageSource[]
  ): CloudTypeStatus {
    const defaultName =
      type === StorageKey.GDRIVE
        ? StorageSourceDefault.GDRIVE_DEFAULT
        : StorageSourceDefault.ONEDRIVE_DEFAULT;
    const names = new Set<string>([defaultName]);
    for (const record of records) {
      if (record?.type === type && record.name) {
        names.add(record.name);
      }
    }

    let seenExpired = false;
    for (const name of names) {
      const record = records.find((r) => r.name === name);
      const state = connectionStates[name] || getConnectionState(name, record);
      if (state === StorageConnectionState.CONNECTED) {
        return 'connected';
      }
      if (state === StorageConnectionState.NEEDS_RECONNECT) {
        seenExpired = true;
      }
    }
    return seenExpired ? 'expired' : 'none';
  }

  $: gDriveStatus = cloudTypeStatus(
    StorageKey.GDRIVE,
    $storageConnectionStates$,
    storageSourceRecords
  );
  $: oneDriveStatus = cloudTypeStatus(
    StorageKey.ONEDRIVE,
    $storageConnectionStates$,
    storageSourceRecords
  );

  $: sourceFilters = [
    { label: 'Browser', key: StorageKey.BROWSER, requiresConnectivity: false },
    ...(gDriveStatus !== 'none'
      ? [{ label: 'GDrive', key: StorageKey.GDRIVE, requiresConnectivity: true }]
      : []),
    ...(oneDriveStatus !== 'none'
      ? [{ label: 'OneDrive', key: StorageKey.ONEDRIVE, requiresConnectivity: true }]
      : []),
    // No cloud available: offer a placeholder that routes to cloud enrollment
    // in Settings instead of dead-end type options.
    ...(gDriveStatus === 'none' && oneDriveStatus === 'none'
      ? [{ label: 'Cloud', key: null, requiresConnectivity: false, setup: true }]
      : [])
  ] as SourceFilterEntry[];

  let fileImportElm: HTMLElement;
  let folderImportElm: HTMLElement;
  let backupImportElm: HTMLElement;
  let countImportElm: HTMLInputElement;
  let importMenuElm: Popover;
  let filterElm: Popover;
  let sortOptionsElm: Popover;
  let isOldUrl = false;
  let showLoadCount = false;

  function isFilterActive(filterSet: Set<StorageKey>, key: StorageKey | null): boolean {
    return key !== null && filterSet.size === 1 && filterSet.has(key);
  }

  function isAllActive(filterSet: Set<StorageKey>): boolean {
    return filterSet.size === 0;
  }

  // Single-select: picking a source shows only that source; picking it again
  // (or All) clears back to the unified view. Legacy multi-sets collapse to All.
  // The popover stays open so a source can be combined with a title query,
  // progress, or tags in one pass.
  function selectSourceFilter(key: StorageKey | null) {
    librarySourceFilter$.next(key === null ? new Set() : new Set([key]));
  }

  function goToCloudSetup() {
    goto(`${pagePath}/settings/data`);
  }

  // If the active filter's cloud type loses its last connected source
  // (disconnect/delete), fall back to All so filtering can't stick on a
  // type with no matching option. Gated on loaded records and finished
  // session restore so boot doesn't wipe a still-valid persisted filter.
  $: if (browser && sourceRecordsLoaded && !$sessionsRestoring$) {
    const activeFilterKeys = [...$librarySourceFilter$];
    if (
      activeFilterKeys.length === 1 &&
      activeFilterKeys[0] !== StorageKey.BROWSER &&
      !sourceFilters.some((f) => f.key === activeFilterKeys[0])
    ) {
      librarySourceFilter$.next(new Set());
    }
  }

  $: currentFilterLabel = (() => {
    if ($librarySourceFilter$.size === 0) return 'All';
    const key = [...$librarySourceFilter$][0];
    return sourceFilters.find((f) => f.key === key)?.label ?? 'All';
  })();

  function isSourceDisabled(requiresConnectivity: boolean, isOnline: boolean): boolean {
    return requiresConnectivity && !isOnline;
  }

  function sourceAvailabilityHint(
    key: StorageKey | null,
    requiresConnectivity: boolean,
    setup = false,
    isOnline = true,
    gDriveState: CloudTypeStatus = 'none',
    oneDriveState: CloudTypeStatus = 'none'
  ): string | undefined {
    if (setup) return 'Connect a cloud';
    if (requiresConnectivity && !isOnline) return 'Needs internet';
    if (key === StorageKey.GDRIVE && gDriveState === 'expired') return 'Session expired';
    if (key === StorageKey.ONEDRIVE && oneDriveState === 'expired') return 'Session expired';
    return undefined;
  }

  $: if (browser) {
    isOldUrl = isOnOldUrl(window);
    showLoadCount = new URLSearchParams(window.location.search).has('count');

    importMenuItems = [
      mergeEntries.FILE_IMPORT,
      ...($isMobile$
        ? [mergeEntries.BACKUP_IMPORT]
        : [mergeEntries.FOLDER_IMPORT, mergeEntries.BACKUP_IMPORT])
    ];
  }

  $: sortMenuItems = [
    { property: 'id', label: 'Added (id)' },
    { property: 'title', label: 'Title' },
    { property: 'characters', label: 'Characters' },
    { property: 'lastBookModified', label: 'Last Update' },
    { property: 'lastBookOpen', label: 'Last Read' },
    { property: 'progress', label: 'Progress' },
    { property: 'lastBookmarkModified', label: 'Bookmarked' }
  ];

  function triggerInput(event: CustomEvent<string> | string) {
    const action = typeof event === 'string' ? event : event.detail;
    switch (action) {
      case mergeEntries.FOLDER_IMPORT.label:
        folderImportElm.click();
        break;

      case mergeEntries.BACKUP_IMPORT.label:
        backupImportElm.click();
        break;

      default:
        fileImportElm.click();
        break;
    }
  }

  function dispatchFilesChange(fileList: FileList) {
    dispatch('filesChange', fileList);
  }

  function dispatchImportBackup(fileList: FileList) {
    dispatch('importBackup', fileList[0]);
  }

  async function setCountData(fileList: FileList) {
    try {
      $fileCountData$ = JSON.parse(await FilesystemStorageHandler.readFileObject(fileList[0]));
    } catch ({ message }: any) {
      logger.error(`failed to read file: ${message}`);
    }
  }

  // Library search/filter state (title query, tags AND-filter, progress).
  // Persisted via `libraryFilters$`; the title input is debounced so typing
  // doesn't re-run the library pipeline on every keystroke.
  let searchDraft = '';
  let searchInputFocused = false;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeFilterCount = 0;
  let sourceFilterActive = false;
  let combinedFilterCount = 0;
  let combinedFiltersActive = false;

  $: activeFilterCount = getActiveFilterCount($libraryFilters$);
  $: sourceFilterActive = ($librarySourceFilter$?.size ?? 0) > 0;
  $: combinedFilterCount = activeFilterCount + (sourceFilterActive ? 1 : 0);
  $: combinedFiltersActive = combinedFilterCount > 0;

  // Mirror the store into the draft while the user isn't editing, so
  // external resets (e.g. the empty-state "Clear filters") reflect here.
  $: if (!searchInputFocused) {
    searchDraft = $libraryFilters$?.query ?? '';
  }

  function commitSearchDraft() {
    const current = $libraryFilters$ ?? DEFAULT_LIBRARY_FILTERS;
    if ((current.query ?? '') !== searchDraft) {
      libraryFilters$.next({ ...current, query: searchDraft });
    }
  }

  function onSearchInput() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(commitSearchDraft, 300);
  }

  function onSearchClear() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDraft = '';
    commitSearchDraft();
  }

  function isTagSelected(selectedTags: string[] | undefined, tag: string): boolean {
    const selected = selectedTags ?? [];
    const normalized = normalizeTag(tag);
    return selected.some((t) => normalizeTag(t) === normalized);
  }

  function toggleTagFilter(tag: string) {
    const current = $libraryFilters$ ?? DEFAULT_LIBRARY_FILTERS;
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    const selected = current.tags ?? [];
    const next = selected.some((t) => normalizeTag(t) === normalized)
      ? selected.filter((t) => normalizeTag(t) !== normalized)
      : [...selected, normalized];
    libraryFilters$.next({ ...current, tags: next });
  }

  function setProgressFilter(value: string | number) {
    const current = $libraryFilters$ ?? DEFAULT_LIBRARY_FILTERS;
    libraryFilters$.next({ ...current, progress: value as ProgressFilter });
  }

  function clearLibraryFilters() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDraft = '';
    libraryFilters$.next({ ...DEFAULT_LIBRARY_FILTERS });
    librarySourceFilter$.next(new Set());
  }

  function changeSortOptions(clickedProperty: string, newDirection: SortDirection) {
    const { property, direction } = $librarySortOption$;

    if (property !== clickedProperty || direction !== newDirection) {
      librarySortOption$.next({
        property: clickedProperty as Exclude<
          keyof BookCardProps,
          'imagePath' | 'isPlaceholder' | 'sources'
        >,
        direction: newDirection
      });
    }

    sortOptionsElm.toggleOpen();
  }
</script>

<input
  hidden
  multiple
  type="file"
  accept="application/epub+zip,.epub,.htmlz,plain/text,.txt"
  use:inputFile={dispatchFilesChange}
  bind:this={fileImportElm}
/>
<input
  hidden
  multiple
  type="file"
  use:inputAllowDirectory
  use:inputFile={dispatchFilesChange}
  bind:this={folderImportElm}
/>
<input
  hidden
  type="file"
  accept=".zip,application/zip"
  use:inputFile={dispatchImportBackup}
  bind:this={backupImportElm}
/>
<input
  hidden
  type="file"
  accept=".json,application/json"
  use:inputFile={setCountData}
  bind:this={countImportElm}
/>
{#if !replicationToProgress}
  <TopBar bordered={true} density="compact">
    <div slot="start" class="flex items-center gap-1.5">
      {#if selectedCount === 0}
        <Tooltip text={selectMode ? 'Disable Book Selection' : 'Enable Book Selection'}>
          <IconButton
            nativeTooltip={false}
            label={selectMode ? 'Disable Book Selection' : 'Enable Book Selection'}
            size="md"
            variant={selectMode ? 'secondary' : 'ghost'}
            active={selectMode}
            on:click={() => (selectMode = hasBooks && !selectMode)}
          >
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 fill-current"
            >
              <path
                d="M20,4v12H8V4H20 M20,2H8C6.9,2,6,2.9,6,4v12c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2L20,2z M12.47,14 L9,10.5l1.4-1.41l2.07,2.08L17.6,6L19,7.41L12.47,14z M4,6H2v14c0,1.1,0.9,2,2,2h14v-2H4V6z"
              />
            </svg>
          </IconButton>
        </Tooltip>
        {#if !selectMode}
          <span
            class="hidden sm:inline-block text-sm font-semibold tracking-tight text-[var(--astryx-color-fg-primary)] ml-1"
          >
            Valpr Reader
          </span>
        {/if}
        {#if showCloudWarning}
          <CloudStatusIcon
            label={cloudWarningLabel}
            state="warning"
            on:click={() => dispatch('cloudReconnectClick')}
          >
            <Fa icon={faTriangleExclamation} class="text-base" />
          </CloudStatusIcon>
        {/if}
        {#if !replicationToProgress}
          <SyncActivityIcon />
        {/if}
      {:else}
        <Tooltip text="Disable Book Selection">
          <IconButton
            nativeTooltip={false}
            label="Disable Book Selection"
            size="md"
            variant="ghost"
            on:click={() => (selectMode = !selectMode)}
          >
            <Fa icon={faTimes} class="text-base" />
          </IconButton>
        </Tooltip>
        <span
          class="inline-flex items-center justify-center rounded-full bg-[var(--astryx-color-primary-subtle,rgba(99,102,241,0.15))] px-2 py-0.5 text-xs font-semibold text-[var(--astryx-color-primary,#6366f1)]"
        >
          {selectedCount}
        </span>
      {/if}
    </div>

    <div class="flex items-center justify-center">
      {#if !selectMode}
        {#if hasBookOpened}
          <Tooltip text="Back to Book">
            <IconButton
              nativeTooltip={false}
              label="Back to Book"
              size="md"
              variant="ghost"
              on:mouseenter={() => preloadCode(`${pagePath}/b`)}
              on:pointerdown={() => preloadCode(`${pagePath}/b`)}
              on:click={() => dispatch('backToBookClick')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                class="h-5 w-5 fill-current"
              >
                <path
                  d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5zm-3.5-8c.88 0 1.73.09 2.5.26V9.24c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99zM13 12.49v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26V11.9c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.3-4.5.83zm4.5 1.84c-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26v-1.52c-.79-.16-1.64-.24-2.5-.24z"
                />
              </svg>
            </IconButton>
          </Tooltip>
        {/if}
      {:else}
        <Tooltip text="Select all Books">
          <IconButton
            nativeTooltip={false}
            label="Select all Books"
            size="md"
            variant="ghost"
            on:click={() => dispatch('selectAllClick')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              class="h-5 w-5 fill-current"
            >
              <path
                d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"
              />
            </svg>
          </IconButton>
        </Tooltip>
      {/if}
    </div>

    <div slot="end" class="flex items-center gap-0.5 sm:gap-1">
      {#if !selectMode}
        <Popover
          placement="bottom"
          fallbackPlacements={['bottom-end', 'bottom-start']}
          yOffset={4}
          bind:this={importMenuElm}
        >
          <div slot="icon">
            <Tooltip text="Import Books or Backup">
              <Button
                variant="ghost"
                size="md"
                aria-label="Import Books or Backup"
                data-testid="library-import-button"
                class="gap-1.5 px-2 text-sm font-medium text-[var(--astryx-color-fg-secondary)] hover:text-[var(--astryx-color-fg-primary)] sm:px-2.5"
              >
                <Fa icon={mergeEntries.FILE_IMPORT.icon} class="text-sm opacity-80" />
                <span class="hidden sm:inline">Import</span>
                <span class="hidden sm:inline-flex items-center">
                  <Fa icon={faChevronDown} class="text-xs opacity-60" />
                </span>
              </Button>
            </Tooltip>
          </div>
          <div
            class="min-w-[12rem] rounded-lg border border-[var(--astryx-color-border-subtle,#e4e4e7)] bg-[var(--astryx-color-surface,#ffffff)] py-1 shadow-lg text-sm"
            slot="content"
          >
            {#each importMenuItems as item (item.label)}
              <button
                type="button"
                class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                on:click={() => {
                  triggerInput(item.label);
                  importMenuElm.toggleOpen();
                }}
              >
                <Fa icon={item.icon} class="w-4 text-center opacity-70" />
                <span>{item.label}</span>
              </button>
            {/each}
          </div>
        </Popover>

        <Popover
          placement="bottom-end"
          fallbackPlacements={['bottom-start', 'bottom']}
          yOffset={4}
          bind:this={filterElm}
        >
          <div slot="icon">
            <Tooltip text="Search and filter library">
              <Button
                variant="ghost"
                size="md"
                class="gap-1.5 px-2 text-sm font-medium text-[var(--astryx-color-fg-secondary)] hover:text-[var(--astryx-color-fg-primary)] sm:px-2.5"
                aria-label="Search and filter library"
                data-testid="library-search-filter-button"
              >
                <Fa icon={faMagnifyingGlass} class="text-sm opacity-80" />
                <span class="hidden sm:inline"
                  >{sourceFilterActive ? currentFilterLabel : 'Search'}</span
                >
                <span class="hidden sm:inline-flex items-center">
                  <Fa icon={faChevronDown} class="text-xs opacity-60" />
                </span>
                {#if combinedFiltersActive}
                  <span
                    data-testid="library-active-filter-count"
                    class="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--astryx-color-primary-subtle,rgba(99,102,241,0.15))] px-1.5 py-0.5 text-xs font-semibold text-[var(--astryx-color-primary,#6366f1)]"
                  >
                    {combinedFilterCount}
                  </span>
                {/if}
              </Button>
            </Tooltip>
          </div>
          <div
            class="flex w-72 max-w-[calc(100vw-2rem)] max-w-[calc(100dvw-2rem)] flex-col gap-3 p-3"
            slot="content"
          >
            <Input
              size="sm"
              placeholder="Search by title..."
              clearable
              bind:value={searchDraft}
              data-testid="library-search-input"
              on:input={onSearchInput}
              on:clear={onSearchClear}
              on:focus={() => (searchInputFocused = true)}
              on:blur={() => {
                searchInputFocused = false;
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
                commitSearchDraft();
              }}
            >
              <span slot="prefix">
                <Fa icon={faMagnifyingGlass} class="text-xs opacity-60" />
              </span>
            </Input>

            <div class="flex flex-col gap-1.5">
              <span
                class="text-xs font-semibold uppercase tracking-wide text-[var(--astryx-color-fg-muted)]"
              >
                Storage source
              </span>
              <div class="flex flex-col gap-0.5" data-testid="library-source-filter-options">
                <button
                  type="button"
                  aria-pressed={isAllActive($librarySourceFilter$)}
                  class="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                  on:click={() => selectSourceFilter(null)}
                >
                  <span class="w-4 text-center">
                    {#if isAllActive($librarySourceFilter$)}
                      <Fa icon={faCheck} class="text-xs" />
                    {/if}
                  </span>
                  <span>All sources</span>
                </button>
                {#each sourceFilters as sourceFilter (sourceFilter.key ?? 'cloud-setup')}
                  {@const disabled =
                    !sourceFilter.setup &&
                    isSourceDisabled(sourceFilter.requiresConnectivity, $isOnline$)}
                  {@const active = isFilterActive($librarySourceFilter$, sourceFilter.key)}
                  {@const hint = sourceAvailabilityHint(
                    sourceFilter.key,
                    sourceFilter.requiresConnectivity,
                    sourceFilter.setup,
                    $isOnline$,
                    gDriveStatus,
                    oneDriveStatus
                  )}
                  <button
                    type="button"
                    {disabled}
                    aria-pressed={active}
                    title={hint
                      ? `${sourceFilter.label} — ${hint}`
                      : `Show only ${sourceFilter.label}`}
                    class="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    on:click={() =>
                      sourceFilter.setup
                        ? goToCloudSetup()
                        : !disabled && selectSourceFilter(active ? null : sourceFilter.key)}
                  >
                    <span class="w-4 text-center">
                      {#if active}
                        <Fa icon={faCheck} class="text-xs" />
                      {/if}
                    </span>
                    <span class="flex-1">{sourceFilter.label}</span>
                    {#if hint}
                      <span class="text-xs opacity-60">{hint}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <span
                class="text-xs font-semibold uppercase tracking-wide text-[var(--astryx-color-fg-muted)]"
              >
                Reading progress
              </span>
              <SegmentedControl
                size="sm"
                fullWidth
                wrapOnNarrow
                options={PROGRESS_FILTER_OPTIONS}
                value={$libraryFilters$?.progress ?? 'all'}
                on:change={(e) => setProgressFilter(e.detail.value)}
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <span
                class="text-xs font-semibold uppercase tracking-wide text-[var(--astryx-color-fg-muted)]"
              >
                Tags (match all)
              </span>
              {#if !availableTags.length}
                <span class="text-xs text-[var(--astryx-color-fg-muted)]">
                  No tags yet — add tags from a book's details to filter by them.
                </span>
              {:else}
                <div
                  class="flex max-h-40 flex-col gap-0.5 overflow-y-auto"
                  data-testid="library-filter-tags"
                >
                  {#each availableTags as tag (tag)}
                    {@const selected = isTagSelected($libraryFilters$?.tags, tag)}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      data-testid="library-filter-tag-{tag}"
                      class="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:click={() => toggleTagFilter(tag)}
                    >
                      <span
                        class="flex h-4 w-4 items-center justify-center rounded border text-[10px] {selected
                          ? 'border-[var(--astryx-color-primary,#6366f1)] bg-[var(--astryx-color-primary,#6366f1)] text-white'
                          : 'border-[var(--astryx-color-border-default,#d4d4d8)] text-transparent'}"
                      >
                        <Fa icon={faCheck} />
                      </span>
                      <span class="flex-1 truncate">{tag}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <button
              type="button"
              data-testid="library-clear-filters"
              disabled={!combinedFiltersActive}
              class="w-full rounded-lg border border-[var(--astryx-color-border-subtle,#e4e4e7)] px-3 py-1.5 text-sm font-medium text-[var(--astryx-color-fg-secondary)] transition-colors hover:bg-[var(--astryx-color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              on:click={clearLibraryFilters}
            >
              Clear filters
            </button>
          </div>
        </Popover>

        <Popover
          placement="bottom"
          fallbackPlacements={['bottom-end', 'bottom-start']}
          yOffset={4}
          bind:this={sortOptionsElm}
        >
          <div slot="icon">
            <Tooltip text="Select Sort Options">
              <div
                data-testid="library-sort-button"
                title="Select Sort Options"
                class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--astryx-radius-md,6px)] text-[var(--astryx-color-fg-muted)] transition-colors hover:bg-[var(--astryx-color-surface-hover)] hover:text-[var(--astryx-color-fg-primary)]"
              >
                {#if $librarySortOption$.direction === SortDirection.ASC}
                  <Fa icon={faArrowDownShortWide} class="text-base" />
                {:else}
                  <Fa icon={faArrowDownWideShort} class="text-base" />
                {/if}
              </div>
            </Tooltip>
          </div>
          <div
            class="min-w-[12rem] rounded-lg border border-[var(--astryx-color-border-subtle)] bg-[var(--astryx-color-surface)] py-1 shadow-lg"
            slot="content"
          >
            {#each sortMenuItems as sortMenuItem (sortMenuItem.property)}
              {@const isCurrentSort = $librarySortOption$.property === sortMenuItem.property}
              {@const isCurrentSortAsc =
                isCurrentSort && $librarySortOption$.direction === SortDirection.ASC}
              <div
                class="grid grid-cols-[auto_1fr_auto] items-center text-sm transition-colors hover:bg-[var(--astryx-color-surface-hover)]"
                class:bg-[var(--astryx-color-surface-active)]={isCurrentSort}
              >
                <div
                  tabindex="0"
                  role="button"
                  class="cursor-pointer p-2 transition-colors"
                  class:text-[var(--astryx-color-primary)]={isCurrentSortAsc}
                  class:text-[var(--astryx-color-fg-muted)]={!isCurrentSortAsc}
                  class:hover:text-[var(--astryx-color-primary)]={!isCurrentSortAsc}
                  title="Sort Ascending"
                  on:click={() => {
                    changeSortOptions(sortMenuItem.property, SortDirection.ASC);
                  }}
                  on:keyup={dummyFn}
                >
                  <Fa icon={faSortUp} class="px-2" />
                </div>
                <div class="truncate px-1 py-2 font-medium text-[var(--astryx-color-fg-primary)]">
                  {sortMenuItem.label}
                </div>
                <div
                  tabindex="0"
                  role="button"
                  class="cursor-pointer p-2 transition-colors"
                  class:text-[var(--astryx-color-primary)]={isCurrentSort && !isCurrentSortAsc}
                  class:text-[var(--astryx-color-fg-muted)]={!isCurrentSort || isCurrentSortAsc}
                  class:hover:text-[var(--astryx-color-primary)]={!isCurrentSort ||
                    isCurrentSortAsc}
                  title="Sort Descending"
                  on:click={() => {
                    changeSortOptions(sortMenuItem.property, SortDirection.DESC);
                  }}
                  on:keyup={dummyFn}
                >
                  <Fa icon={faSortDown} class="mt-0.5 px-2" />
                </div>
              </div>
            {/each}
          </div>
        </Popover>

        <MergedHeaderIcon
          items={isOldUrl
            ? [
                mergeEntries.MANAGE,
                mergeEntries.DOMAIN_HINT,
                mergeEntries.SETTINGS,
                mergeEntries.DOCUMENTATION,
                mergeEntries.BUG_REPORT,
                ...(dev ? [mergeEntries.UI_SHOWCASE] : [])
              ]
            : [
                mergeEntries.MANAGE,
                mergeEntries.STATISTICS,
                mergeEntries.SETTINGS,
                mergeEntries.DOCUMENTATION,
                mergeEntries.BUG_REPORT,
                ...(dev ? [mergeEntries.UI_SHOWCASE] : [])
              ]}
          on:action={({ detail }) => {
            if (detail === mergeEntries.BUG_REPORT.label) {
              dispatch('bugReportClick');
            }
            if (detail === mergeEntries.DOMAIN_HINT.label) {
              dispatch('domainHintClick');
            }
          }}
        />

        {#if showLoadCount}
          <button
            style:color={!!$fileCountData$ ? 'red' : null}
            on:click={() => countImportElm.click()}>C</button
          >
        {/if}
      {:else}
        <Tooltip text="Open Export Menu">
          <IconButton
            nativeTooltip={false}
            label="Open Export Menu"
            size="md"
            variant="ghost"
            on:click={() => dispatch('replicateData')}
          >
            <Fa icon={faCloudArrowUp} class="text-base" />
          </IconButton>
        </Tooltip>

        {#if isAllActive($librarySourceFilter$) || isFilterActive($librarySourceFilter$, StorageKey.BROWSER)}
          <Tooltip text="Go to Statistics">
            <IconButton
              nativeTooltip={false}
              label="Go to Statistics"
              size="md"
              variant="ghost"
              on:click={() => dispatch('selectionToStatistics')}
            >
              <Fa icon={faChartLine} class="text-base" />
            </IconButton>
          </Tooltip>

          <Tooltip text="Delete Statistics for selected Books">
            <IconButton
              nativeTooltip={false}
              label="Delete Statistics for selected Books"
              size="md"
              variant="ghost"
              on:click={() => dispatch('deleteStatistics')}
            >
              <Fa icon={faCalendarXmark} class="text-base" />
            </IconButton>
          </Tooltip>
        {/if}

        <Tooltip text="Delete selected Books">
          <IconButton
            nativeTooltip={false}
            label="Delete selected Books"
            size="md"
            variant="ghost"
            class="text-[var(--astryx-color-danger,#ef4444)] hover:text-[var(--astryx-color-danger,#ef4444)]"
            on:click={() => dispatch('removeClick')}
          >
            <Fa icon={faTrash} class="text-base" />
          </IconButton>
        </Tooltip>
      {/if}
    </div>
  </TopBar>
{:else}
  <TopBar bordered={true} density="compact">
    <div class="mx-auto flex h-full w-full max-w-2xl items-center justify-between px-2">
      <Popover contentText={cancelTooltip} contentStyles={'padding: 0.75rem'} eventType="pointer">
        <Tooltip text="Cancel Operation">
          <div
            tabindex="0"
            role="button"
            aria-label="Cancel Operation"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--astryx-radius-md,6px)] text-[var(--astryx-color-danger,#ef4444)] hover:bg-[var(--astryx-color-surface-hover)]"
            on:click={() => dispatch('cancelReplication')}
            on:keyup={dummyFn}
          >
            <Fa icon={faCircleXmark} class="text-lg" />
          </div>
        </Tooltip>
      </Popover>
      <div class="mx-4 flex-1">
        <progress
          class="h-2 w-full overflow-hidden rounded-full bg-[var(--astryx-color-surface-hover)] accent-[var(--astryx-color-primary)]"
          value={replicationProgress}
          max={replicationToProgress}
        ></progress>
      </div>
      <div class="min-w-fit text-sm font-medium text-[var(--astryx-color-fg-muted)]">
        {replicationProgressRemaining}
      </div>
    </div>
  </TopBar>
{/if}
