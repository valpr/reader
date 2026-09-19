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

<div class="flex flex-col mb-6">
  <label for="datesTemplate">Template</label>
  <select id="datesTemplate" class="text-black" bind:value={$lastStatisticsRangeTemplate$}>
    {#each statisticsRangeTemplates as statisticsRangeTemplate (statisticsRangeTemplate)}
      <option value={statisticsRangeTemplate}>
        {statisticsRangeTemplate}
      </option>
    {/each}
  </select>
  <p class="mt-1 text-xs opacity-70">Date range applies to the Summary tab only.</p>
</div>
<div class="flex flex-col mb-4 sm:hidden">
  <label for="weekDay">Start of Week</label>
  <select id="weekDay" class="text-black" bind:value={$lastStartDayOfWeek$}>
    {#each weekDays as weekDay (weekDay.day)}
      <option value={weekDay.index}>
        {weekDay.day}
      </option>
    {/each}
  </select>
  <p class="mt-1 text-xs opacity-70">Also affects week ranges and Heatmap day labels.</p>
</div>
<div class="flex justify-between sm:flex-row">
  <div class="flex flex-col">
    <label for="fromDate">From</label>
    <input
      id="fromDate"
      type="date"
      class="text-black"
      bind:value={selectedStatisticsStartDate}
      on:change={() =>
        dispatch('statisticsDateChange', {
          isStartDate: true,
          dateString: selectedStatisticsStartDate
        })}
    />
  </div>
  <div class="flex flex-col justify-between pt-4 mx-2 text-xl sm:mx-0">
    <button
      type="button"
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
  <div class="flex flex-col">
    <label for="toDate">To</label>
    <input
      id="toDate"
      type="date"
      class="text-black"
      bind:value={selectedStatisticsEndDate}
      on:change={() =>
        dispatch('statisticsDateChange', {
          isStartDate: false,
          dateString: selectedStatisticsEndDate
        })}
    />
  </div>
  <div class="flex-col hidden sm:flex">
    <label for="weekDay">Start of Week</label>
    <select id="weekDay" class="text-black" bind:value={$lastStartDayOfWeek$}>
      {#each weekDays as weekDay (weekDay.day)}
        <option value={weekDay.index}>
          {weekDay.day}
        </option>
      {/each}
    </select>
  </div>
</div>
<button
  type="button"
  class="text-left mt-3 hover:text-red-500"
  on:click={() => setStatisticsDatesToAllTime$.next()}
>
  Set to All Time for selected Book Titles
</button>
