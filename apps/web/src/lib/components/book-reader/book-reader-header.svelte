<script lang="ts">
  import { browser } from '$app/environment';
  import { faBookmark as farBookmark } from '@fortawesome/free-regular-svg-icons';
  import {
    faBookBookmark,
    faBookmark as fasBookmark,
    faChartLine,
    faCog,
    faCrosshairs,
    faEllipsis,
    faExpand,
    faFlag,
    faHashtag,
    faImages,
    faList,
    faSignOutAlt,
    faTriangleExclamation,
    type IconDefinition
  } from '@fortawesome/free-solid-svg-icons';
  import { preloadCode } from '$app/navigation';
  import { readerImageGalleryPictures$ } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery';
  import SyncActivityIcon from '$lib/components/cloud/sync-activity-icon.svelte';
  import { mergeEntries } from '$lib/components/merged-header-icon/merged-entries';
  import Popover from '$lib/components/popover/popover.svelte';
  import {
    IconButton,
    Tooltip,
    TopBar,
    OverflowList,
    CloudStatusIcon,
    GoalProgressChip
  } from '@custom-ereader/ui';
  import type { GoalProgressChipState } from '@custom-ereader/ui';
  import { pagePath } from '$lib/data/env';
  import { customReadingPointEnabled$, viewMode$ } from '$lib/data/store';
  import { ViewMode } from '$lib/data/view-mode';
  import { dummyFn, isMobile$, isOnOldUrl } from '$lib/functions/utils';
  import { createEventDispatcher } from 'svelte';
  import Fa from 'svelte-fa';

  export let hasChapterData: boolean;
  export let hasText: boolean;
  export let autoScrollMultiplier: number;
  export let hasCustomReadingPoint: boolean;
  export let showFullscreenButton: boolean;
  export let isBookmarkScreen: boolean;
  export let showCloudWarning = false;
  export let cloudWarningLabel = 'Cloud session expired. Reconnect to resume syncing.';
  export let goalTimeLabel = '';
  export let goalTimePercent = 0;
  export let goalCharLabel = '';
  export let goalCharPercent = 0;
  export let goalWindowLabel = '';
  export let goalRemainingLabel = '';
  export let goalState: GoalProgressChipState = 'active';

  const dispatch = createEventDispatcher<{
    tocClick: void;
    bookmarkPanelClick: void;
    createBookmarkClick: void;
    bookmarkClick: void;
    jumpClick: void;
    completeBook: void;
    fullscreenClick: void;
    showCustomReadingPoint: void;
    setCustomReadingPoint: void;
    resetCustomReadingPoint: void;
    statisticsClick: void;
    readerImageGalleryClick: void;
    settingsClick: void;
    domainHintClick: void;
    bookManagerClick: void;
    cloudReconnectClick: void;
    goalClick: void;
  }>();

  let bookmarkPressTimer: any;
  let didLongPress = false;

  function handleBookmarkPointerDown() {
    didLongPress = false;
    bookmarkPressTimer = setTimeout(() => {
      didLongPress = true;
      dispatch('createBookmarkClick');
    }, 500);
  }

  function handleBookmarkPointerUp() {
    clearTimeout(bookmarkPressTimer);
  }

  function handleBookmarkClick() {
    if (didLongPress) {
      didLongPress = false;
      return;
    }
    dispatch('bookmarkClick');
  }

  $: customReadingPointMenuItems = [
    ...(hasCustomReadingPoint
      ? [{ label: 'Show Point', action: 'showCustomReadingPoint' as const }]
      : []),
    { label: 'Set Point', action: 'setCustomReadingPoint' as const },
    ...(hasCustomReadingPoint
      ? [{ label: 'Reset Point', action: 'resetCustomReadingPoint' as const }]
      : [])
  ];

  let customReadingPointMenuElm: Popover;
  let overflowMenuElm: Popover;

  let headerWidth = 0;
  let startWidth = 0;
  let primaryEndWidth = 0;
  let windowInnerWidth = 0;

  $: actualHeaderWidth = headerWidth || windowInnerWidth || (browser ? window.innerWidth : 1024);
  $: availableSecondaryWidth = Math.max(
    0,
    actualHeaderWidth -
      (startWidth || 150) -
      (primaryEndWidth || 120) -
      (actualHeaderWidth >= 768 ? 52 : 36)
  );

  type SecondaryActionId = 'complete' | 'customPoint' | 'stats' | 'jump' | 'gallery' | 'docs';

  interface SecondaryActionItem {
    id: SecondaryActionId;
  }

  $: secondaryItems = [
    { id: 'complete' as const },
    ...($customReadingPointEnabled$ || $viewMode$ === ViewMode.Paginated
      ? [{ id: 'customPoint' as const }]
      : []),
    { id: 'stats' as const },
    ...(hasText ? [{ id: 'jump' as const }] : []),
    ...($readerImageGalleryPictures$.length ? [{ id: 'gallery' as const }] : []),
    { id: 'docs' as const }
  ];

  $: isOldUrl = browser && isOnOldUrl(window);

  function dispatchCustomReadingPointAction(action: any) {
    dispatch(action);
    customReadingPointMenuElm.toggleOpen();
  }
