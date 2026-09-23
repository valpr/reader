<script lang="ts">
  import { Card, Button } from '@custom-ereader/ui';
  import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';
  import {
    MONTH_LONG,
    bucketizeAllYears,
    bucketizeMonth,
    bucketizeWeek,
    bucketizeYear,
    getWeekRangesForMonth,
    type SpeedTrendBucket,
    type SpeedTrendResult
  } from './lookback-speed-trend';

  export let statisticsData: BooksDbStatistic[] = [];
  export let selectedYear: number | 'all' = new Date().getFullYear();
  export let weekStart = 1;

  const CHART_W = 640;
  const CHART_H = 240;
  const PAD_L = 52;
  const PAD_R = 14;
  const PAD_T = 18;
  const PAD_B = 30;
  const INNER_W = CHART_W - PAD_L - PAD_R;
  const INNER_H = CHART_H - PAD_T - PAD_B;

  let drillYear: number | null = null;
  let drillMonth: number | null = null;
  let drillWeek: string | null = null;
  let selectedKey: string | null = null;
  let prevViewKey = '';

  function computeTrend(
    rows: BooksDbStatistic[],
    scopeYear: number | 'all',
    year: number | null,
    month: number | null,
    week: string | null,
    startOfWeek: number
  ): SpeedTrendResult {
    if (scopeYear === 'all' && year === null) {
      return bucketizeAllYears(rows);
    }

    const baseYear = (scopeYear === 'all' ? year : scopeYear) as number;
    const yearRows = rows.filter((row) => row.dateKey.startsWith(`${baseYear}-`));

    if (week !== null && month !== null) {
      const weekEnd = addDaysLocal(week, 6);
      return bucketizeWeek(
        yearRows.filter((row) => row.dateKey >= week && row.dateKey <= weekEnd),
        week
      );
    }

    if (month !== null) {
      const prefix = `${baseYear}-${`${month + 1}`.padStart(2, '0')}`;
      return bucketizeMonth(
        yearRows.filter((row) => row.dateKey.startsWith(prefix)),
        baseYear,
        month,
        startOfWeek
      );
    }

    return bucketizeYear(yearRows, baseYear);
  }

  function addDaysLocal(dateKey: string, days: number): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!match) return dateKey;
    const date = new Date(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10) - 1,
      Number.parseInt(match[3], 10) + days
    );
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  }

  function formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  function selectBucket(key: string) {
    selectedKey = key;
  }

  function handleDotKey(event: KeyboardEvent, key: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectBucket(key);
    }
  }

  function drillDeeper() {
    if (!selectedBucket) return;
    if (result.level === 'years') {
      drillYear = Number.parseInt(selectedBucket.key, 10);
    } else if (result.level === 'year') {
      drillMonth = Number.parseInt(selectedBucket.key.slice(5), 10) - 1;
      drillWeek = null;
    } else if (result.level === 'month') {
      drillWeek = selectedBucket.key;
    }
  }

  function goToYears() {
    drillYear = null;
    drillMonth = null;
    drillWeek = null;
  }

  function goToYear() {
    drillMonth = null;
    drillWeek = null;
  }

  function goToMonth() {
    drillWeek = null;
  }

  $: viewKey = `${selectedYear}|${drillYear}|${drillMonth}|${drillWeek}|${weekStart}`;
  $: if (viewKey !== prevViewKey) {
    prevViewKey = viewKey;
    selectedKey = null;
  }

  $: result = computeTrend(
    statisticsData,
    selectedYear,
    drillYear,
    drillMonth,
    drillWeek,
    weekStart
  );
  $: buckets = result.buckets;
  $: if (selectedKey === null || !buckets.some((bucket) => bucket.key === selectedKey)) {
    const latest = [...buckets].reverse().find((bucket) => bucket.hasData);
    selectedKey = latest ? latest.key : null;
  }
  $: selectedBucket = buckets.find((bucket) => bucket.key === selectedKey) as
    SpeedTrendBucket | undefined;

  $: baseYearLabel = selectedYear === 'all' ? drillYear : (selectedYear as number);
  $: weekBreadcrumbLabel = (() => {
    if (drillWeek === null || drillMonth === null || baseYearLabel == null) return '';
    const range = getWeekRangesForMonth(baseYearLabel, drillMonth, weekStart).find(
      (entry) => entry.startKey === drillWeek
    );
    return range ? range.label : drillWeek;
  })();

  $: breadcrumb = (() => {
    const items: { label: string; action: (() => void) | null }[] = [];
    if (selectedYear === 'all') {
      items.push({ label: 'All Time', action: result.level === 'years' ? null : goToYears });
    }
    if (result.level !== 'years' && baseYearLabel != null) {
      const isCurrent = result.level === 'year';
      items.push({ label: `${baseYearLabel}`, action: isCurrent ? null : goToYear });
    }
    if ((result.level === 'month' || result.level === 'week') && drillMonth !== null) {
      const isCurrent = result.level === 'month';
      items.push({
        label: `${MONTH_LONG[drillMonth]} ${baseYearLabel}`,
        action: isCurrent ? null : goToMonth
      });
    }
    if (result.level === 'week') {
      items.push({ label: weekBreadcrumbLabel, action: null });
    }
    return items;
  })();

  $: drillLabel = (() => {
    if (!selectedBucket) return '';
    if (result.level === 'years') return `Show months in ${selectedBucket.key}`;
    if (result.level === 'year') return `Show weeks in ${selectedBucket.label}`;
    if (result.level === 'month') return `Show days in ${selectedBucket.label}`;
    return '';
  })();

  $: bucketCount = buckets.length;
  $: maxPlotted = Math.max(result.overallAverage, ...buckets.map((bucket) => bucket.avgSpeed), 1);
  $: yMax = maxPlotted * 1.15;
  $: xPos = (index: number) =>
    bucketCount <= 1 ? PAD_L + INNER_W / 2 : PAD_L + (INNER_W * index) / (bucketCount - 1);
  $: yPos = (value: number) => PAD_T + INNER_H * (1 - value / yMax);
  $: trendPath = (() => {
    let path = '';
    let penDown = false;
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index];
      if (!bucket.hasData) {
        penDown = false;
        continue;
      }
      path += `${penDown ? 'L' : 'M'}${xPos(index).toFixed(1)},${yPos(bucket.avgSpeed).toFixed(1)} `;
      penDown = true;
    }
    return path.trim();
  })();
  $: dotPoints = buckets
    .map((bucket, index) =>
      bucket.hasData ? { bucket, x: xPos(index), y: yPos(bucket.avgSpeed) } : null
    )
    .filter((point): point is { bucket: SpeedTrendBucket; x: number; y: number } => point !== null);
  $: gridlines = [0, 0.5, 1].map((fraction) => ({
    value: Math.round(yMax * fraction),
    y: yPos(yMax * fraction)
  }));
  $: avgY = yPos(result.overallAverage);
  $: speedDelta = selectedBucket ? selectedBucket.avgSpeed - result.overallAverage : 0;
  $: chartA11yLabel = `Reading speed trend, average ${result.overallAverage.toLocaleString()} characters per hour across ${buckets.filter((bucket) => bucket.hasData).length} periods.`;
