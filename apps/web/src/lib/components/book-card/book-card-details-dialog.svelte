<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { getCardDateInfo, getSourceLabel } from '$lib/components/book-card/book-card-info';
  import type { StorageKey } from '$lib/data/storage/storage-types';
  import { normalizeTag, normalizeTagList } from '$lib/data/book-tags';
  import { buttonClasses } from '$lib/css-classes';
  import { Input } from '@custom-ereader/ui';
  import { createEventDispatcher } from 'svelte';

  export let title = '';
  export let characters = 0;
  export let progress = 0;
  export let lastBookOpen = 0;
  export let lastBookmarkModified = 0;
  export let lastBookModified = 0;
  export let sources: StorageKey[] = [];
  export let initialTags: string[] = [];
  export let allTags: string[] = [];
  export let isCloudOnly = false;
  export let onSaveTags: ((tags: string[]) => Promise<void>) | undefined = undefined;
  export let onResetProgress: (() => Promise<void>) | undefined = undefined;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let tags: string[] = normalizeTagList(initialTags);
  let inputValue = '';
  let suggestionsOpen = false;
  let highlightedIndex = -1;
  let saving = false;
  let saveError = '';
  let resetting = false;
  let resetError = '';
  let showResetConfirm = false;

  $: sourceLabels = (sources || []).map(getSourceLabel);
  $: progressLabel = `${Math.round((progress || 0) * 100)}%`;
  $: suggestions = (allTags || [])
    .filter((tag) => {
      const query = inputValue.trim().toLowerCase();
      return tag && !tags.includes(tag) && (!query || tag.includes(query));
    })
    .slice(0, 8);
  $: if (!suggestionsOpen) {
    highlightedIndex = -1;
  }
  $: dirty =
    JSON.stringify([...tags].sort()) !== JSON.stringify(normalizeTagList(initialTags)) ||
    !!normalizeTag(inputValue);

  function addTag(raw: string) {
    const normalized = normalizeTag(raw);
    if (!normalized || tags.includes(normalized)) {
      inputValue = '';
      suggestionsOpen = false;
      return;
    }
    tags = normalizeTagList([...tags, normalized]);
    inputValue = '';
    suggestionsOpen = false;
    saveError = '';
  }

  function removeTag(tag: string) {
    tags = tags.filter((t) => t !== tag);
    saveError = '';
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (suggestionsOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        addTag(suggestions[highlightedIndex]);
      } else {
        addTag(inputValue);
      }
    } else if (event.key === 'Backspace' && !inputValue && tags.length) {
      removeTag(tags[tags.length - 1]);
    } else if (event.key === 'ArrowDown' && suggestionsOpen && suggestions.length) {
      event.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % suggestions.length;
    } else if (event.key === 'ArrowUp' && suggestionsOpen && suggestions.length) {
      event.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length;
    } else if (event.key === 'Escape') {
      suggestionsOpen = false;
    }
  }

  async function save() {
    if (!onSaveTags || saving || isCloudOnly) return;
    // Commit any pending input so typing a tag then clicking Save directly works.
    if (normalizeTag(inputValue)) {
      addTag(inputValue);
    }
    saving = true;
    saveError = '';
    try {
      await onSaveTags(tags);
      dispatch('close');
    } catch (error: any) {
      saveError = error?.message || 'Failed to save tags';
    } finally {
      saving = false;
    }
  }

  async function handleResetProgress() {
    if (!onResetProgress || resetting) return;
    resetting = true;
    resetError = '';
    try {
      await onResetProgress();
      dispatch('close');
    } catch (error: any) {
      resetError = error?.message || 'Failed to reset progress and stats';
    } finally {
      resetting = false;
    }
  }
</script>

