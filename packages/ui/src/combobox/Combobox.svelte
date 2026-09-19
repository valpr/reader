<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { ComboboxOption, ComboboxSize } from '../types';

  /**
   * Searchable multi-select: type to filter `options`, pick a match to add it,
   * remove entries from the selected list. Add/remove apply immediately via
   * `add`/`remove` events — there is no staged state and no Apply step.
   */
  export let options: ComboboxOption[] = [];
  export let selectedValues: string[] = [];
  export let label: string = '';
  export let placeholder: string = 'Search…';
  export let emptyText: string = 'No matches';
  export let selectedTitle: string = 'Selected';
  export let size: ComboboxSize = 'md';
  export let disabled: boolean = false;
  export let id: string = `astryx-combobox-${Math.random().toString(36).substring(2, 9)}`;
  let customClass: string = '';
  export { customClass as class };

  const dispatch = createEventDispatcher<{
    add: { value: string };
    remove: { value: string };
  }>();

  const maxVisibleMatches = 50;

  let query = '';
  let open = false;
  let activeIndex = -1;
  let wrapperEl: HTMLElement;
  let inputEl: HTMLInputElement;
  let listboxId = `${id}-listbox`;

  $: selectedSet = new Set(selectedValues);
  $: labelByValue = new Map(options.map((option) => [option.value, option.label]));
  $: matches = options.filter(
    (option) =>
      !option.disabled &&
      !selectedSet.has(option.value) &&
      (!query.trim() || option.label.toLowerCase().includes(query.trim().toLowerCase()))
  );
  $: visibleMatches = matches.slice(0, maxVisibleMatches);
  $: hiddenMatchCount = matches.length - visibleMatches.length;
  // Reset keyboard position whenever the match list changes.
  $: if (matches) {
    activeIndex = -1;
  }

  function openDropdown() {
    if (!disabled) {
      open = true;
    }
  }

  function closeDropdown() {
    open = false;
    activeIndex = -1;
  }

  function addValue(value: string) {
    if (disabled) return;
    dispatch('add', { value });
    if (inputEl) {
      inputEl.focus();
    }
  }

  function removeValue(value: string) {
    if (disabled) return;
    dispatch('remove', { value });
  }

  function handleInput() {
    openDropdown();
  }

  function handleFocus() {
    openDropdown();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openDropdown();
      activeIndex = Math.min(activeIndex + 1, visibleMatches.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
    } else if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && visibleMatches[activeIndex]) {
        event.preventDefault();
        addValue(visibleMatches[activeIndex].value);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        closeDropdown();
      }
    }
  }

  onMount(() => {
    const handleWindowClick = (event: MouseEvent) => {
      if (wrapperEl && !wrapperEl.contains(event.target as Node)) {
        closeDropdown();
      }
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  });
</script>

<div
  class="astryx-combobox {customClass}"
  class:is-disabled={disabled}
  data-size={size}
  bind:this={wrapperEl}
>
  {#if label}
    <label for={id} class="astryx-combobox-label">{label}</label>
  {/if}

  <div class="astryx-combobox-box">
    <input
      {id}
      bind:this={inputEl}
      type="search"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-autocomplete="list"
      aria-activedescendant={activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
      {placeholder}
      {disabled}
      bind:value={query}
      class="astryx-combobox-element"
      autocomplete="off"
      on:input={handleInput}
      on:focus={handleFocus}
      on:keydown={handleKeyDown}
    />
  </div>

  {#if open && !disabled}
    <div class="astryx-combobox-panel">
      {#if visibleMatches.length}
        <ul
          role="listbox"
          id={listboxId}
          aria-label={label || placeholder}
          class="astryx-combobox-list"
        >
          {#each visibleMatches as match, index (match.value)}
            <li
              role="option"
              id={`${id}-opt-${index}`}
              aria-selected={index === activeIndex}
              class="astryx-combobox-option"
              class:is-active={index === activeIndex}
            >
              <button
                type="button"
                class="astryx-combobox-option-btn"
                on:click={() => addValue(match.value)}
              >
                <span class="astryx-combobox-option-label" title={match.label}>{match.label}</span>
                {#if match.hint}
                  <span class="astryx-combobox-option-hint">{match.hint}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if hiddenMatchCount > 0}
          <p class="astryx-combobox-more">{hiddenMatchCount} more — keep typing to narrow down</p>
        {/if}
      {:else}
        <p class="astryx-combobox-empty">{emptyText}</p>
      {/if}
    </div>
  {/if}

  {#if selectedValues.length}
    <div class="astryx-combobox-selected-label">{selectedTitle} ({selectedValues.length})</div>
    <ul class="astryx-combobox-selected" aria-label={selectedTitle}>
      {#each selectedValues as selectedValue (selectedValue)}
        {@const selectedLabel = labelByValue.get(selectedValue) || selectedValue}
        <li class="astryx-combobox-chip">
          <span class="astryx-combobox-chip-label" title={selectedLabel}>{selectedLabel}</span>
          <button
            type="button"
            class="astryx-combobox-chip-remove"
            aria-label={`Remove ${selectedLabel}`}
            {disabled}
            on:click={() => removeValue(selectedValue)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .astryx-combobox {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    font-family: var(--astryx-font-family-sans, sans-serif);
    box-sizing: border-box;
    text-align: left;
  }

  .astryx-combobox-label,
  .astryx-combobox-selected-label {
    display: block;
    margin-bottom: var(--astryx-space-1-5, 6px);
    font-size: var(--astryx-font-size-sm, 0.875rem);
    font-weight: var(--astryx-font-weight-medium, 500);
    color: var(--astryx-color-fg-primary, #18181b);
    user-select: none;
    line-height: 1.2;
  }

  .astryx-combobox-selected-label {
    margin-top: var(--astryx-space-3, 12px);
  }

  .astryx-combobox-box {
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    background-color: var(--astryx-color-surface, #ffffff);
    border: 1px solid var(--astryx-color-border-default, #e4e4e7);
    border-radius: var(--astryx-radius-md, 6px);
  }

  .astryx-combobox-box:hover {
    border-color: var(--astryx-color-border-hover, #d4d4d8);
  }

  .astryx-combobox-box:focus-within {
    border-color: var(--astryx-color-border-focus, #18181b);
    box-shadow:
      0 0 0 1px var(--astryx-color-border-focus, #18181b),
      0 0 0 3px rgba(24, 24, 27, 0.08);
  }

  [data-size='sm'] .astryx-combobox-box {
    min-height: 30px;
    font-size: var(--astryx-font-size-xs, 0.75rem);
  }
  [data-size='md'] .astryx-combobox-box {
    min-height: 44px;
    font-size: var(--astryx-font-size-sm, 0.875rem);
  }
  [data-size='lg'] .astryx-combobox-box {
    min-height: 46px;
    font-size: var(--astryx-font-size-md, 1rem);
  }

  .astryx-combobox-element {
    flex: 1;
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    box-shadow: none;
    color: var(--astryx-color-fg-primary, #18181b);
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    padding: var(--astryx-space-2, 8px) var(--astryx-space-3, 12px);
    -webkit-appearance: none;
    appearance: none;
  }

  .astryx-combobox-panel {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    margin-top: var(--astryx-space-1-5, 6px);
    background-color: var(--astryx-color-surface, #ffffff);
    border: 1px solid var(--astryx-color-border-default, #e4e4e7);
    border-radius: var(--astryx-radius-md, 6px);
    box-shadow: var(--astryx-elevation-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
    overflow: hidden;
  }

  .astryx-combobox-list {
    list-style: none;
    margin: 0;
    padding: var(--astryx-space-1, 4px);
    max-height: 12rem;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .astryx-combobox-option {
    margin: 0;
    padding: 0;
  }

  .astryx-combobox-option-btn {
    display: flex;
    align-items: center;
    gap: var(--astryx-space-2, 8px);
    width: 100%;
    min-width: 0;
    min-height: 44px;
    box-sizing: border-box;
    padding: var(--astryx-space-1-5, 6px) var(--astryx-space-3, 12px);
    background: transparent;
    border: none;
    border-radius: calc(var(--astryx-radius-md, 6px) - 2px);
    color: var(--astryx-color-fg-primary, #18181b);
    font-family: inherit;
    font-size: var(--astryx-font-size-sm, 0.875rem);
    text-align: left;
    cursor: pointer;
  }

  .astryx-combobox-option-btn:hover,
  .astryx-combobox-option.is-active .astryx-combobox-option-btn {
    background-color: var(--astryx-color-surface-subtle, #f4f4f5);
  }

  .astryx-combobox-option-btn:focus-visible {
    outline: 2px solid var(--astryx-color-border-focus, #18181b);
    outline-offset: -2px;
  }

  .astryx-combobox-option-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .astryx-combobox-option-hint {
    flex-shrink: 0;
    font-size: var(--astryx-font-size-xs, 0.75rem);
    color: var(--astryx-color-fg-muted, #71717a);
  }

  .astryx-combobox-more,
  .astryx-combobox-empty {
    margin: 0;
    padding: var(--astryx-space-2, 8px) var(--astryx-space-3, 12px);
    font-size: var(--astryx-font-size-xs, 0.75rem);
    color: var(--astryx-color-fg-secondary, #71717a);
  }

  .astryx-combobox-selected {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--astryx-space-2, 8px);
    margin: var(--astryx-space-1-5, 6px) 0 0 0;
    padding: 0;
    max-width: 100%;
  }

  .astryx-combobox-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--astryx-space-1, 4px);
    max-width: 100%;
    min-width: 0;
    min-height: 44px;
    box-sizing: border-box;
    padding-left: var(--astryx-space-3, 12px);
    background-color: var(--astryx-color-surface-subtle, #f4f4f5);
    border: 1px solid var(--astryx-color-border-default, #d4d4d8);
    border-radius: var(--astryx-radius-full, 9999px);
    color: var(--astryx-color-fg-primary, #18181b);
    font-size: var(--astryx-font-size-sm, 0.875rem);
  }

  .astryx-combobox-chip-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .astryx-combobox-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 44px;
    min-height: 44px;
    margin: 0;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--astryx-radius-full, 9999px);
    color: var(--astryx-color-fg-secondary, #52525b);
    cursor: pointer;
  }

  .astryx-combobox-chip-remove:hover {
    color: var(--astryx-color-fg-primary, #18181b);
    background-color: var(--astryx-color-surface-active, #e4e4e7);
  }

  .astryx-combobox-chip-remove:focus-visible {
    outline: 2px solid var(--astryx-color-border-focus, #18181b);
    outline-offset: -2px;
  }

  .is-disabled {
    opacity: 0.5;
  }
  .is-disabled .astryx-combobox-element,
  .is-disabled .astryx-combobox-chip-remove {
    cursor: not-allowed;
  }
</style>