</script>

<Card
  variant="surface"
  padding="md"
  radius="lg"
  class="border border-[var(--astryx-color-border-default,#e4e4e7)] dark:border-zinc-800 space-y-4"
>
  <div data-testid="speed-trend-card" class="space-y-4 min-w-0">
    <div class="space-y-0.5 min-w-0">
      <div
        class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--astryx-color-fg-muted,#71717a)]"
      >
        <span aria-hidden="true">📈</span>
        <span>Speed Trend</span>
      </div>
      <h3
        class="text-lg font-bold text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
      >
        Reading Speed Over Time
      </h3>
      <p
        class="text-xs text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
      >
        Average characters per hour{result.level === 'years'
          ? ' per year'
          : result.level === 'year'
            ? ' per month'
            : result.level === 'month'
              ? ' per week'
              : ' per day'}. Tap a point to see contributing titles{#if drillLabel}&nbsp;— drill in
          for finer detail{/if}.
      </p>
    </div>

    <nav aria-label="Speed trend period" data-testid="speed-trend-breadcrumb">
      <ol class="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {#each breadcrumb as crumb, index (crumb.label)}
          <li class="flex min-w-0 items-center gap-1">
            {#if index > 0}
              <span aria-hidden="true" class="text-[var(--astryx-color-fg-muted,#71717a)]">›</span>
            {/if}
            {#if crumb.action === null}
              <span
                aria-current="true"
                class="min-w-0 truncate font-semibold text-[var(--astryx-color-fg-primary,#18181b)]"
                >{crumb.label}</span
              >
            {:else}
              <button
                type="button"
                class="min-w-0 max-w-[160px] truncate text-[var(--astryx-color-primary,#6366f1)] underline decoration-dotted underline-offset-4 hover:opacity-80 min-h-[44px]"
                on:click={crumb.action}
              >
                {crumb.label}
              </button>
            {/if}
          </li>
        {/each}
      </ol>
    </nav>

    {#if buckets.length === 0 || !buckets.some((bucket) => bucket.hasData)}
      <p
        data-testid="speed-trend-empty"
        class="text-sm text-[var(--astryx-color-fg-muted,#71717a)]"
      >
        No reading activity for this period.
      </p>
    {:else}
      <div class="w-full min-w-0 overflow-hidden">
        <svg
          data-testid="speed-trend-chart"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          class="h-auto w-full"
          role="img"
          aria-label={chartA11yLabel}
        >
          {#each gridlines as gridline (gridline.value)}
            <line
              x1={PAD_L}
              x2={CHART_W - PAD_R}
              y1={gridline.y}
              y2={gridline.y}
              stroke="var(--astryx-color-border-subtle,#e4e4e7)"
              stroke-width="1"
            />
            <text
              x={PAD_L - 6}
              y={gridline.y + 4}
              text-anchor="end"
              font-size="11"
              fill="var(--astryx-color-fg-muted,#71717a)"
            >
              {gridline.value >= 1000
                ? `${Math.round(gridline.value / 100) / 10}k`
                : gridline.value}
            </text>
          {/each}

          {#if result.overallAverage > 0}
            <line
              data-testid="speed-trend-avg-line"
              x1={PAD_L}
              x2={CHART_W - PAD_R}
              y1={avgY}
              y2={avgY}
              stroke="var(--astryx-color-fg-muted,#71717a)"
              stroke-width="1.5"
              stroke-dasharray="6 4"
            />
            <text
              data-testid="speed-trend-avg-label"
              x={CHART_W - PAD_R - 4}
              y={avgY - 6}
              text-anchor="end"
              font-size="11"
              font-weight="600"
              fill="var(--astryx-color-fg-muted,#71717a)"
            >
              Avg {result.overallAverage.toLocaleString()}/hr
            </text>
          {/if}

          {#if trendPath}
            <path
              d={trendPath}
              fill="none"
              stroke="var(--astryx-color-primary,#6366f1)"
              stroke-width="2.5"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          {/if}

          {#each buckets as bucket, index (bucket.key)}
            {#if bucketCount <= 7 || index % 2 === 0}
              <text
                x={xPos(index)}
                y={CHART_H - 8}
                text-anchor="middle"
                font-size="11"
                fill="var(--astryx-color-fg-muted,#71717a)"
              >
                {bucket.shortLabel}
              </text>
            {/if}
          {/each}

          {#each dotPoints as point (point.bucket.key)}
            <circle cx={point.x} cy={point.y} r="16" fill="transparent">
              <title>{point.bucket.label}: {point.bucket.avgSpeed.toLocaleString()} chars/hr</title>
            </circle>
            <circle
              data-testid={`speed-trend-dot-${point.bucket.key}`}
              role="button"
              tabindex="0"
              aria-label={`${point.bucket.label}: ${point.bucket.avgSpeed.toLocaleString()} characters per hour from ${point.bucket.titles.length} ${point.bucket.titles.length === 1 ? 'title' : 'titles'}`}
              aria-pressed={selectedKey === point.bucket.key}
              cx={point.x}
              cy={point.y}
              r={selectedKey === point.bucket.key ? 6 : 4}
              fill="var(--astryx-color-primary,#6366f1)"
              stroke={selectedKey === point.bucket.key
                ? 'var(--astryx-color-accent,#f59e0b)'
                : 'var(--astryx-color-surface,#ffffff)'}
              stroke-width={selectedKey === point.bucket.key ? 3 : 2}
              style="cursor: pointer;"
              on:click={() => selectBucket(point.bucket.key)}
              on:keydown={(event) => handleDotKey(event, point.bucket.key)}
            />
          {/each}
        </svg>
      </div>

      {#if selectedBucket}
        <div
          data-testid="speed-trend-breakdown"
          class="rounded-lg bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800/50 p-3 space-y-2 min-w-0"
        >
          <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <div
              class="min-w-0 text-sm font-bold text-[var(--astryx-color-fg-primary,#18181b)] break-words [overflow-wrap:anywhere]"
            >
              {selectedBucket.label} · {selectedBucket.avgSpeed.toLocaleString()}/hr
            </div>
            <div
              class="text-xs whitespace-nowrap {speedDelta >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'}"
            >
              {speedDelta >= 0 ? '+' : ''}{speedDelta.toLocaleString()} vs avg
            </div>
          </div>
          <div
            class="text-xs text-[var(--astryx-color-fg-muted,#71717a)] break-words [overflow-wrap:anywhere]"
          >
            {selectedBucket.totalChars.toLocaleString()} characters · {formatDuration(
              selectedBucket.totalTimeSeconds
            )} · {selectedBucket.titles.length}
            {selectedBucket.titles.length === 1 ? 'title' : 'titles'}
          </div>
          <ul class="space-y-1.5 min-w-0">
            {#each selectedBucket.titles as contribution (contribution.title)}
              <li class="flex min-w-0 items-center justify-between gap-2 text-xs">
                <span
                  class="min-w-0 flex-1 truncate text-[var(--astryx-color-fg-primary,#18181b)]"
                  title={contribution.title}
                >
                  {contribution.title}
                </span>
                <span class="whitespace-nowrap text-[var(--astryx-color-fg-muted,#71717a)]">
                  {contribution.avgSpeed.toLocaleString()}/hr · {contribution.charsSharePercent}% of
                  chars
                </span>
              </li>
            {/each}
          </ul>
          {#if drillLabel}
            <Button
              variant="secondary"
              size="sm"
              class="min-h-[44px]"
              data-testid="speed-trend-drill"
              on:click={drillDeeper}
            >
              {drillLabel} →
            </Button>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</Card>
