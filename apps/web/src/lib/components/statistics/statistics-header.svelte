<script lang="ts">
  import { browser } from '$app/environment';
  import { goto, preloadCode } from '$app/navigation';
  import {
    faCog,
    faCopy,
    faEllipsis,
    faFilter,
    faSignOutAlt,
    faSliders
  } from '@fortawesome/free-solid-svg-icons';
  import { mergeEntries } from '$lib/components/merged-header-icon/merged-entries';
  import Popover from '$lib/components/popover/popover.svelte';
  import {
    StatisticsTab,
    copyStatisticsData$,
    statisticsTitleFilterEnabled$,
    statisticsTitleFilterIsOpen$,
    type StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import { pagePath } from '$lib/data/env';
  import { lastStatisticsTab$ } from '$lib/data/store';
  import { IconButton, OverflowList, SegmentedControl, Tooltip, TopBar } from '@custom-ereader/ui';
  import Fa from 'svelte-fa';

  export let currentBookId: number | undefined;
  export let showStatisticsSettings: boolean;

  const copyStatisticsDataItems: StatisticsDataSource[] = [
    { key: 'readingTime', label: 'Reading Time' },
    { key: 'charactersRead', label: 'Characters Read' }
  ];

  const tabOptions = [
    { value: StatisticsTab.SUMMARY, label: 'Summary' },
    { value: StatisticsTab.OVERVIEW, label: 'Heatmap' },
    { value: StatisticsTab.LOOKBACK, label: 'Recap' }
  ];

  let copyStatisticsDataPopover: Popover;
  let overflowMenuElm: Popover;

  let headerWidth = 0;
  let startWidth = 0;
  let windowInnerWidth = 0;

  $: viewportWidth = windowInnerWidth || (browser ? window.innerWidth : 1024);
  $: actualHeaderWidth = Math.min(headerWidth || viewportWidth, viewportWidth);
  $: availableActionsWidth = Math.max(
    0,
    actualHeaderWidth - (startWidth || 200) - (actualHeaderWidth >= 768 ? 64 : 48)
  );

  type StatisticsActionId =
    'filter' | 'statsSettings' | 'backToBook' | 'copyData' | 'settings' | 'manage';

  interface StatisticsActionItem {
    id: StatisticsActionId;
  }

  $: actionItems = [
    ...($lastStatisticsTab$ !== StatisticsTab.LOOKBACK ? [{ id: 'filter' as const }] : []),
    { id: 'statsSettings' as const },
    ...(currentBookId ? [{ id: 'backToBook' as const }] : []),
    { id: 'copyData' as const },
    { id: 'settings' as const },
    { id: 'manage' as const }
  ];
</script>

<svelte:window bind:innerWidth={windowInnerWidth} />

<div class="w-full max-w-full overflow-hidden" bind:clientWidth={headerWidth}>
  <TopBar bordered={true} class="shadow-sm">
    <div slot="start" bind:clientWidth={startWidth} class="flex items-center gap-3">
      <div class="font-semibold text-sm tracking-tight hidden md:block opacity-90 pl-1">
        Statistics
      </div>
      <SegmentedControl size="sm" options={tabOptions} bind:value={$lastStatisticsTab$} />
    </div>

    <div slot="end" class="flex items-center gap-0.5 sm:gap-1">
      <OverflowList
        items={actionItems}
        availableWidth={availableActionsWidth}
        itemWidth={36}
        overflowWidth={36}
        gap={4}
        let:item
      >
        <!-- Visible Items on the Bar -->
        {#if item.id === 'filter'}
          <Tooltip
            text={$statisticsTitleFilterEnabled$
              ? 'Open Title Filter'
              : 'Title filter not applicable'}
          >
            <IconButton
              nativeTooltip={false}
              variant="ghost"
              size="md"
              label="Open Title Filter"
              disabled={!$statisticsTitleFilterEnabled$}
              active={$statisticsTitleFilterIsOpen$}
              on:click={() => {
                if ($statisticsTitleFilterEnabled$) {
                  $statisticsTitleFilterIsOpen$ = true;
                }
              }}
            >
              <Fa icon={faFilter} />
            </IconButton>
          </Tooltip>
        {:else if item.id === 'statsSettings'}
          <Tooltip text="Statistics Settings">
            <IconButton
              nativeTooltip={false}
              variant="ghost"
              size="md"
              label="Statistics Settings"
              on:click={() => (showStatisticsSettings = true)}
            >
              <Fa icon={faSliders} />
            </IconButton>
          </Tooltip>
        {:else if item.id === 'backToBook'}
          {#if currentBookId}
            <Tooltip text="Back to Current Book">
              <IconButton
                nativeTooltip={false}
                variant="ghost"
                size="md"
                label="Back to Current Book"
                on:mouseenter={() => preloadCode(`${pagePath}/b?id=${currentBookId}`)}
                on:pointerdown={() => preloadCode(`${pagePath}/b?id=${currentBookId}`)}
                on:click={() => goto(`${pagePath}/b?id=${currentBookId}`)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                >
                  <path
                    d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5zm-3.5-8c.88 0 1.73.09 2.5.26V9.24c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99zM13 12.49v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26V11.9c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.3-4.5.83zm4.5 1.84c-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26v-1.52c-.79-.16-1.64-.24-2.5-.24z"
                  />
                </svg>
              </IconButton>
            </Tooltip>
          {/if}
        {:else if item.id === 'copyData'}
          <Popover
            placement="bottom"
            fallbackPlacements={['bottom-end', 'bottom-start']}
            yOffset={4}
            bind:this={copyStatisticsDataPopover}
          >
            <div slot="icon">
              <Tooltip text="Copy Data in TMW Log Format">
                <IconButton
                  nativeTooltip={false}
                  variant="ghost"
                  size="md"
                  label="Copy Data in TMW Log Format"
                >
                  <Fa icon={faCopy} />
                </IconButton>
              </Tooltip>
            </div>
            <div
              class="w-44 py-1.5 rounded-lg border shadow-lg text-sm"
              style="background-color: var(--astryx-color-surface, #ffffff); border-color: var(--astryx-color-border-default, #e4e4e7); color: var(--astryx-color-fg-primary, #18181b);"
              slot="content"
            >
              {#each copyStatisticsDataItems as copyStatisticsDataItem (copyStatisticsDataItem.key)}
                <button
                  type="button"
                  class="w-full px-3.5 py-2 text-sm text-left hover:bg-[var(--astryx-color-surface-hover,#f4f4f5)] transition-colors cursor-pointer"
                  style="color: var(--astryx-color-fg-primary, inherit);"
                  on:click={() => {
                    copyStatisticsData$.next(copyStatisticsDataItem.key);
                    copyStatisticsDataPopover.toggleOpen();
                  }}
                >
                  {copyStatisticsDataItem.label}
                </button>
              {/each}
            </div>
          </Popover>
        {:else if item.id === 'settings'}
          <Tooltip text={mergeEntries.SETTINGS.title}>
            <IconButton
              nativeTooltip={false}
              variant="ghost"
              size="md"
              label={mergeEntries.SETTINGS.title}
              on:mouseenter={() => preloadCode(`${pagePath}${mergeEntries.SETTINGS.routeId}`)}
              on:pointerdown={() => preloadCode(`${pagePath}${mergeEntries.SETTINGS.routeId}`)}
              on:click={() => goto(`${pagePath}${mergeEntries.SETTINGS.routeId}`)}
            >
              <Fa icon={faCog} />
            </IconButton>
          </Tooltip>
        {:else if item.id === 'manage'}
          <Tooltip text={mergeEntries.MANAGE.title}>
            <IconButton
              nativeTooltip={false}
              variant="ghost"
              size="md"
              label={mergeEntries.MANAGE.title}
              on:mouseenter={() => preloadCode(`${pagePath}${mergeEntries.MANAGE.routeId}`)}
              on:pointerdown={() => preloadCode(`${pagePath}${mergeEntries.MANAGE.routeId}`)}
              on:click={() => goto(`${pagePath}${mergeEntries.MANAGE.routeId}`)}
            >
              <Fa icon={faSignOutAlt} />
            </IconButton>
          </Tooltip>
        {/if}

        <!-- Overflow Popover (rendered when any items overflow) -->
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
                class="w-52 py-1.5 rounded-lg border border-[var(--astryx-color-border-subtle,#e4e4e7)] bg-[var(--astryx-color-surface,#ffffff)] text-[var(--astryx-color-fg-primary,#18181b)] shadow-lg text-sm"
                slot="content"
              >
                {#each overflowItems as oItem (oItem.id)}
                  {#if oItem.id === 'filter'}
                    <button
                      type="button"
                      disabled={!$statisticsTitleFilterEnabled$}
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      on:click={() => {
                        if ($statisticsTitleFilterEnabled$) {
                          $statisticsTitleFilterIsOpen$ = true;
                          overflowMenuElm?.toggleOpen();
                        }
                      }}
                    >
                      <Fa icon={faFilter} class="w-4 text-center opacity-70" />
                      <span>Open Title Filter</span>
                    </button>
                  {:else if oItem.id === 'statsSettings'}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:click={() => {
                        showStatisticsSettings = true;
                        overflowMenuElm?.toggleOpen();
                      }}
                    >
                      <Fa icon={faSliders} class="w-4 text-center opacity-70" />
                      <span>Statistics Settings</span>
                    </button>
                  {:else if oItem.id === 'backToBook'}
                    {#if currentBookId}
                      <button
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                        on:mouseenter={() => preloadCode(`${pagePath}/b?id=${currentBookId}`)}
                        on:pointerdown={() => preloadCode(`${pagePath}/b?id=${currentBookId}`)}
                        on:click={() => {
                          overflowMenuElm?.toggleOpen();
                          goto(`${pagePath}/b?id=${currentBookId}`);
                        }}
                      >
                        <span
                          class="w-4 text-center opacity-70 inline-flex items-center justify-center"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="currentColor"
                          >
                            <path
                              d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5zm-3.5-8c.88 0 1.73.09 2.5.26V9.24c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99zM13 12.49v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26V11.9c-.79-.15-1.64-.24-2.5-.24-1.7 0-3.24.3-4.5.83zm4.5 1.84c-1.7 0-3.24.29-4.5.83v1.66c1.13-.64 2.7-.99 4.5-.99.88 0 1.73.09 2.5.26v-1.52c-.79-.16-1.64-.24-2.5-.24z"
                            />
                          </svg>
                        </span>
                        <span>Back to Current Book</span>
                      </button>
                    {/if}
                  {:else if oItem.id === 'copyData'}
                    {#each copyStatisticsDataItems as copyStatisticsDataItem (copyStatisticsDataItem.key)}
                      <button
                        type="button"
                        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                        on:click={() => {
                          copyStatisticsData$.next(copyStatisticsDataItem.key);
                          overflowMenuElm?.toggleOpen();
                        }}
                      >
                        <Fa icon={faCopy} class="w-4 text-center opacity-70" />
                        <span>Copy {copyStatisticsDataItem.label}</span>
                      </button>
                    {/each}
                  {:else if oItem.id === 'settings'}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:mouseenter={() =>
                        preloadCode(`${pagePath}${mergeEntries.SETTINGS.routeId}`)}
                      on:pointerdown={() =>
                        preloadCode(`${pagePath}${mergeEntries.SETTINGS.routeId}`)}
                      on:click={() => {
                        overflowMenuElm?.toggleOpen();
                        goto(`${pagePath}${mergeEntries.SETTINGS.routeId}`);
                      }}
                    >
                      <Fa icon={faCog} class="w-4 text-center opacity-70" />
                      <span>{mergeEntries.SETTINGS.label}</span>
                    </button>
                  {:else if oItem.id === 'manage'}
                    <button
                      type="button"
                      class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left text-[var(--astryx-color-fg-primary)] hover:bg-[var(--astryx-color-surface-hover)] focus-visible:bg-[var(--astryx-color-surface-hover)] outline-none transition-colors cursor-pointer"
                      on:mouseenter={() => preloadCode(`${pagePath}${mergeEntries.MANAGE.routeId}`)}
                      on:pointerdown={() =>
                        preloadCode(`${pagePath}${mergeEntries.MANAGE.routeId}`)}
                      on:click={() => {
                        overflowMenuElm?.toggleOpen();
                        goto(`${pagePath}${mergeEntries.MANAGE.routeId}`);
                      }}
                    >
                      <Fa icon={faSignOutAlt} class="w-4 text-center opacity-70" />
                      <span>{mergeEntries.MANAGE.label}</span>
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
