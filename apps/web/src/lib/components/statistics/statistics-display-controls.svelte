<script lang="ts">
  import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
  import Popover from '$lib/components/popover/popover.svelte';
  import {
    readingTimeDataSources,
    charactersDataSources,
    readingSpeedDataSources,
    statisticsDataAggregrationModes
  } from '$lib/components/statistics/statistics-types';
  import {
    lastCharactersDataSource$,
    lastPrimaryReadingDataAggregationMode$,
    lastReadingSpeedDataSource$,
    lastReadingTimeDataSource$
  } from '$lib/data/store';
  import Fa from 'svelte-fa';
</script>

<div class="flex flex-wrap justify-between">
  <div class="flex flex-col my-2 w-full sm:w-[initial]">
    <Popover
      contentText={'Reading Time Attribute which should be used for the Summary Tab'}
      contentStyles="padding: 0.5rem;"
    >
      <Fa icon={faCircleQuestion} slot="icon" class="mx-2" />
      <label for="timeDataSource">Time Data Source</label>
    </Popover>
    <select id="timeDataSource" class="text-black" bind:value={$lastReadingTimeDataSource$}>
      {#each readingTimeDataSources as readingTimeDataSource (readingTimeDataSource.key)}
        <option value={readingTimeDataSource.key}>
          {readingTimeDataSource.label}
        </option>
      {/each}
    </select>
  </div>
  <div class="flex flex-col my-2 w-full sm:w-[initial]">
    <Popover
      contentText={'Characters Read Attribute which should be used for the Summary Tab'}
      contentStyles="padding: 0.5rem; max-width: 20rem;"
    >
      <Fa icon={faCircleQuestion} slot="icon" class="mx-2" />
      <label for="charactersSource">Characters Data Source</label>
    </Popover>
    <select id="charactersSource" class="text-black" bind:value={$lastCharactersDataSource$}>
      {#each charactersDataSources as charactersDataSource (charactersDataSource.key)}
        <option value={charactersDataSource.key}>
          {charactersDataSource.label}
        </option>
      {/each}
    </select>
  </div>
  <div class="flex flex-col my-2 w-full sm:w-[initial]">
    <Popover
      contentText={'Reading Speed Attribute which should be used for the Summary Tab'}
      contentStyles="padding: 0.5rem;"
    >
      <Fa icon={faCircleQuestion} slot="icon" class="mx-2" />
      <label for="speedSource">Speed Data Source</label>
    </Popover>
    <select id="speedSource" class="text-black" bind:value={$lastReadingSpeedDataSource$}>
      {#each readingSpeedDataSources as readingSpeedDataSource (readingSpeedDataSource.key)}
        <option value={readingSpeedDataSource.key}>
          {readingSpeedDataSource.label}
        </option>
      {/each}
    </select>
  </div>
</div>
<div class="flex flex-col mt-4">
  <Popover
    contentText={'Determines on which primary Attribute the Data will be grouped for the Summary Tab'}
    contentStyles="padding: 0.5rem;"
  >
    <Fa icon={faCircleQuestion} slot="icon" class="mx-2" />
    <label for="primaryAggregration">Primary Aggregration</label>
  </Popover>
  <select
    id="primaryAggregration"
    class="text-black"
    bind:value={$lastPrimaryReadingDataAggregationMode$}
  >
    {#each statisticsDataAggregrationModes as statisticsDataAggregrationMode (statisticsDataAggregrationMode)}
      <option value={statisticsDataAggregrationMode}>
        {statisticsDataAggregrationMode}
      </option>
    {/each}
  </select>
</div>
<p class="mt-3 text-xs opacity-70">Display options apply to the Summary tab only.</p>
