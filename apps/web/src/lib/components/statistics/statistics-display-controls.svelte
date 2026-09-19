<script lang="ts">
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
  import { SegmentedControl, Select } from '@custom-ereader/ui';
</script>

<div class="flex w-full max-w-full min-w-0 flex-col gap-4">
  <Select
    id="timeDataSource"
    label="Time Data Source"
    helperText="Reading Time attribute used for the Summary tab."
    options={readingTimeDataSources.map((source) => ({ value: source.key, label: source.label }))}
    bind:value={$lastReadingTimeDataSource$}
  />
  <Select
    id="charactersSource"
    label="Characters Data Source"
    helperText="Characters Read attribute used for the Summary tab."
    options={charactersDataSources.map((source) => ({ value: source.key, label: source.label }))}
    bind:value={$lastCharactersDataSource$}
  />
  <Select
    id="speedSource"
    label="Speed Data Source"
    helperText="Reading Speed attribute used for the Summary tab."
    options={readingSpeedDataSources.map((source) => ({ value: source.key, label: source.label }))}
    bind:value={$lastReadingSpeedDataSource$}
  />
  <div class="flex min-w-0 flex-col">
    <span
      id="primaryAggregationLabel"
      class="mb-1.5 text-sm font-medium text-[var(--astryx-color-fg-primary,#18181b)]"
    >
      Primary Aggregation
    </span>
    <SegmentedControl
      options={statisticsDataAggregrationModes}
      bind:value={$lastPrimaryReadingDataAggregationMode$}
      fullWidth
      wrapOnNarrow
      aria-labelledby="primaryAggregationLabel"
    />
    <p class="mt-1 text-xs opacity-70">
      Attribute the Summary tab data is grouped by. None shows one row per day and title.
    </p>
  </div>
</div>
<p class="mt-3 text-xs opacity-70">Display options apply to the Summary tab only.</p>
