<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { pluralize } from '$lib/functions/utils';
  import { createEventDispatcher } from 'svelte';

  export let titles: string[] = [];
  export let cloudSummary = '';
  export let hasCloudSource = false;
  export let hasLocalCopy = true;
  export let initialDeleteFromCloud = false;
  export let initialDeleteStatistics = false;
  export let resolver: (result: {
    canceled: boolean;
    deleteFromCloud: boolean;
    deleteStatistics: boolean;
  }) => void;

  let deleteFromCloud = initialDeleteFromCloud;
  let deleteStatistics = initialDeleteStatistics;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  function closeDialog(canceled: boolean) {
    resolver({ canceled, deleteFromCloud, deleteStatistics });
    dispatch('close');
  }

  $: singleTitle = titles.length === 1 ? titles[0] : '';
</script>

<DialogTemplate>
  <svelte:fragment slot="header">
    {#if titles.length === 1}
      <span class="block truncate min-w-0" title={singleTitle}>Delete “{singleTitle}”?</span>
    {:else}
      Delete {titles.length} {pluralize(titles.length, 'Book', false)}?
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="content">
    <div class="space-y-4 min-w-0 pb-4" data-testid="delete-books-dialog">
      <p class="break-words [overflow-wrap:anywhere] text-sm opacity-90">
        {#if titles.length === 1}
          {#if hasLocalCopy}
            This removes the local browser copy and reading progress for “{singleTitle}”.
          {:else}
            “{singleTitle}” has no local browser copy. This removes it from cloud storage.
          {/if}
        {:else}
          {#if hasLocalCopy}
            This removes local browser copies and reading progress for the {titles.length} selected books.
          {:else}
            The selected books have no local browser copies. This removes them from cloud storage.
          {/if}
        {/if}
        {#if cloudSummary}
          <br /><br />Also on: {cloudSummary}.
        {/if}
      </p>

      <div
        class="space-y-3 pt-2 border-t border-[var(--astryx-color-border-subtle,rgba(255,255,255,0.1))]"
      >
        {#if cloudSummary || hasCloudSource}
          <label
            class="flex items-start gap-2.5 cursor-pointer select-none min-w-0 min-h-[44px] py-1"
          >
            <input
              id="del-cloud"
              data-testid="delete-cloud-checkbox"
              type="checkbox"
              bind:checked={deleteFromCloud}
              class="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--astryx-color-primary,#6366f1)]"
            />
            <div class="min-w-0 flex-1">
              <span class="block text-sm font-medium">Also delete from cloud storage</span>
              <span class="block text-xs opacity-70 [overflow-wrap:anywhere]">
                {#if cloudSummary}
                  Removes files from {cloudSummary}.
                {:else}
                  Removes files from connected cloud storage if present.
                {/if}
              </span>
            </div>
          </label>
        {/if}

        <label
          class="flex items-start gap-2.5 cursor-pointer select-none min-w-0 min-h-[44px] py-1"
        >
          <input
            id="del-statistics"
            data-testid="delete-statistics-checkbox"
            type="checkbox"
            bind:checked={deleteStatistics}
            class="mt-0.5 h-4 w-4 shrink-0 rounded accent-[var(--astryx-color-danger,#ef4444)]"
          />
          <div class="min-w-0 flex-1">
            <span class="block text-sm font-medium"
              >Also delete reading statistics &amp; history</span
            >
            <span class="block text-xs opacity-70 [overflow-wrap:anywhere]">
              Permanently purges reading time, character count, and Lookback records. When
              unchecked, reading statistics are preserved.
            </span>
          </div>
        </label>
      </div>
    </div>
  </svelte:fragment>
  <div class="flex min-w-0 grow flex-wrap justify-between gap-2" slot="footer">
    <button class="{buttonClasses} relative overflow-hidden" on:click={() => closeDialog(true)}>
      Cancel
      <Ripple />
    </button>
    <button
      class="{buttonClasses} relative overflow-hidden {deleteStatistics
        ? 'bg-[var(--astryx-color-danger,#ef4444)] !text-white hover:bg-[var(--astryx-color-danger-hover,#dc2626)]'
        : ''}"
      data-testid="confirm-delete-button"
      on:click={() => closeDialog(false)}
    >
      {deleteFromCloud
        ? deleteStatistics
          ? 'Delete everywhere (all data)'
          : 'Delete everywhere'
        : hasLocalCopy
          ? deleteStatistics
            ? 'Delete local copy (all data)'
            : 'Delete local copy'
          : deleteStatistics
            ? 'Delete from cloud (all data)'
            : 'Delete from cloud'}
      <Ripple />
    </button>
  </div>
</DialogTemplate>
