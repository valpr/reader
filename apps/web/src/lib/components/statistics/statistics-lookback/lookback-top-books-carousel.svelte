<script lang="ts">
  import { Carousel } from '@custom-ereader/ui';
  import { dialogManager } from '$lib/data/dialog-manager';
  import type { TopBookSummary } from './lookback-types';
  import LookbackBookCover from './lookback-book-cover.svelte';
  import LookbackBookDetailsDialog from './lookback-book-details-dialog.svelte';

  export let books: TopBookSummary[] = [];

  function formatSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  function openDetails(book: TopBookSummary) {
    dialogManager.dialogs$.next([
      {
        component: LookbackBookDetailsDialog,
        props: { book },
        disableCloseOnClick: true
      }
    ]);
  }
</script>

{#if books.length === 0}
  <p class="text-sm text-[var(--astryx-color-fg-muted,#71717a)] py-4 text-center">
    No reading sessions recorded for this time period.
  </p>
{:else}
  <Carousel ariaLabel="Most read books">
    {#each books as book (book.title)}
      <div data-carousel-slide class="w-40 min-w-0 sm:w-48">
        <button
          type="button"
          class="group flex min-h-[44px] w-full min-w-0 flex-col gap-2 rounded-xl p-2 text-left transition-colors hover:bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-[var(--astryx-color-border-focus,#18181b)]"
          aria-label={`${book.title}: view reading details`}
          on:click={() => openDetails(book)}
        >
          <span class="relative block w-full min-w-0">
            <LookbackBookCover coverImage={book.coverImage} title={book.title} />
            <span
              aria-hidden="true"
              class="absolute left-1.5 top-1.5 flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-bold shadow-sm {book.rank ===
              1
                ? 'bg-amber-400 text-zinc-900'
                : 'bg-zinc-900/70 text-white'}"
            >
              #{book.rank}
            </span>
          </span>
          <span class="min-w-0">
            <span
              class="block truncate text-sm font-semibold text-[var(--astryx-color-fg-primary,#18181b)]"
              title={book.title}
            >
              {book.title}
            </span>
            <span class="mt-0.5 block truncate text-xs text-[var(--astryx-color-fg-muted,#71717a)]">
              {formatSeconds(book.readingTimeSeconds)} · {formatNumber(book.charactersRead)} chars
            </span>
            <span
              class="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold {book.completed
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}"
            >
              {book.completed ? 'Finished' : `${Math.round(book.maxProgress * 100)}%`}
            </span>
          </span>
        </button>
      </div>
    {/each}
  </Carousel>
{/if}
