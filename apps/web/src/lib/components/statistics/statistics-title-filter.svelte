<script lang="ts">
  import {
    faCalendar,
    faCalendarXmark,
    faChevronLeft,
    faChevronRight,
    faCircleCheck,
    faEye,
    faEyeSlash,
    faList,
    faListCheck,
    faTrash,
    faXmark
  } from '@fortawesome/free-solid-svg-icons';
  import {
    preFilteredTitlesForStatistics$,
    type StatisticsTitleFilterItem
  } from '$lib/components/statistics/statistics-types';
  import {
    lastStatisticsFilterDateRangeOnly$,
    lastStatisticsFilterShowSelectedTitlesOnly$
  } from '$lib/data/store';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';
  import { convertRemToPixels, getFullHeight, limitToRange } from '$lib/functions/utils';
  import { debounceTime, fromEvent, tap } from 'rxjs';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import Fa from 'svelte-fa';

  export let statisticsTitleFilters: Map<string, boolean>;
  export let titlesInStatisticsDateRange: Set<string>;
  export let showHeader = true;

  const dispatch = createEventDispatcher<{
    applyFilter: StatisticsTitleFilterItem[];
    clearPrefilter: void;
    close: void;
  }>();

  const resizeHandler$ = fromEvent(window, 'resize').pipe(
    debounceTime(250),
    tap(() => updateStatisticsTitleFilterRowsPerPage),
    reduceToEmptyString()
  );

  const statisticsTitleFilterBaseRowRem = 4;
  const statisticsTitleFilterBaseRowGap = 2;

  let statisticsTitleFilterTableContainerElm: HTMLElement;
  let statisticsTitleFilterButtonContainer: HTMLElement;
  let titleFilter = '';
  let titleFilterTimer: number | undefined;
  let titlesToFilter: StatisticsTitleFilterItem[] = [];
  let filteredTitles: StatisticsTitleFilterItem[] = [];
  let currentTitlesToFilterRows: StatisticsTitleFilterItem[] = [];
  let statisticsTitleFilterMaxPages = 0;
  let currentStatisticsTitleFilterPage = 1;
  let statisticsTitleFilterRowsPerPage = 0;

  $: statisticsTitleFilterPageLabel = `PAGE ${currentStatisticsTitleFilterPage} / ${statisticsTitleFilterMaxPages}`;

  $: setTitlesToFilter(statisticsTitleFilters);

  $: applyTitleFilters(
    $lastStatisticsFilterDateRangeOnly$,
    $lastStatisticsFilterShowSelectedTitlesOnly$
  );

  $: updateStatisticsTitleFilterTableData(currentStatisticsTitleFilterPage);

  onMount(() => {
    updateStatisticsTitleFilterRowsPerPage();
  });

  function handleTitleFilterChange() {
    clearTimeout(titleFilterTimer);
    titleFilterTimer = window.setTimeout(() => {
      applyTitleFilters();
    }, 500);
  }

  function handleSelectAll(valueToSet: boolean) {
    for (let index = 0, { length } = titlesToFilter; index < length; index += 1) {
      titlesToFilter[index].isSelected = valueToSet;
    }

    if ($lastStatisticsFilterShowSelectedTitlesOnly$) {
      applyTitleFilters();
    } else {
      updateStatisticsTitleFilterTableData(currentStatisticsTitleFilterPage);
    }
  }

  function setTitlesToFilter(filters: Map<string, boolean>) {
    titlesToFilter = [...filters.entries()].map(([title, isSelected]) => ({
      title,
      isSelected
    }));

    applyTitleFilters();
  }

  function applyTitleFilters(dateRangeOnly?: boolean, showSelectedOnly?: boolean) {
    const rangeOnly = dateRangeOnly ?? $lastStatisticsFilterDateRangeOnly$;
    const selectedOnly = showSelectedOnly ?? $lastStatisticsFilterShowSelectedTitlesOnly$;
    tick().then(() => {
      filteredTitles = titlesToFilter.filter(
        (filterItem) =>
          (!titleFilter || filterItem.title.includes(titleFilter)) &&
          (!rangeOnly || titlesInStatisticsDateRange.has(filterItem.title)) &&
          (!selectedOnly || filterItem.isSelected)
      );

      updateStatisticsTitleFilterRowsPerPage(currentStatisticsTitleFilterPage);
    });
  }

  function updateStatisticsTitleFilterRowsPerPage(newPage?: number) {
    tick().then(() => {
      statisticsTitleFilterRowsPerPage = Math.max(
        1,
        Math.ceil(
          (getFullHeight(window, statisticsTitleFilterTableContainerElm) -
            getFullHeight(window, statisticsTitleFilterButtonContainer, true)) /
            convertRemToPixels(
              window,
              statisticsTitleFilterBaseRowRem + statisticsTitleFilterBaseRowGap + 0.4
            )
        )
      );

      updateStatisticsTitleFilterPageData(newPage);
    });
  }

  function updateStatisticsTitleFilterPageData(newPage?: number) {
    statisticsTitleFilterMaxPages = Math.ceil(
      filteredTitles.length / statisticsTitleFilterRowsPerPage
    );

    currentStatisticsTitleFilterPage = newPage
      ? limitToRange(1, statisticsTitleFilterMaxPages, newPage)
      : limitToRange(1, statisticsTitleFilterMaxPages, currentStatisticsTitleFilterPage);

    updateStatisticsTitleFilterTableData(currentStatisticsTitleFilterPage);
  }

  function updateStatisticsTitleFilterTableData(pageNumber: number) {
    if (!pageNumber) {
      return;
    }

    const currenPageStart = (pageNumber - 1) * statisticsTitleFilterRowsPerPage;

    currentTitlesToFilterRows = filteredTitles.slice(
      currenPageStart,
      currenPageStart + statisticsTitleFilterRowsPerPage
    );
  }
