<script lang="ts">
  import {
    faCalendar,
    faCalendarXmark,
    faList,
    faListCheck,
    faTrash,
    faXmark
  } from '@fortawesome/free-solid-svg-icons';
  import {
    preFilteredTitlesForStatistics$,
    type StatisticsTitleFilterItem
  } from '$lib/components/statistics/statistics-types';
  import { lastStatisticsFilterDateRangeOnly$ } from '$lib/data/store';
  import { Combobox } from '@custom-ereader/ui';
  import { createEventDispatcher } from 'svelte';
  import Fa from 'svelte-fa';

  export let statisticsTitleFilters: Map<string, boolean>;
  export let titlesInStatisticsDateRange: Set<string>;
  export let showHeader = true;

  const dispatch = createEventDispatcher<{
    applyFilter: StatisticsTitleFilterItem[];
    clearPrefilter: void;
    close: void;
  }>();

  // Working copy of the committed filter map. Every mutation (add, remove,
  // All, None) is dispatched immediately — there is no staged state and no
  // Apply step. The parent commits the payload and the UI updates live.
  $: titlesToFilter = [...statisticsTitleFilters.entries()].map(([title, isSelected]) => ({
    title,
    isSelected
  }));

  // Search pool for the combobox. The In-range toggle narrows the pool;
  // out-of-range titles stay selectable and carry an "Out of range" hint.
  // Already-added titles are hidden from matches by the combobox itself.
  $: poolOptions = titlesToFilter
    .filter(
      (filterItem) =>
        !$lastStatisticsFilterDateRangeOnly$ || titlesInStatisticsDateRange.has(filterItem.title)
    )
    .map((filterItem) => ({
      value: filterItem.title,
      label: filterItem.title,
      hint: titlesInStatisticsDateRange.has(filterItem.title) ? undefined : 'Out of range'
    }));

  $: selectedValues = titlesToFilter
    .filter((filterItem) => filterItem.isSelected)
    .map((filterItem) => filterItem.title);

  function emitFilter() {
    dispatch(
      'applyFilter',
      titlesToFilter.map((filterItem) => ({ ...filterItem }))
    );
  }

  function handleAdd(event: CustomEvent<{ value: string }>) {
    const target = titlesToFilter.find((filterItem) => filterItem.title === event.detail.value);
    if (target && !target.isSelected) {
      target.isSelected = true;
      titlesToFilter = titlesToFilter;
      emitFilter();
    }
  }

  function handleRemove(event: CustomEvent<{ value: string }>) {
    const target = titlesToFilter.find((filterItem) => filterItem.title === event.detail.value);
    if (target && target.isSelected) {
      target.isSelected = false;
      titlesToFilter = titlesToFilter;
      emitFilter();
    }
  }

  function handleSelectAll(valueToSet: boolean) {
    let changed = false;
    for (let index = 0, { length } = titlesToFilter; index < length; index += 1) {
      if (titlesToFilter[index].isSelected !== valueToSet) {
        titlesToFilter[index].isSelected = valueToSet;
        changed = true;
      }
    }

    if (changed) {
      titlesToFilter = titlesToFilter;
      emitFilter();
    }
  }
</script>

{#if showHeader}
  <div class="flex items-center p-4">
    <button
      title="Close Title Filter"
      aria-label="Close Title Filter"
      class="flex min-h-[44px] min-w-[44px] items-end justify-center md:items-center"
      on:click={() => dispatch('close')}
    >
      <Fa icon={faXmark} />
    </button>
    <div class="ml-2 text-lg font-semibold">Title Filter</div>
  </div>
{/if}
<div class="flex min-w-0 flex-1 flex-col px-4">
  <Combobox
    label="Titles"
    placeholder="Search titles…"
    emptyText="No titles match your search"
    selectedTitle="Included titles"
    options={poolOptions}
    {selectedValues}
    on:add={handleAdd}
    on:remove={handleRemove}
  />
  <div class="mt-4 flex flex-wrap gap-2">
    <button
      type="button"
      title="Select All"
      class="flex min-h-[44px] items-center gap-2 rounded border border-white/30 px-3 text-sm hover:text-red-500"
      on:click={() => handleSelectAll(true)}
    >
      <Fa icon={faListCheck} />
      <span>All</span>
    </button>
    <button
      type="button"
      title="Remove All"
      class="flex min-h-[44px] items-center gap-2 rounded border border-white/30 px-3 text-sm hover:text-red-500"
      on:click={() => handleSelectAll(false)}
    >
      <Fa icon={faList} />
      <span>None</span>
    </button>
    <button
      type="button"
      title={$lastStatisticsFilterDateRangeOnly$
        ? 'Display Titles across all Time'
        : 'Display Titles in selected Date Range only'}
      aria-pressed={$lastStatisticsFilterDateRangeOnly$}
      class="flex min-h-[44px] items-center gap-2 rounded border border-white/30 px-3 text-sm hover:text-red-500"
      class:bg-white={$lastStatisticsFilterDateRangeOnly$}
      class:text-black={$lastStatisticsFilterDateRangeOnly$}
      on:click={() => ($lastStatisticsFilterDateRangeOnly$ = !$lastStatisticsFilterDateRangeOnly$)}
    >
      <Fa icon={$lastStatisticsFilterDateRangeOnly$ ? faCalendarXmark : faCalendar} />
      <span>In range</span>
    </button>
    {#if $preFilteredTitlesForStatistics$.size}
      <button
        type="button"
        title="Remove Prefilter"
        class="flex min-h-[44px] items-center gap-2 rounded border border-white/30 px-3 text-sm hover:text-red-500"
        on:click={() => dispatch('clearPrefilter')}
      >
        <Fa icon={faTrash} />
        <span>Prefilter</span>
      </button>
    {/if}
  </div>
  <p class="mt-2 text-xs opacity-70">
    Tap a title to add it. Changes apply immediately to the Summary and Heatmap tabs.
  </p>
</div>
