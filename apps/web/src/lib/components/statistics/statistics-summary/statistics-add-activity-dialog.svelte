<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import type { BookStatistic } from '$lib/components/statistics/statistics-types';
  import type { StatisticsAddRequest } from '$lib/components/statistics/statistics-summary/statistics-summary';
  import type { BooksDbBookData } from '$lib/data/database/books-db/versions/books-db';
  import { secondsToMinutes } from '$lib/functions/statistic-util';
  import { Select } from '@custom-ereader/ui';
  import { createEventDispatcher } from 'svelte';

  export let dateKey: string;
  export let books: BooksDbBookData[] = [];
  export let existingStatistics: BookStatistic[] = [];
  export let resolver: (arg0: StatisticsAddRequest | null) => void;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let selectedTitle = books.length ? books[0].title : '';
  let readingMinutes: number | undefined = undefined;
  let charactersRead: number | undefined = undefined;

  $: existingEntry = existingStatistics.find((s) => s.title === selectedTitle);

  $: speedPerHour =
    readingMinutes && readingMinutes > 0 && charactersRead && charactersRead > 0
      ? Math.ceil((3600 * charactersRead) / (readingMinutes * 60))
      : 0;

  $: canSave =
    Boolean(selectedTitle) &&
    typeof readingMinutes === 'number' &&
    readingMinutes > 0 &&
    typeof charactersRead === 'number' &&
    charactersRead >= 0;

  function closeDialog(result: StatisticsAddRequest | null = null) {
    resolver(result);
    dispatch('close');
  }

  function handleSave() {
    if (!canSave || !selectedTitle || !readingMinutes || charactersRead === undefined) {
      return;
    }

    closeDialog({
      dateKey,
      title: selectedTitle,
      readingTime: Math.round(readingMinutes * 60),
      charactersRead: Math.round(charactersRead)
    });
  }
</script>

<DialogTemplate>
  <svelte:fragment slot="header">
    <span class="block truncate">Add Reading Activity</span>
  </svelte:fragment>

  <svelte:fragment slot="content">
    <div data-testid="statistics-add-activity-dialog" class="flex min-w-0 flex-col gap-4">
      <div
        class="text-xs font-semibold uppercase tracking-wider text-[var(--astryx-color-fg-muted,#71717a)]"
      >
        Date: <span class="text-[var(--astryx-color-fg-primary,#18181b)]">{dateKey}</span>
      </div>

      {#if books.length === 0}
        <p class="text-sm text-[var(--astryx-color-fg-muted,#71717a)]">
          No books found in your library. Add a book first to log reading activity.
        </p>
      {:else}
        <div class="flex flex-col gap-1.5 min-w-0">
          <label
            for="activityBookTitle"
            class="text-sm font-medium text-[var(--astryx-color-fg-primary,#18181b)]"
          >
            Book
          </label>
          <Select
            id="activityBookTitle"
            class="max-w-full min-w-0"
            options={books.map((book) => ({ value: book.title, label: book.title }))}
            bind:value={selectedTitle}
          />
        </div>

        {#if existingEntry}
          <div
            class="rounded-lg bg-[var(--astryx-color-primary-subtle,rgba(99,102,241,0.08))] p-3 text-xs text-[var(--astryx-color-fg-secondary,#52525b)] break-words [overflow-wrap:anywhere]"
          >
            Existing activity on this date: <strong
              >{secondsToMinutes(existingEntry.readingTime)} min</strong
            >
            · <strong>{existingEntry.charactersRead} chars</strong>. New activity will be added to
            it.
          </div>
        {/if}

        <div class="flex flex-col gap-1.5 min-w-0">
          <label
            for="activityReadingTime"
            class="text-sm font-medium text-[var(--astryx-color-fg-primary,#18181b)]"
          >
            Reading Time (minutes)
          </label>
          <input
            id="activityReadingTime"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 25"
            class="min-h-[44px] w-full max-w-full min-w-0 rounded-lg border border-[var(--astryx-color-border-default,#e4e4e7)] bg-[var(--astryx-color-surface-elevated,var(--astryx-color-surface,#ffffff))] px-3 py-2 text-sm text-[var(--astryx-color-fg-primary,#18181b)] focus:outline-none focus:ring-2 focus:ring-[var(--astryx-color-primary,#6366f1)]"
            bind:value={readingMinutes}
          />
        </div>

        <div class="flex flex-col gap-1.5 min-w-0">
          <label
            for="activityCharactersRead"
            class="text-sm font-medium text-[var(--astryx-color-fg-primary,#18181b)]"
          >
            Characters Read
          </label>
          <input
            id="activityCharactersRead"
            type="number"
            min="0"
            step="1"
            placeholder="e.g. 1500"
            class="min-h-[44px] w-full max-w-full min-w-0 rounded-lg border border-[var(--astryx-color-border-default,#e4e4e7)] bg-[var(--astryx-color-surface-elevated,var(--astryx-color-surface,#ffffff))] px-3 py-2 text-sm text-[var(--astryx-color-fg-primary,#18181b)] focus:outline-none focus:ring-2 focus:ring-[var(--astryx-color-primary,#6366f1)]"
            bind:value={charactersRead}
          />
        </div>

        {#if speedPerHour > 0}
          <div
            class="text-xs text-[var(--astryx-color-fg-muted,#71717a)] flex items-center justify-between"
          >
            <span>Calculated Reading Speed:</span>
            <span class="font-medium text-[var(--astryx-color-fg-primary,#18181b)]"
              >~{speedPerHour.toLocaleString()} chars/hr</span
            >
          </div>
        {/if}
      {/if}
    </div>
  </svelte:fragment>

  <div class="flex min-w-0 grow flex-wrap justify-between gap-2" slot="footer">
    <button
      type="button"
      data-testid="add-activity-cancel-btn"
      class={buttonClasses}
      on:click={() => closeDialog(null)}
    >
      Cancel
      <Ripple />
    </button>
    <button
      type="button"
      data-testid="add-activity-submit-btn"
      class="{buttonClasses} disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={!canSave}
      on:click={handleSave}
    >
      Add Activity
      <Ripple />
    </button>
  </div>
</DialogTemplate>
