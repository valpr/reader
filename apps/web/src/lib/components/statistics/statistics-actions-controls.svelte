<script lang="ts">
  import ButtonToggleGroup from '$lib/components/button-toggle-group/button-toggle-group.svelte';
  import { optionsForToggle } from '$lib/components/button-toggle-group/toggle-option';
  import SettingsItemGroup from '$lib/components/settings/settings-item-group.svelte';
  import {
    copyStatisticsData$,
    exportStatisticsData$,
    statisticsActionInProgress$,
    deleteStatisticsData$,
    statisticsScopeSummary$,
    type StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import { confirmStatisticsDeletion$ } from '$lib/data/store';

  export let statisticsDateRangeLabel: string;

  const copyStatisticsDataItems: StatisticsDataSource[] = [
    { key: 'readingTime', label: 'Reading Time' },
    { key: 'charactersRead', label: 'Characters Read' }
  ];

  async function exportStatisticsData(exportAllStatisticsData = true) {
    $statisticsActionInProgress$ = true;

    exportStatisticsData$.next(exportAllStatisticsData);
  }

  async function deleteStatisticsData(deleteAllStatisticsData = true) {
    $statisticsActionInProgress$ = true;

    deleteStatisticsData$.next(deleteAllStatisticsData);
  }
</script>

<div class="flex flex-col gap-5">
  <section aria-label="Copy data">
    <h3 class="font-semibold">Copy</h3>
    <p class="mt-1 text-xs opacity-70">
      Copies the current view ({$statisticsScopeSummary$.selectedTitles} of {$statisticsScopeSummary$.totalTitles}
      titles · {statisticsDateRangeLabel}) in TMW log format, grouped by title.
    </p>
    <div class="mt-2 flex flex-col gap-2">
      {#each copyStatisticsDataItems as copyStatisticsDataItem (copyStatisticsDataItem.key)}
        <button
          type="button"
          class="flex min-h-[44px] items-center justify-center gap-2 rounded border border-white/30 px-3 text-sm"
          on:click={() => copyStatisticsData$.next(copyStatisticsDataItem.key)}
        >
          Copy {copyStatisticsDataItem.label}
        </button>
      {/each}
    </div>
  </section>
  <section aria-label="Export data">
    <h3 class="font-semibold">Export</h3>
    <div class="mt-2 flex flex-col gap-2">
      <button
        type="button"
        class="flex min-h-[44px] items-center justify-center gap-2 rounded border border-white/30 px-3 text-sm"
        on:click={() => exportStatisticsData(false)}
      >
        Export current view ({$statisticsScopeSummary$.selectedTitles} of {$statisticsScopeSummary$.totalTitles}
        titles)
      </button>
      <button
        type="button"
        class="flex min-h-[44px] items-center justify-center gap-2 rounded border border-white/30 px-3 text-sm"
        on:click={() => exportStatisticsData()}
      >
        Export everything
      </button>
    </div>
  </section>
  <section aria-label="Delete data">
    <h3 class="font-semibold">Delete</h3>
    <div class="mt-2 flex flex-col gap-2">
      <button
        type="button"
        class="flex min-h-[44px] items-center justify-center gap-2 rounded border border-red-400/60 px-3 text-sm hover:text-red-500"
        on:click={() => deleteStatisticsData(false)}
      >
        Delete current view ({$statisticsScopeSummary$.selectedTitles} of {$statisticsScopeSummary$.totalTitles}
        titles · {statisticsDateRangeLabel})
      </button>
      <button
        type="button"
        class="flex min-h-[44px] items-center justify-center gap-2 rounded border border-red-400/60 px-3 text-sm hover:text-red-500"
        on:click={() => deleteStatisticsData()}
      >
        Delete everything
      </button>
    </div>
    <div class="mt-4">
      <SettingsItemGroup title="Confirm Statistics Deletion" applyHeaderClasses={false}>
        <ButtonToggleGroup
          invertColors
          options={optionsForToggle}
          bind:selectedOptionId={$confirmStatisticsDeletion$}
        />
      </SettingsItemGroup>
    </div>
  </section>
</div>