</script>

<svelte:window bind:innerWidth={windowInnerWidth} />

<div class="w-full" bind:clientWidth={headerWidth}>
  <TopBar bordered={true} density="compact" translucent={true}>
    <!-- Left / Start Actions -->
    <div slot="start" bind:clientWidth={startWidth} class="flex items-center gap-0.5 sm:gap-1">
      {#if hasChapterData}
        <Tooltip text="Open Table of Contents">
          <IconButton
            nativeTooltip={false}
            label="Open Table of Contents"
            size="md"
            variant="ghost"
            on:click={() => dispatch('tocClick')}
          >
            <Fa icon={faList} class="text-base" />
          </IconButton>
        </Tooltip>
      {/if}

      <Tooltip text="Open Bookmarks">
        <IconButton
          nativeTooltip={false}
          label="Open Bookmarks"
          size="md"
          variant="ghost"
          on:click={() => dispatch('bookmarkPanelClick')}
        >
          <Fa icon={faBookBookmark} class="text-base" />
        </IconButton>
      </Tooltip>

      <Tooltip text="Save Position (Hold to Create Named Bookmark)">
        <IconButton
          nativeTooltip={false}
          label="Save Position (Hold to Create Named Bookmark)"
          size="md"
          variant="ghost"
          active={isBookmarkScreen}
          on:pointerdown={handleBookmarkPointerDown}
          on:pointerup={handleBookmarkPointerUp}
          on:contextmenu={(e) => {
            e.preventDefault();
            dispatch('createBookmarkClick');
          }}
          on:click={handleBookmarkClick}
        >
          <Fa icon={isBookmarkScreen ? fasBookmark : farBookmark} class="text-base" />
        </IconButton>
      </Tooltip>

      {#if showCloudWarning}
        <CloudStatusIcon
          label={cloudWarningLabel}
          state="warning"
          on:click={() => dispatch('cloudReconnectClick')}
        >
          <Fa icon={faTriangleExclamation} class="text-base" />
        </CloudStatusIcon>
      {/if}

      <SyncActivityIcon />

      {#if goalTimeLabel !== '' || goalCharLabel !== ''}
        <GoalProgressChip
          variant="badge"
          size="sm"
          timeLabel={goalTimeLabel}
          timePercent={goalTimePercent}
          charLabel={goalCharLabel}
          charPercent={goalCharPercent}
          windowLabel={goalWindowLabel}
          remainingLabel={goalRemainingLabel}
          state={goalState}
          label="Current reading goal"
          on:click={() => dispatch('goalClick')}
        />
      {/if}

      {#if $viewMode$ === ViewMode.Continuous && !$isMobile$}
        <Tooltip text="Current Autoscroll Speed">
          <span
            class="ml-1 flex items-center rounded-full bg-[var(--astryx-color-surface-hover)] px-2 py-0.5 text-xs font-semibold text-[var(--astryx-color-fg-muted)]"
          >
            {autoScrollMultiplier}x
          </span>
        </Tooltip>
      {/if}
    </div>

    <!-- Right / End Actions -->
    <div slot="end" class="flex items-center gap-0.5 sm:gap-1">
      <!-- Navigation Hub & Fullscreen (Always visible left-most icons of the right side) -->
      <div class="flex items-center gap-0.5 sm:gap-1" bind:clientWidth={primaryEndWidth}>
        <Tooltip text={mergeEntries.SETTINGS.title}>
          <IconButton
            nativeTooltip={false}
            label={mergeEntries.SETTINGS.title}
            size="md"
            variant="ghost"
            on:mouseenter={() => preloadCode(`${pagePath}${mergeEntries.SETTINGS.routeId}`)}
            on:pointerdown={() => preloadCode(`${pagePath}${mergeEntries.SETTINGS.routeId}`)}
            on:click={() => dispatch('settingsClick')}
          >
            <Fa icon={faCog} class="text-base" />
          </IconButton>
        </Tooltip>

        <Tooltip text={mergeEntries.MANAGE.title}>
          <IconButton
            nativeTooltip={false}
            label={mergeEntries.MANAGE.title}
            size="md"
            variant="ghost"
            on:mouseenter={() => preloadCode(`${pagePath}${mergeEntries.MANAGE.routeId}`)}
            on:pointerdown={() => preloadCode(`${pagePath}${mergeEntries.MANAGE.routeId}`)}
            on:click={() => dispatch('bookManagerClick')}
          >
            <Fa icon={faSignOutAlt} class="text-base" />
          </IconButton>
        </Tooltip>

        {#if showFullscreenButton}
          <Tooltip text="Toggle Fullscreen">
            <IconButton
              nativeTooltip={false}
              label="Toggle Fullscreen"
              size="md"
              variant="ghost"
              on:click={() => dispatch('fullscreenClick')}
            >
              <Fa icon={faExpand} class="text-base" />
            </IconButton>
          </Tooltip>
        {/if}
      </div>

      <!-- Astryx Adaptive OverflowList: smoothly collapses one icon at a time based on space -->
      <OverflowList
        items={secondaryItems}
        availableWidth={availableSecondaryWidth}
        itemWidth={36}
        overflowWidth={36}
        gap={4}
        let:item
      >
        <!-- Visible Items on the Bar -->
        {#if item.id === 'complete'}
          <Tooltip text="Complete Book">
            <IconButton
              nativeTooltip={false}
              label="Complete Book"
              size="md"
              variant="ghost"
              on:click={() => dispatch('completeBook')}
            >
              <Fa icon={faFlag} class="text-base" />
            </IconButton>
          </Tooltip>
        {:else if item.id === 'customPoint'}
          {#if $customReadingPointEnabled$ || $viewMode$ === ViewMode.Paginated}
            <Popover
              placement="bottom-end"
              fallbackPlacements={['bottom-start', 'bottom']}
              yOffset={4}
              bind:this={customReadingPointMenuElm}
            >
              <div slot="icon">
                <Tooltip text="Open Custom Point Actions">
                  <div
                    class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--astryx-radius-md,6px)] text-[var(--astryx-color-fg-muted)] transition-colors hover:bg-[var(--astryx-color-surface-hover)] hover:text-[var(--astryx-color-fg-primary)]"
                  >
                    <Fa icon={faCrosshairs} class="text-base" />
                  </div>
                </Tooltip>
              </div>
              <div
                class="min-w-[8.5rem] rounded-lg border border-[var(--astryx-color-border-subtle)] bg-[var(--astryx-color-surface)] py-1 shadow-lg"
                slot="content"
              >
                {#each customReadingPointMenuItems as actionItem (actionItem.label)}
                  <div
                    tabindex="0"
                    role="button"
                    class="cursor-pointer px-4 py-2 text-left text-sm text-[var(--astryx-color-fg-primary)] transition-colors hover:bg-[var(--astryx-color-surface-hover)]"
                    on:click={() => dispatchCustomReadingPointAction(actionItem.action)}
                    on:keyup={dummyFn}
                  >
                    {actionItem.label}
                  </div>
                {/each}
              </div>
            </Popover>
          {/if}
        {:else if item.id === 'stats'}
          {#if isOldUrl}
            <Tooltip text={mergeEntries.DOMAIN_HINT.title}>
              <IconButton
                nativeTooltip={false}
                label={mergeEntries.DOMAIN_HINT.title}
                size="md"
                variant="ghost"
                on:click={() => dispatch('domainHintClick')}
              >
                <Fa icon={faTriangleExclamation} class="text-base" />
              </IconButton>
            </Tooltip>
          {:else}
            <Tooltip text={mergeEntries.STATISTICS.title}>
              <IconButton
                nativeTooltip={false}
                label={mergeEntries.STATISTICS.title}
                size="md"
                variant="ghost"
                on:mouseenter={() => preloadCode(`${pagePath}${mergeEntries.STATISTICS.routeId}`)}
                on:pointerdown={() => preloadCode(`${pagePath}${mergeEntries.STATISTICS.routeId}`)}
                on:click={() => dispatch('statisticsClick')}
              >
                <Fa icon={faChartLine} class="text-base" />
              </IconButton>
            </Tooltip>
          {/if}
        {:else if item.id === 'jump'}
          {#if hasText}
            <Tooltip text={mergeEntries.JUMP_TO_POSITION.title}>
              <IconButton
                nativeTooltip={false}
                label={mergeEntries.JUMP_TO_POSITION.title}
                size="md"
                variant="ghost"
                on:click={() => dispatch('jumpClick')}
              >
                <Fa icon={faHashtag} class="text-base" />
              </IconButton>
            </Tooltip>
          {/if}
        {:else if item.id === 'gallery'}
          {#if $readerImageGalleryPictures$.length}
            <Tooltip text={mergeEntries.READER_IMAGE_GALLERY.title}>
              <IconButton
                nativeTooltip={false}
                label={mergeEntries.READER_IMAGE_GALLERY.title}
                size="md"
                variant="ghost"
                on:click={() => dispatch('readerImageGalleryClick')}
              >
                <Fa icon={faImages} class="text-base" />
              </IconButton>
            </Tooltip>
          {/if}
        {:else if item.id === 'docs'}
          <Tooltip text={mergeEntries.DOCUMENTATION.title}>
            <IconButton
              nativeTooltip={false}
              label={mergeEntries.DOCUMENTATION.title}
              size="md"
              variant="ghost"
              on:click={() =>
                window.open(`${pagePath}${mergeEntries.DOCUMENTATION.routeId}`, '_blank')}
            >
              <Fa icon={mergeEntries.DOCUMENTATION.icon} class="text-base" />
            </IconButton>
          </Tooltip>
        {/if}

        <!-- Overflow Popover (rendered when any secondary items overflow) -->
        <svelte:fragment slot="overflow" let:overflowItems>
          <div>
            <Popover
              placement="bottom-end"
              fallbackPlacements={['bottom-start', 'bottom']}
              yOffset={4}
              bind:this={overflowMenuElm}
            >
              <div slot="icon">
                <Tooltip text="More Actions">
                  <IconButton nativeTooltip={false} variant="ghost" size="md" label="More Actions">
                    <Fa icon={faEllipsis} class="text-base" />
                  </IconButton>
                </Tooltip>
              </div>
              <div
                class="w-52 py-1.5 rounded-lg border border-[var(--astryx-color-border-subtle)] bg-[var(--astryx-color-surface)] text-[var(--astryx-color-fg-primary)] shadow-lg text-sm"
                slot="content"
              >
                {#each overflowItems as oItem (oItem.id)}
                  {#if oItem.id === 'complete'}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:click={() => {
                        dispatch('completeBook');
                        overflowMenuElm?.toggleOpen();
                      }}
                    >
                      <Fa icon={faFlag} class="w-4 text-center opacity-70" />
                      <span>Complete Book</span>
                    </button>
                  {:else if oItem.id === 'customPoint'}
                    {#if hasCustomReadingPoint}
                      <button
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                        on:click={() => {
                          dispatch('showCustomReadingPoint');
                          overflowMenuElm?.toggleOpen();
                        }}
                      >
                        <Fa icon={faCrosshairs} class="w-4 text-center opacity-70" />
                        <span>Show Reading Point</span>
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:click={() => {
                        dispatch('setCustomReadingPoint');
                        overflowMenuElm?.toggleOpen();
                      }}
                    >
                      <Fa icon={faCrosshairs} class="w-4 text-center opacity-70" />
                      <span>Set Reading Point</span>
                    </button>
                    {#if hasCustomReadingPoint}
                      <button
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                        on:click={() => {
                          dispatch('resetCustomReadingPoint');
                          overflowMenuElm?.toggleOpen();
                        }}
                      >
                        <Fa icon={faCrosshairs} class="w-4 text-center opacity-70" />
                        <span>Reset Reading Point</span>
                      </button>
                    {/if}
                  {:else if oItem.id === 'stats'}
                    {#if isOldUrl}
                      <button
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                        on:click={() => {
                          dispatch('domainHintClick');
                          overflowMenuElm?.toggleOpen();
                        }}
                      >
                        <Fa icon={faTriangleExclamation} class="w-4 text-center opacity-70" />
                        <span>{mergeEntries.DOMAIN_HINT.label}</span>
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                        on:mouseenter={() =>
                          preloadCode(`${pagePath}${mergeEntries.STATISTICS.routeId}`)}
                        on:pointerdown={() =>
                          preloadCode(`${pagePath}${mergeEntries.STATISTICS.routeId}`)}
                        on:click={() => {
                          dispatch('statisticsClick');
                          overflowMenuElm?.toggleOpen();
                        }}
                      >
                        <Fa icon={faChartLine} class="w-4 text-center opacity-70" />
                        <span>{mergeEntries.STATISTICS.label}</span>
                      </button>
                    {/if}
                  {:else if oItem.id === 'jump'}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:click={() => {
                        dispatch('jumpClick');
                        overflowMenuElm?.toggleOpen();
                      }}
                    >
                      <Fa icon={faHashtag} class="w-4 text-center opacity-70" />
                      <span>Jump to Position</span>
                    </button>
                  {:else if oItem.id === 'gallery'}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:click={() => {
                        dispatch('readerImageGalleryClick');
                        overflowMenuElm?.toggleOpen();
                      }}
                    >
                      <Fa icon={faImages} class="w-4 text-center opacity-70" />
                      <span>Image Gallery</span>
                    </button>
                  {:else if oItem.id === 'docs'}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:click={() => {
                        window.open(`${pagePath}${mergeEntries.DOCUMENTATION.routeId}`, '_blank');
                        overflowMenuElm?.toggleOpen();
                      }}
                    >
                      <Fa
                        icon={mergeEntries.DOCUMENTATION.icon}
                        class="w-4 text-center opacity-70"
                      />
                      <span>{mergeEntries.DOCUMENTATION.label}</span>
                    </button>
                  {/if}
                {/each}
              </div>
            </Popover>
          </div>
        </svelte:fragment>
      </OverflowList>
    </div>
  </TopBar>
</div>
