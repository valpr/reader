<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { List, ListItem } from '@custom-ereader/ui';
  import { createEventDispatcher } from 'svelte';
  import type { TopBookSummary } from './lookback-types';
  import LookbackBookCover from './lookback-book-cover.svelte';

  export let book: TopBookSummary;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  function formatSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  $: lastReadLabel = book.lastReadTime
    ? new Date(book.lastReadTime).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : '—';
  $: progressLabel = book.completed ? 'Finished (100%)' : `${Math.round(book.maxProgress * 100)}%`;
</script>

<DialogTemplate>
  <svelte:fragment slot="header">
    <span class="block truncate" title={book.title}>{book.title}</span>
  </svelte:fragment>
  <svelte:fragment slot="content">
    <div data-testid="lookback-book-details" class="flex min-w-0 flex-col gap-4">
      <div class="mx-auto w-32 max-w-full sm:w-40">
        <LookbackBookCover coverImage={book.coverImage} title={book.title} />
      </div>
      <List variant="bordered" density="compact">
        <ListItem title="Rank" description={`#${book.rank}`} />
        <ListItem title="Reading time" description={formatSeconds(book.readingTimeSeconds)} />
        <ListItem
          title="Characters read"
          description={`${formatNumber(book.charactersRead)} chars`}
        />
        <ListItem title="Dictionary lookups" description={formatNumber(book.lookupCount)} />
        <ListItem title="Progress" description={progressLabel} />
        <ListItem title="Last read" description={lastReadLabel} />
      </List>
    </div>
  </svelte:fragment>
  <svelte:fragment slot="footer">
    <button type="button" class={buttonClasses} on:click={() => dispatch('close')}> Close </button>
  </svelte:fragment>
</DialogTemplate>
