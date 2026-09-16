<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button, Card, Select } from '@custom-ereader/ui';
  import type { LookbackMetrics } from './lookback-types';

  export let metrics: LookbackMetrics;
  export let selectedYear: number | 'all';
  export let availableYears: number[] = [];

  const dispatch = createEventDispatcher<{
    playStory: void;
    yearChange: number | 'all';
  }>();

  $: yearOptions = [
    ...availableYears.map((yr) => ({ value: String(yr), label: `${yr} Year in Review` })),
    { value: 'all', label: 'All Time Journey' }
  ];

  function handleYearChange(e: CustomEvent<{ value: string | number }>) {
    const val = e.detail.value === 'all' ? 'all' : parseInt(String(e.detail.value), 10);
    dispatch('yearChange', val);
  }

  function formatSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }
</script>

<div class="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-6">
  <!-- Top Bar: Year Selector & Story CTA -->
  <div
    class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-2 border-b border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-[var(--astryx-color-border-subtle,#27272a)]"
  >
    <div class="flex flex-col gap-1 min-w-0">
      <h1
        class="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
      >
        {selectedYear === 'all' ? 'All-Time Reading Recap' : `${selectedYear} Reading Lookback`}
      </h1>
      <p
        class="text-sm text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Your personal reading journey, habits, and milestones.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      <div class="w-48 max-w-full">
        <Select
          size="sm"
          options={yearOptions}
          value={String(selectedYear)}
          on:change={handleYearChange}
        />
      </div>

      <Button
        variant="primary"
        size="sm"
        disabled={!metrics.hasSufficientData}
        class="font-medium shadow-sm flex items-center gap-1.5"
        on:click={() => dispatch('playStory')}
      >
        <span>▶</span>
        <span>Play Story</span>
      </Button>
    </div>
  </div>

  <!-- Gating Banner: Unlocks with 3 Books & 3+ Days -->
  {#if !metrics.hasSufficientData}
    <Card
      variant="surface"
      padding="md"
      radius="lg"
      class="border border-amber-500/30 bg-amber-500/5 space-y-2.5"
    >
      <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm">
        <span>🌱</span>
        <span>Recap Unlocks with 3 Books &amp; 3+ Days</span>
      </div>
      <p
        class="text-xs text-[var(--astryx-color-fg-secondary,#52525b)] break-words [overflow-wrap:anywhere]"
      >
        To generate personalized reading archetypes and your recap story, read across at least 3
        books and on more than 2 distinct days.
      </p>
      <div class="flex flex-wrap gap-4 pt-1 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-[var(--astryx-color-fg-primary,#18181b)]"
            >{metrics.booksStarted} / 3</span
          >
          <span class="text-[var(--astryx-color-fg-muted,#71717a)]"
            >Books Started {metrics.booksStarted >= 3 ? '✓' : ''}</span
          >
        </div>
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-[var(--astryx-color-fg-primary,#18181b)]"
            >{metrics.activeReadingDays} / 3</span
          >
          <span class="text-[var(--astryx-color-fg-muted,#71717a)]"
            >Reading Days (need &gt; 2) {metrics.activeReadingDays > 2 ? '✓' : ''}</span
          >
        </div>
      </div>
    </Card>
  {/if}

  <!-- Hero Persona Card -->
  <Card
    variant="surface"
    padding="lg"
    radius="lg"
    class="border border-[var(--astryx-color-border-default,#e4e4e7)] dark:border-[var(--astryx-color-border-default,#27272a)] shadow-sm"
  >
    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-5">
      <div
        class="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-indigo-500/15 via-purple-500/15 to-pink-500/15 flex items-center justify-center text-4xl sm:text-5xl shadow-inner border border-purple-500/20"
      >
        {metrics.primaryArchetype.badge}
      </div>

      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[var(--astryx-color-primary-subtle,rgba(99,102,241,0.12))] text-[var(--astryx-color-primary,#6366f1)]"
          >
            Primary Persona
          </span>
          <span class="text-xs text-[var(--astryx-color-fg-muted,#71717a)]">
            "{metrics.primaryArchetype.tagline}"
          </span>
        </div>

        <h2
          class="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
        >
          {metrics.primaryArchetype.name}
        </h2>

        <p
          class="text-sm text-[var(--astryx-color-fg-secondary,#52525b)] break-words [overflow-wrap:anywhere]"
        >
          {metrics.primaryArchetype.description}
        </p>

        <!-- Unlocked Badges Row -->
        {#if metrics.earnedArchetypes.length > 1}
          <div class="pt-2 flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-[var(--astryx-color-fg-muted,#71717a)] mr-1">Unlocked:</span>
            {#each metrics.earnedArchetypes as earned (earned.id)}
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800 text-[var(--astryx-color-fg-secondary,#52525b)] border border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-zinc-700"
                title={earned.tagline}
              >
                <span>{earned.badge}</span>
                <span class="truncate max-w-[120px]">{earned.name}</span>
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </Card>

  <!-- Core Metrics Grid -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
    <Card
      variant="surface"
      padding="md"
      radius="md"
      class="border border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-zinc-800 flex flex-col justify-between"
    >
      <div
        class="text-xs font-medium text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Reading Time
      </div>
      <div
        class="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        {formatSeconds(metrics.totalReadingTimeSeconds)}
      </div>
      <div class="text-[11px] text-[var(--astryx-color-fg-muted,#71717a)] mt-1">
        total immersion
      </div>
    </Card>

    <Card
      variant="surface"
      padding="md"
      radius="md"
      class="border border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-zinc-800 flex flex-col justify-between"
    >
      <div
        class="text-xs font-medium text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Characters
      </div>
      <div
        class="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        {formatNumber(metrics.totalCharactersRead)}
      </div>
      <div class="text-[11px] text-[var(--astryx-color-fg-muted,#71717a)] mt-1">
        ~{formatNumber(metrics.averageReadingSpeedCharsPerHour)} chars/hr
      </div>
    </Card>

    <Card
      variant="surface"
      padding="md"
      radius="md"
      class="border border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-zinc-800 flex flex-col justify-between"
    >
      <div
        class="text-xs font-medium text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Active Days
      </div>
      <div
        class="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        {metrics.activeReadingDays}
        <span class="text-xs font-normal text-[var(--astryx-color-fg-muted,#71717a)]"
          >/ {metrics.totalDaysInPeriod}</span
        >
      </div>
      <div class="text-[11px] text-[var(--astryx-color-fg-muted,#71717a)] mt-1">
        {metrics.consistencyPercentage}% consistency
      </div>
    </Card>

    <Card
      variant="surface"
      padding="md"
      radius="md"
      class="border border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-zinc-800 flex flex-col justify-between"
    >
      <div
        class="text-xs font-medium text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Longest Streak
      </div>
      <div
        class="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400"
      >
        {metrics.longestStreakDays}
        {metrics.longestStreakDays === 1 ? 'day' : 'days'}
      </div>
      <div class="text-[11px] text-[var(--astryx-color-fg-muted,#71717a)] mt-1">
        unbroken habit 🔥
      </div>
    </Card>

    <Card
      variant="surface"
      padding="md"
      radius="md"
      class="border border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-zinc-800 flex flex-col justify-between"
    >
      <div
        class="text-xs font-medium text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Books Finished
      </div>
      <div
        class="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        {metrics.booksCompleted}
        <span class="text-xs font-normal text-[var(--astryx-color-fg-muted,#71717a)]"
          >/ {metrics.booksStarted}</span
        >
      </div>
      <div class="text-[11px] text-[var(--astryx-color-fg-muted,#71717a)] mt-1">
        {metrics.completionRate}% completion rate
      </div>
    </Card>

    <Card
      variant="surface"
      padding="md"
      radius="md"
      class="border border-[var(--astryx-color-border-subtle,#e4e4e7)] dark:border-zinc-800 flex flex-col justify-between"
    >
      <div
        class="text-xs font-medium text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Lookups
      </div>
      <div
        class="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)]"
      >
        {formatNumber(metrics.totalLookups)}
      </div>
      <div class="text-[11px] text-[var(--astryx-color-fg-muted,#71717a)] mt-1">
        {metrics.lookupsPer1kChars} per 1k chars
      </div>
    </Card>
  </div>

  <!-- Middle Section: Drop-off Cliff & Device Breakdown -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Drop-off Cliff Card -->
    <Card
      variant="surface"
      padding="md"
      radius="lg"
      class="border border-[var(--astryx-color-border-default,#e4e4e7)] dark:border-zinc-800 space-y-4"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="space-y-0.5">
          <div
            class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--astryx-color-fg-muted,#71717a)]"
          >
            <span>⛰️</span>
            <span>Drop-off Cliff Analysis</span>
          </div>
          <h3
            class="text-lg font-bold text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
          >
            Where You Give Up
          </h3>
        </div>
        {#if metrics.dropOffAnalysis.abandonedBooksCount > 0}
          <span
            class="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/10 text-amber-600 dark:text-amber-400"
          >
            {metrics.dropOffAnalysis.abandonedBooksCount} unfinished
          </span>
        {/if}
      </div>

      <p
        class="text-sm font-medium text-[var(--astryx-color-fg-secondary,#52525b)] break-words [overflow-wrap:anywhere]"
      >
        {metrics.dropOffAnalysis.summaryMessage}
      </p>

      <!-- Progress Buckets Bar Chart (only shown when more than 2 books unfinished) -->
      {#if metrics.dropOffAnalysis.hasDropOffData}
        <div class="space-y-2 pt-1">
          <div class="text-xs text-[var(--astryx-color-fg-muted,#71717a)] font-medium">
            Abandonment frequency by book progress mark:
          </div>
          <div
            class="grid grid-cols-9 gap-1 items-end h-24 pt-4 px-1 bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800/50 rounded-lg"
          >
            {#each metrics.dropOffAnalysis.bucketDistribution as bucket}
              {@const maxCount = Math.max(
                1,
                ...metrics.dropOffAnalysis.bucketDistribution.map((b) => b.count)
              )}
              {@const heightPercent =
                bucket.count > 0 ? Math.max(15, Math.round((bucket.count / maxCount) * 100)) : 4}
              {@const isModal =
                bucket.bracket === metrics.dropOffAnalysis.modalDropOffBracket && bucket.count > 0}
              <div class="flex flex-col items-center justify-end h-full gap-1 group relative">
                <div
                  class="w-full rounded-t transition-all duration-300 {isModal
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : 'bg-indigo-400/60 dark:bg-indigo-500/40'}"
                  style="height: {heightPercent}%;"
                ></div>
                <span
                  class="text-[9px] text-[var(--astryx-color-fg-muted,#71717a)] truncate w-full text-center"
                >
                  {bucket.bracket.split('–')[0]}
                </span>
                <!-- Tooltip on hover -->
                <div
                  class="absolute -top-7 px-1.5 py-0.5 rounded bg-zinc-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow"
                >
                  {bucket.bracket}: {bucket.count}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </Card>

    <!-- Reading Device & Profile Breakdown -->
    <Card
      variant="surface"
      padding="md"
      radius="lg"
      class="border border-[var(--astryx-color-border-default,#e4e4e7)] dark:border-zinc-800 space-y-4"
    >
      <div class="space-y-0.5">
        <div
          class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--astryx-color-fg-muted,#71717a)]"
        >
          <span>📱</span>
          <span>Device Sanctuary</span>
        </div>
        <h3
          class="text-lg font-bold text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
        >
          Where You Read Most
        </h3>
      </div>

      {#if metrics.topProfile}
        <p
          class="text-sm font-medium text-[var(--astryx-color-fg-secondary,#52525b)] break-words [overflow-wrap:anywhere]"
        >
          Your primary sanctuary is <strong class="text-[var(--astryx-color-fg-primary,#18181b)]"
            >{metrics.topProfile.profileName}</strong
          >
          ({metrics.topProfile.percentage}% of total reading).
        </p>
      {:else}
        <p class="text-sm text-[var(--astryx-color-fg-muted,#71717a)]">
          Device tracking data will appear as you read across different profiles.
        </p>
      {/if}

      <div class="space-y-3 pt-1">
        {#each metrics.profileBreakdown as prof (prof.profileId)}
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span
                class="font-medium text-[var(--astryx-color-fg-primary,#18181b)] truncate max-w-[200px]"
              >
                {prof.profileName}
              </span>
              <span class="text-[var(--astryx-color-fg-muted,#71717a)]">
                {formatSeconds(prof.readingTimeSeconds)} ({prof.percentage}%)
              </span>
            </div>
            <div
              class="w-full h-2 rounded-full bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800 overflow-hidden"
            >
              <div
                class="h-full rounded-full bg-[var(--astryx-color-primary,#6366f1)] transition-all duration-500"
                style="width: {prof.percentage}%;"
              ></div>
            </div>
          </div>
        {/each}
      </div>
    </Card>
  </div>

  <!-- 24-Hour Chronotype Clock -->
  <Card
    variant="surface"
    padding="md"
    radius="lg"
    class="border border-[var(--astryx-color-border-default,#e4e4e7)] dark:border-zinc-800 space-y-4"
  >
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div class="space-y-0.5">
        <div
          class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--astryx-color-fg-muted,#71717a)]"
        >
          <span>🕒</span>
          <span>Reading Chronotype</span>
        </div>
        <h3
          class="text-lg font-bold text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
        >
          24-Hour Reading Rhythm
        </h3>
      </div>
      <span
        class="self-start sm:self-auto px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
      >
        Peak: {metrics.peakTimeCategory} ({metrics.hourlyDistribution[metrics.peakReadingHour]
          ?.label || ''})
      </span>
    </div>

    <!-- 24 Hourly Bars -->
    <div class="space-y-1">
      <div
        class="grid grid-cols-24 gap-0.5 sm:gap-1 items-end h-28 pt-4 px-1 bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800/50 rounded-lg"
      >
        {#each metrics.hourlyDistribution as hourData}
          {@const maxHourSec = Math.max(
            1,
            ...metrics.hourlyDistribution.map((h) => h.readingTimeSeconds)
          )}
          {@const barPercent =
            hourData.readingTimeSeconds > 0
              ? Math.max(8, Math.round((hourData.readingTimeSeconds / maxHourSec) * 100))
              : 3}
          {@const isPeak =
            hourData.hour === metrics.peakReadingHour && hourData.readingTimeSeconds > 0}
          <div class="flex flex-col items-center justify-end h-full group relative">
            <div
              class="w-full rounded-t transition-all duration-300 {isPeak
                ? 'bg-indigo-600 dark:bg-indigo-400'
                : 'bg-indigo-300 dark:bg-indigo-700/60'}"
              style="height: {barPercent}%;"
            ></div>
            <!-- Hover Tooltip -->
            <div
              class="absolute -top-7 px-1.5 py-0.5 rounded bg-zinc-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow"
            >
              {hourData.label}: {formatSeconds(hourData.readingTimeSeconds)}
            </div>
          </div>
        {/each}
      </div>
      <div
        class="flex justify-between text-[10px] text-[var(--astryx-color-fg-muted,#71717a)] px-1 pt-1"
      >
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>11 PM</span>
      </div>
    </div>
  </Card>

  <!-- Top Books Leaderboard -->
  <Card
    variant="surface"
    padding="md"
    radius="lg"
    class="border border-[var(--astryx-color-border-default,#e4e4e7)] dark:border-zinc-800 space-y-4"
  >
    <div class="space-y-0.5">
      <div
        class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--astryx-color-fg-muted,#71717a)]"
      >
        <span>📚</span>
        <span>Leaderboard</span>
      </div>
      <h3
        class="text-lg font-bold text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
      >
        Most Read Books
      </h3>
    </div>

    {#if metrics.topBooks.length === 0}
      <p class="text-sm text-[var(--astryx-color-fg-muted,#71717a)] py-4 text-center">
        No reading sessions recorded for this time period.
      </p>
    {:else}
      <div class="divide-y divide-[var(--astryx-color-border-subtle,#e4e4e7)] dark:divide-zinc-800">
        {#each metrics.topBooks as book (book.title)}
          <div class="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
            <div class="flex items-center gap-3 min-w-0">
              <span
                class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold {book.rank ===
                1
                  ? 'bg-amber-400 text-zinc-900 shadow-sm'
                  : book.rank === 2
                    ? 'bg-zinc-300 dark:bg-zinc-600 text-zinc-800 dark:text-zinc-100'
                    : book.rank === 3
                      ? 'bg-amber-700/40 text-amber-900 dark:text-amber-200'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}"
              >
                #{book.rank}
              </span>
              <div class="min-w-0">
                <div
                  class="font-semibold text-sm text-[var(--astryx-color-fg-primary,#18181b)] truncate"
                  title={book.title}
                >
                  {book.title}
                </div>
                <div
                  class="text-xs text-[var(--astryx-color-fg-muted,#71717a)] flex items-center gap-2 mt-0.5"
                >
                  <span>{formatSeconds(book.readingTimeSeconds)}</span>
                  <span>•</span>
                  <span>{formatNumber(book.charactersRead)} chars</span>
                  {#if book.completed}
                    <span>•</span>
                    <span class="text-emerald-600 dark:text-emerald-400 font-medium">Finished</span>
                  {/if}
                </div>
              </div>
            </div>

            <div class="text-right flex-shrink-0">
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-full {book.completed
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}"
              >
                {book.completed ? '100%' : `${Math.round(book.maxProgress * 100)}%`}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <!-- Year-over-Year Card (if available) -->
  {#if metrics.yoyComparison?.hasPriorYearData}
    <Card
      variant="surface"
      padding="md"
      radius="lg"
      class="border border-[var(--astryx-color-border-default,#e4e4e7)] dark:border-zinc-800 space-y-3"
    >
      <div class="space-y-0.5">
        <div
          class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--astryx-color-fg-muted,#71717a)]"
        >
          <span>📈</span>
          <span>Growth & Evolution</span>
        </div>
        <h3
          class="text-lg font-bold text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
        >
          Comparison vs {metrics.yoyComparison.priorYear}
        </h3>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        <div
          class="p-3 rounded-lg bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800/60"
        >
          <div class="text-xs text-[var(--astryx-color-fg-muted,#71717a)]">Reading Time</div>
          <div
            class="text-lg font-bold mt-1 {metrics.yoyComparison.readingTimeDeltaPercent >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'}"
          >
            {metrics.yoyComparison.readingTimeDeltaPercent >= 0 ? '+' : ''}{metrics.yoyComparison
              .readingTimeDeltaPercent}%
          </div>
        </div>

        <div
          class="p-3 rounded-lg bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800/60"
        >
          <div class="text-xs text-[var(--astryx-color-fg-muted,#71717a)]">Characters</div>
          <div
            class="text-lg font-bold mt-1 {metrics.yoyComparison.charactersDeltaPercent >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'}"
          >
            {metrics.yoyComparison.charactersDeltaPercent >= 0 ? '+' : ''}{metrics.yoyComparison
              .charactersDeltaPercent}%
          </div>
        </div>

        <div
          class="p-3 rounded-lg bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800/60"
        >
          <div class="text-xs text-[var(--astryx-color-fg-muted,#71717a)]">Reading Speed</div>
          <div
            class="text-lg font-bold mt-1 {metrics.yoyComparison.speedDeltaPercent >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'}"
          >
            {metrics.yoyComparison.speedDeltaPercent >= 0 ? '+' : ''}{metrics.yoyComparison
              .speedDeltaPercent}%
          </div>
        </div>

        <div
          class="p-3 rounded-lg bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800/60"
        >
          <div class="text-xs text-[var(--astryx-color-fg-muted,#71717a)]">Completed Books</div>
          <div
            class="text-lg font-bold mt-1 {metrics.yoyComparison.booksCompletedDelta >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'}"
          >
            {metrics.yoyComparison.booksCompletedDelta >= 0 ? '+' : ''}{metrics.yoyComparison
              .booksCompletedDelta}
          </div>
        </div>
      </div>
    </Card>
  {/if}
</div>