</script>

{$resizeHandler$ ?? ''}
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
<div class="flex flex-col flex-1 px-4">
  <input
    type="search"
    placeholder="Filter Title"
    class="w-full text-black"
    bind:value={titleFilter}
    on:input={handleTitleFilterChange}
  />
  <div class="mt-6 flex gap-2 overflow-x-auto pb-1">
    <button
      type="button"
      title="Apply Filter - updates Summary and Heatmap"
      class="flex min-h-[44px] shrink-0 items-center gap-2 rounded border border-white/30 px-3 text-sm whitespace-nowrap hover:text-red-500"
      on:click={() => {
        dispatch('applyFilter', titlesToFilter);
        dispatch('close');
      }}
    >
      <Fa icon={faCircleCheck} />
      <span>Apply</span>
    </button>
    <button
      type="button"
      title="Select All"
      class="flex min-h-[44px] shrink-0 items-center gap-2 rounded border border-white/30 px-3 text-sm whitespace-nowrap hover:text-red-500"
      on:click={() => handleSelectAll(true)}
    >
      <Fa icon={faListCheck} />
      <span>All</span>
    </button>
    <button
      type="button"
      title="Remove All"
      class="flex min-h-[44px] shrink-0 items-center gap-2 rounded border border-white/30 px-3 text-sm whitespace-nowrap hover:text-red-500"
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
      class="flex min-h-[44px] shrink-0 items-center gap-2 rounded border border-white/30 px-3 text-sm whitespace-nowrap hover:text-red-500"
      class:bg-white={$lastStatisticsFilterDateRangeOnly$}
      class:text-black={$lastStatisticsFilterDateRangeOnly$}
      on:click={() => ($lastStatisticsFilterDateRangeOnly$ = !$lastStatisticsFilterDateRangeOnly$)}
    >
      <Fa icon={$lastStatisticsFilterDateRangeOnly$ ? faCalendarXmark : faCalendar} />
      <span>In range</span>
    </button>
    <button
      type="button"
      title={$lastStatisticsFilterShowSelectedTitlesOnly$
        ? 'Display all Titles'
        : 'Display selected Titles only'}
      aria-pressed={$lastStatisticsFilterShowSelectedTitlesOnly$}
      class="flex min-h-[44px] shrink-0 items-center gap-2 rounded border border-white/30 px-3 text-sm whitespace-nowrap hover:text-red-500"
      class:bg-white={$lastStatisticsFilterShowSelectedTitlesOnly$}
      class:text-black={$lastStatisticsFilterShowSelectedTitlesOnly$}
      on:click={() =>
        ($lastStatisticsFilterShowSelectedTitlesOnly$ =
          !$lastStatisticsFilterShowSelectedTitlesOnly$)}
    >
      <Fa icon={$lastStatisticsFilterShowSelectedTitlesOnly$ ? faEyeSlash : faEye} />
      <span>Selected</span>
    </button>
    {#if $preFilteredTitlesForStatistics$.size}
      <button
        type="button"
        title="Remove Prefilter"
        class="flex min-h-[44px] shrink-0 items-center gap-2 rounded border border-white/30 px-3 text-sm whitespace-nowrap hover:text-red-500"
        on:click={() => dispatch('clearPrefilter')}
      >
        <Fa icon={faTrash} />
        <span>Prefilter</span>
      </button>
    {/if}
  </div>
  <p class="mt-2 text-xs opacity-70">
    Title selection applies to the Summary and Heatmap tabs. Press Apply to update the numbers.
  </p>
  <div class="grow mt-8 pl-1 overflow-auto" bind:this={statisticsTitleFilterTableContainerElm}>
    {#if filteredTitles.length}
      <div
        class="grid grid-cols-[max-content,minmax(0,1fr)] gap-x-8 items-center"
        style:grid-auto-rows={`${statisticsTitleFilterBaseRowRem}rem`}
        style:row-gap={`${statisticsTitleFilterBaseRowGap}rem`}
      >
        {#each currentTitlesToFilterRows as currentTitlesToFilterRow (currentTitlesToFilterRow.title)}
          <input
            type="checkbox"
            bind:checked={currentTitlesToFilterRow.isSelected}
            on:change={() => {
              if ($lastStatisticsFilterShowSelectedTitlesOnly$) {
                applyTitleFilters();
              }
            }}
          />
          <div
            class="line-clamp-3 min-w-0 break-words [overflow-wrap:anywhere]"
            class:opacity-50={!titlesInStatisticsDateRange.has(currentTitlesToFilterRow.title)}
            title={currentTitlesToFilterRow.title}
          >
            {currentTitlesToFilterRow.title}
          </div>
        {/each}
      </div>
    {:else}
      <div class="mt-6 text-2xl text-center">No Titles to filter</div>
    {/if}
  </div>
  <div
    class="my-6 flex justify-between"
    class:invisible={statisticsTitleFilterMaxPages < 2}
    bind:this={statisticsTitleFilterButtonContainer}
  >
    <button
      type="button"
      title="Previous titles page"
      aria-label="Previous titles page"
      disabled={currentStatisticsTitleFilterPage === 1}
      class="min-h-[44px] min-w-[44px]"
      class:opacity-25={currentStatisticsTitleFilterPage === 1}
      class:cursor-not-allowed={currentStatisticsTitleFilterPage === 1}
      on:click={() => (currentStatisticsTitleFilterPage -= 1)}
    >
      <Fa icon={faChevronLeft} />
    </button>
    <div class="mx-6">{statisticsTitleFilterPageLabel}</div>
    <button
      type="button"
      title="Next titles page"
      aria-label="Next titles page"
      disabled={currentStatisticsTitleFilterPage === statisticsTitleFilterMaxPages}
      class="min-h-[44px] min-w-[44px]"
      class:opacity-25={currentStatisticsTitleFilterPage === statisticsTitleFilterMaxPages}
      class:cursor-not-allowed={currentStatisticsTitleFilterPage === statisticsTitleFilterMaxPages}
      on:click={() => (currentStatisticsTitleFilterPage += 1)}
    >
      <Fa icon={faChevronRight} />
    </button>
  </div>
</div>
