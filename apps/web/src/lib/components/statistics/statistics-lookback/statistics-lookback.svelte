<script lang="ts">
  import { readerProfiles$ } from '$lib/data/store';
  import { calculateLookbackMetrics, extractAvailableYears } from './lookback-calculator';
  import LookbackDashboard from './lookback-dashboard.svelte';
  import LookbackStoryPlayer from './lookback-story-player.svelte';
  import type { BookStatistic } from '$lib/components/statistics/statistics-types';

  export let statisticsData: BookStatistic[] = [];

  let showStoryPlayer = false;
  let selectedYear: number | 'all' = new Date().getFullYear();

  $: availableYears = extractAvailableYears(statisticsData);

  // Initialize selectedYear to most recent available year if available
  $: if (
    availableYears.length > 0 &&
    selectedYear !== 'all' &&
    !availableYears.includes(selectedYear as number)
  ) {
    selectedYear = availableYears[0];
  }

  $: metrics = calculateLookbackMetrics(statisticsData, selectedYear, {
    profiles: $readerProfiles$
  });
</script>

<div
  class="w-full min-h-screen pb-16 bg-[var(--astryx-color-bg-canvas,#fafafa)] dark:bg-[var(--astryx-color-bg-canvas,#09090b)]"
>
  <LookbackDashboard
    {metrics}
    {selectedYear}
    {availableYears}
    on:playStory={() => (showStoryPlayer = true)}
    on:yearChange={(e) => (selectedYear = e.detail)}
  />

  {#if showStoryPlayer}
    <LookbackStoryPlayer {metrics} on:close={() => (showStoryPlayer = false)} />
  {/if}
</div>
