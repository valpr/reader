<script lang="ts">
  import { faLeftLong, faRightLong } from '@fortawesome/free-solid-svg-icons';
  import { daysOfWeek } from '$lib/components/statistics/statistics-heatmap/statistics-heatmap';
  import {
    type StatisticsDateChange,
    statisticsRangeTemplates,
    setStatisticsDatesToAllTime$
  } from '$lib/components/statistics/statistics-types';
  import {
    lastStartDayOfWeek$,
    lastStatisticsEndDate$,
    lastStatisticsRangeTemplate$,
    lastStatisticsStartDate$
  } from '$lib/data/store';
  import { Select } from '@custom-ereader/ui';
  import { createEventDispatcher } from 'svelte';
  import Fa from 'svelte-fa';

  const dispatch = createEventDispatcher<{
    statisticsDateChange: StatisticsDateChange;
  }>();

  const weekDays = [...daysOfWeek.slice(1, 7), daysOfWeek[0]].map((day, index) => {
    if (day === 'Sunday') {
      return { day, index: 0 };
    }
    return { day, index: index + 1 };
  });

  $: selectedStatisticsStartDate = $lastStatisticsStartDate$;

  $: selectedStatisticsEndDate = $lastStatisticsEndDate$;
</script>

<div class="flex w-full max-w-full min-w-0 flex-col gap-4">
  <Select
    id="datesTemplate"
    label="Template"
    helperText="Date range applies to the Summary tab only."
    options={statisticsRangeTemplates}
    bind:value={$lastStatisticsRangeTemplate$}
  />
  <Select
    id="weekDay"
    label="Start of Week"
    helperText="Also affects week ranges and Heatmap day labels."
    options={weekDays.map((weekDay) => ({ value: weekDay.index, label: weekDay.day }))}
    bind:value={$lastStartDayOfWeek$}
  />
  <div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
    <div class="flex min-w-0 flex-1 flex-col">
      <label for="fromDate">From</label>
      <input
        id="fromDate"
        type="date"
        class="min-h-[44px] w-full min-w-0 text-black"
        bind:value={selectedStatisticsStartDate}
        on:change={() =>
          dispatch('statisticsDateChange', {
            isStartDate: true,
            dateString: selectedStatisticsStartDate
          })}
      />
    </div>
    <div class="flex items-center gap-4 text-xl sm:pb-2.5">
      <button
        type="button"
        class="flex min-h-[44px] min-w-[44px] items-center justify-center"
        aria-label="Copy start date to end date"
        title="Copy start date to end date"
        on:click={() =>
          dispatch('statisticsDateChange', {
            isStartDate: false,
            dateString: selectedStatisticsStartDate
          })}
      >
        <Fa icon={faRightLong} />
      </button>
      <button
        type="button"
        class="flex min-h-[44px] min-w-[44px] items-center justify-center"
        aria-label="Copy end date to start date"
        title="Copy end date to start date"
        on:click={() =>
          dispatch('statisticsDateChange', {
            isStartDate: true,
            dateString: selectedStatisticsEndDate
          })}
      >
        <Fa icon={faLeftLong} />
      </button>
    </div>
    <div class="flex min-w-0 flex-1 flex-col">
      <label for="toDate">To</label>
      <input
        id="toDate"
        type="date"
        class="min-h-[44px] w-full min-w-0 text-black"
        bind:value={selectedStatisticsEndDate}
        on:change={() =>
          dispatch('statisticsDateChange', {
            isStartDate: false,
            dateString: selectedStatisticsEndDate
          })}
      />
    </div>
  </div>
</div>
<button
  type="button"
  class="mt-3 min-h-[44px] text-left hover:text-red-500"
  on:click={() => setStatisticsDatesToAllTime$.next()}
>
  Set to All Time for selected Book Titles
</button>