<DialogTemplate>
  <svelte:fragment slot="header">
    <span class="block truncate" {title}>{title}</span>
  </svelte:fragment>
  <svelte:fragment slot="content">
    <div data-testid="book-details-dialog" class="w-full max-w-full min-w-0">
      <div>Sources:</div>
      <div class="w-full min-w-0 break-words [overflow-wrap:anywhere]">
        {sourceLabels.length ? sourceLabels.join(', ') : 'No Data'}
      </div>
      <div class="mt-4">Progress:</div>
      <div class="w-full min-w-0 break-words [overflow-wrap:anywhere]">{progressLabel}</div>
      <div class="mt-4">Characters:</div>
      <div class="w-full min-w-0 break-words [overflow-wrap:anywhere]">
        {characters || 'No Data'}
      </div>
      <div class="mt-4">Last Read:</div>
      <div class="w-full min-w-0 break-words [overflow-wrap:anywhere]">
        {getCardDateInfo(lastBookOpen)}
      </div>
      <div class="mt-4">Bookmarked:</div>
      <div class="w-full min-w-0 break-words [overflow-wrap:anywhere]">
        {getCardDateInfo(lastBookmarkModified)}
      </div>
      <div class="mt-4">Last Update:</div>
      <div class="w-full min-w-0 break-words [overflow-wrap:anywhere]">
        {getCardDateInfo(lastBookModified)}
      </div>

      <div class="mt-4" data-testid="book-tags-editor">
        <label for="book-tags-input" class="mb-1 block">Tags:</label>
        {#if isCloudOnly}
          <div class="text-sm opacity-70">
            {#if tags.length}
              <div class="flex flex-wrap gap-1 min-w-0">
                {#each tags as tag (tag)}
                  <span
                    class="rounded-full bg-[var(--astryx-color-surface,#ffffff)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--astryx-color-fg-secondary,#52525b)] shadow max-w-full truncate min-w-0"
                    title={tag}
                  >
                    {tag}
                  </span>
                {/each}
              </div>
            {:else}
              <span>No tags yet.</span>
            {/if}
            <div class="mt-1">Download this book to edit its tags.</div>
          </div>
        {:else}
          <div class="flex flex-wrap gap-1 min-w-0">
            {#each tags as tag (tag)}
              <span
                class="inline-flex items-center gap-1 rounded-full bg-[var(--astryx-color-primary-subtle,rgba(99,102,241,0.15))] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--astryx-color-primary,#6366f1)] max-w-full min-w-0"
                title={tag}
              >
                <span class="truncate min-w-0">{tag}</span>
                <button
                  type="button"
                  data-testid="remove-tag-{tag}"
                  aria-label="Remove tag {tag}"
                  class="cursor-pointer font-bold opacity-70 hover:opacity-100"
                  on:click={() => removeTag(tag)}>×</button
                >
              </span>
            {/each}
          </div>
          <div class="relative mt-1">
            <Input
              id="book-tags-input"
              data-testid="book-tags-input"
              type="text"
              placeholder="Add a tag, e.g. fantasy"
              autocomplete="off"
              bind:value={inputValue}
              on:focus={() => (suggestionsOpen = true)}
              on:blur={() => {
                setTimeout(() => (suggestionsOpen = false), 150);
              }}
              on:input={() => {
                suggestionsOpen = true;
                highlightedIndex = -1;
              }}
              on:keydown={(e) => onInputKeydown(e.detail)}
            />
            {#if suggestionsOpen && suggestions.length}
              <div
                data-testid="book-tags-suggestions"
                role="listbox"
                class="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded border border-[var(--astryx-color-border-default,#e4e4e7)] bg-[var(--astryx-color-surface-elevated,var(--astryx-color-surface,#ffffff))] shadow-lg"
              >
                {#each suggestions as suggestion, index (suggestion)}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlightedIndex}
                    data-testid="tag-suggestion-{suggestion}"
                    class="block w-full px-2 py-1 text-left text-sm text-[var(--astryx-color-fg-primary,#18181b)] hover:bg-[var(--astryx-color-surface-hover,#f4f4f5)]"
                    class:bg-[var(--astryx-color-surface-hover,#f4f4f5)]={index ===
                      highlightedIndex}
                    on:mousedown={(event) => {
                      event.preventDefault();
                      addTag(suggestion);
                    }}
                  >
                    {suggestion}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          {#if saveError}
            <div class="mt-1 text-sm text-red-600" role="alert">{saveError}</div>
          {/if}
        {/if}
      </div>

      {#if onResetProgress}
        <!-- pb-24: trailing content must clear the sticky dialog footer when
          the dialog scrolls on short viewports, otherwise the reset button
          ends up tucked under the footer and is untappable. -->
        <div
          class="mt-6 border-t border-[var(--astryx-color-border-subtle,rgba(0,0,0,0.1))] pt-4 pb-24"
          data-testid="reset-progress-section"
        >
          {#if showResetConfirm}
            <div
              class="w-full min-w-0 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              <p class="font-semibold break-words [overflow-wrap:anywhere]">
                Reset reading progress &amp; stats?
              </p>
              <p class="mt-1 text-xs opacity-90 break-words [overflow-wrap:anywhere]">
                Are you sure you want to reset reading progress and statistics for this book? This
                will reset progress to 0% and remove all stats entries for this book locally and in
                the cloud.
              </p>
              {#if resetError}
                <div
                  class="mt-2 text-xs font-semibold text-red-700 dark:text-red-300 break-words [overflow-wrap:anywhere]"
                  role="alert"
                >
                  {resetError}
                </div>
              {/if}
              <div class="mt-3 flex flex-wrap gap-2 min-w-0">
                <button
                  type="button"
                  data-testid="confirm-reset-progress"
                  class="rounded bg-red-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none min-h-[44px] min-w-[44px]"
                  disabled={resetting}
                  on:click={handleResetProgress}
                >
                  {resetting ? 'Resetting...' : 'Yes, Reset'}
                </button>
                <button
                  type="button"
                  data-testid="cancel-reset-progress"
                  class="rounded border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 min-h-[44px] min-w-[44px]"
                  disabled={resetting}
                  on:click={() => {
                    showResetConfirm = false;
                    resetError = '';
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <button
              type="button"
              data-testid="reset-progress-button"
              class="flex min-h-[44px] w-full items-center text-left text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 py-2"
              on:click={() => (showResetConfirm = true)}
            >
              Reset Reading Progress &amp; Stats…
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </svelte:fragment>
  <div class="flex grow justify-end gap-2" slot="footer">
    {#if !isCloudOnly && onSaveTags}
      <button
        class={buttonClasses}
        data-testid="save-tags"
        disabled={saving || !dirty}
        on:click={save}
      >
        {saving ? 'Saving...' : 'Save tags'}
        <Ripple />
      </button>
    {/if}
    <button class={buttonClasses} on:click={() => dispatch('close')}>
      Close
      <Ripple />
    </button>
  </div>
</DialogTemplate>
