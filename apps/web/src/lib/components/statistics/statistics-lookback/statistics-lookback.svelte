<script lang="ts">
  import { onMount } from 'svelte';
  import { database, lastStartDayOfWeek$, readerProfiles$ } from '$lib/data/store';
  import { calculateLookbackMetrics, extractAvailableYears } from './lookback-calculator';
  import LookbackDashboard from './lookback-dashboard.svelte';
  import LookbackStoryPlayer from './lookback-story-player.svelte';
  import type { BookStatistic } from '$lib/components/statistics/statistics-types';

  export let statisticsData: BookStatistic[] = [];

  let showStoryPlayer = false;
  let selectedYear: number | 'all' = new Date().getFullYear();
  let bookMetadataMap = new Map<
    string,
    {
      coverImage?: string | Blob;
      characters?: number;
      progress?: number;
      lastBookOpen?: number;
      lastReadTime?: number;
    }
  >();
  let completedTitles = new Set<string>();

  onMount(async () => {
    try {
      const db = await database.db;
      const [books, bookmarks] = await Promise.all([db.getAll('data'), db.getAll('bookmark')]);

      const bookmarkByDataId = new Map<number, any>();
      for (let i = 0; i < bookmarks.length; i += 1) {
        bookmarkByDataId.set(bookmarks[i].dataId, bookmarks[i]);
      }

      const metaMap = new Map<
        string,
        {
          coverImage?: string | Blob;
          characters?: number;
          progress?: number;
          lastBookOpen?: number;
          lastReadTime?: number;
        }
      >();
      const completed = new Set<string>();

      for (let i = 0; i < books.length; i += 1) {
        const book = books[i];
        const bm = bookmarkByDataId.get(book.id);
        const rawProgress = bm?.progress;
        const progress =
          typeof rawProgress === 'string'
            ? (Number(rawProgress.slice(0, -1)) || 0) / 100
            : Number(rawProgress) || 0;

        const lastReadTime = Math.max(book.lastBookOpen || 0, bm?.lastBookmarkModified || 0);

        metaMap.set(book.title, {
          coverImage: book.coverImage,
          characters: book.characters,
          progress,
          lastBookOpen: book.lastBookOpen,
          lastReadTime: lastReadTime > 0 ? lastReadTime : undefined
        });

        if (progress >= 0.95) {
          completed.add(book.title);
        }
      }

      bookMetadataMap = metaMap;
      completedTitles = completed;
    } catch {
      // Graceful fallback if database read fails
    }
  });

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
    profiles: $readerProfiles$,
    bookMetadataMap,
    completedTitles
  });
</script>

<div
  class="w-full min-h-screen pb-16 bg-[var(--astryx-color-bg-canvas,#fafafa)] dark:bg-[var(--astryx-color-bg-canvas,#09090b)]"
>
  <LookbackDashboard
    {metrics}
    {selectedYear}
    {availableYears}
    {statisticsData}
    weekStart={$lastStartDayOfWeek$}
    on:playStory={() => (showStoryPlayer = true)}
    on:yearChange={(e) => (selectedYear = e.detail)}
  />

  {#if showStoryPlayer}
    <LookbackStoryPlayer {metrics} on:close={() => (showStoryPlayer = false)} />
  {/if}
</div>
