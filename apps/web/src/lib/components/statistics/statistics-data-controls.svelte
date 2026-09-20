<script lang="ts">
  import { faXmark } from '@fortawesome/free-solid-svg-icons';
  import StatisticsActionsControls from '$lib/components/statistics/statistics-actions-controls.svelte';
  import StatisticsDateControls from '$lib/components/statistics/statistics-date-controls.svelte';
  import StatisticsDisplayControls from '$lib/components/statistics/statistics-display-controls.svelte';
  import StatisticsTitleFilter from '$lib/components/statistics/statistics-title-filter.svelte';
  import {
    type StatisticsDataControlsTab,
    type StatisticsDateChange,
    type StatisticsTitleFilterItem,
    statisticsScopeSummary$
  } from '$lib/components/statistics/statistics-types';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { skipKeyDownListener$ } from '$lib/data/store';
  import { secondsToMinutes } from '$lib/functions/statistic-util';
  import { Tabs } from '@custom-ereader/ui';
  import { createEventDispatcher, onMount } from 'svelte';
  import Fa from 'svelte-fa';

  export let initialTab: StatisticsDataControlsTab = 'dates';
  export let statisticsTitleFilters: Map<string, boolean>;
  export let titlesInStatisticsDateRange: Set<string>;
  export let statisticsDateRangeLabel: string;

  const dispatch = createEventDispatcher<{
    close: void;
    statisticsDateChange: StatisticsDateChange;
    applyFilter: StatisticsTitleFilterItem[];
    clearPrefilter: void;
  }>();

  const tabItems = [
    { id: 'dates', label: 'Dates' },
    { id: 'titles', label: 'Titles' },
    { id: 'display', label: 'Display' },
    { id: 'actions', label: 'Actions' }
  ];

  let activeTab: StatisticsDataControlsTab = initialTab;

  onMount(() => {
    $skipKeyDownListener$ = true;
    dialogManager.dialogs$.next([{ component: '<div/>' }]);

    return () => {
      dialogManager.dialogs$.next([]);
      $skipKeyDownListener$ = false;
    };
  });
</script>

<div class="flex items-center p-4">
  <button
    type="button"
    title="Close Advanced Filtering"
    aria-label="Close Advanced Filtering"
    class="flex min-h-[44px] min-w-[44px] items-end justify-center md:items-center"
    on:click={() => dispatch('close')}
  >
    <Fa icon={faXmark} />
  </button>
  <div class="ml-2 text-lg font-semibold">Advanced Filtering</div>
</div>
<div class="px-4">
  <Tabs
    items={tabItems}
    activeId={activeTab}
    variant="pill"
    size="md"
    fullWidth
    class="statistics-data-tabs"
    on:change={(event) => (activeTab = event.detail.id as StatisticsDataControlsTab)}
  />
</div>
<div class="flex min-h-0 w-full max-w-full min-w-0 flex-1 flex-col overflow-auto px-4 py-4">
  {#if activeTab === 'dates'}
    <StatisticsDateControls on:statisticsDateChange />
  {:else if activeTab === 'titles'}
    <StatisticsTitleFilter
      {statisticsTitleFilters}
      {titlesInStatisticsDateRange}
      showHeader={false}
      on:applyFilter
      on:clearPrefilter
      on:close={() => dispatch('close')}
    />
  {:else if activeTab === 'display'}
    <StatisticsDisplayControls />
  {:else}
    <StatisticsActionsControls {statisticsDateRangeLabel} />
  {/if}
</div>
<div class="border-t border-white/20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
  <div
    class="truncate text-sm font-semibold"
    title={`${$statisticsScopeSummary$.selectedTitles} of ${$statisticsScopeSummary$.totalTitles} titles · ${statisticsDateRangeLabel}`}
  >
    {$statisticsScopeSummary$.selectedTitles} of {$statisticsScopeSummary$.totalTitles} titles · {statisticsDateRangeLabel}
  </div>
  <div class="mt-1 text-sm opacity-80">
    {secondsToMinutes($statisticsScopeSummary$.readingTimeSeconds)} min · {$statisticsScopeSummary$.charactersRead}
    characters
  </div>
  <button
    type="button"
    class="mt-3 flex min-h-[44px] w-full items-center justify-center rounded bg-white font-semibold text-black"
    on:click={() => dispatch('close')}
  >
    Close
  </button>
</div>

<style>
  /* All four tabs must fit side-by-side at 360px without horizontal
     scrolling: slimmer horizontal padding plus full touch-target height. */
  @media (max-width: 639px) {
    :global(.statistics-data-tabs.astryx-tabs-container .astryx-tab-btn) {
      min-height: 44px;
      height: 44px;
      padding-left: 10px;
      padding-right: 10px;
    }
  }
</style>
