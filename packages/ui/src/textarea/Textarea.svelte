<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TextareaSize } from '../types';

  export let value: string | null | undefined = '';
  export let label: string = '';
  export let placeholder: string = '';
  export let helperText: string = '';
  export let error: string | boolean = false;
  export let size: TextareaSize = 'md';
  export let disabled: boolean = false;
  export let readonly: boolean = false;
  export let rows: number = 2;
  export let id: string = `astryx-textarea-${Math.random().toString(36).substring(2, 9)}`;
  let customClass: string = '';
  export { customClass as class };

  const dispatch = createEventDispatcher<{
    input: Event;
    change: Event;
    focus: FocusEvent;
    blur: FocusEvent;
    keydown: KeyboardEvent;
  }>();

  let isFocused = false;
  let textareaEl: HTMLTextAreaElement;

  $: hasError = !!error;
  $: errorMessage = typeof error === 'string' ? error : '';

  function handleInput(e: Event) {
    value = (e.target as HTMLTextAreaElement).value;
    dispatch('input', e);
  }

  function handleChange(e: Event) {
    dispatch('change', e);
  }

  function handleFocus(e: FocusEvent) {
    isFocused = true;
    dispatch('focus', e);
  }

  function handleBlur(e: FocusEvent) {
    isFocused = false;
    dispatch('blur', e);
  }

  function handleKeyDown(e: KeyboardEvent) {
    dispatch('keydown', e);
  }

  export function focus() {
    textareaEl?.focus();
  }
</script>

<div
  class="astryx-textarea-wrapper {customClass}"
  class:is-disabled={disabled}
  class:has-error={hasError}
  class:is-focused={isFocused}
  data-size={size}
>
  {#if label}
    <label for={id} class="astryx-textarea-label">
      {label}
    </label>
  {/if}

  <div class="astryx-textarea-box">
    <textarea
      {id}
      bind:this={textareaEl}
      {placeholder}
      {disabled}
      {readonly}
      {rows}
      {value}
      class="astryx-textarea-element"
      on:input={handleInput}
      on:change={handleChange}
      on:focus={handleFocus}
      on:blur={handleBlur}
      on:keydown={handleKeyDown}
      {...$$restProps}></textarea>
  </div>

  {#if hasError && errorMessage}
    <p class="astryx-textarea-feedback is-error" role="alert">{errorMessage}</p>
  {:else if helperText}
    <p class="astryx-textarea-feedback is-helper">{helperText}</p>
  {/if}
</div>

<style>
  .astryx-textarea-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    font-family: var(--astryx-font-family-sans, sans-serif);
    box-sizing: border-box;
    text-align: left;
    color-scheme: light;
  }
  :global(.dark) .astryx-textarea-wrapper {
    color-scheme: dark;
  }

  .astryx-textarea-label {
    display: block;
    margin-bottom: var(--astryx-space-1-5, 6px);
    font-size: var(--astryx-font-size-sm, 0.875rem);
    font-weight: var(--astryx-font-weight-medium, 500);
    color: var(--astryx-color-fg-primary, #18181b);
    user-select: none;
    line-height: 1.2;
  }

  .astryx-textarea-box {
    display: flex;
    width: 100%;
    box-sizing: border-box;
    background-color: var(--astryx-color-surface, #ffffff);
    border: 1px solid var(--astryx-color-border-default, #e4e4e7);
    border-radius: var(--astryx-radius-md, 6px);
    transition:
      border-color var(--astryx-duration-fast, 120ms) var(--astryx-ease, ease),
      background-color var(--astryx-duration-fast, 120ms) var(--astryx-ease, ease),
      box-shadow var(--astryx-duration-fast, 120ms) var(--astryx-ease, ease);
  }

  [data-size='sm'] .astryx-textarea-box {
    padding: var(--astryx-space-1-5, 6px) var(--astryx-space-2, 8px);
    font-size: var(--astryx-font-size-xs, 0.75rem);
  }
  [data-size='md'] .astryx-textarea-box {
    padding: var(--astryx-space-2, 8px) var(--astryx-space-3, 12px);
    font-size: var(--astryx-font-size-sm, 0.875rem);
  }
  [data-size='lg'] .astryx-textarea-box {
    padding: var(--astryx-space-3, 12px) var(--astryx-space-4, 16px);
    font-size: var(--astryx-font-size-md, 1rem);
  }

  .astryx-textarea-element {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    margin: 0;
    border: none;
    outline: none;
    background: transparent;
    box-shadow: none;
    resize: vertical;
    color: var(--astryx-color-fg-primary, #18181b);
    font-family: inherit;
    font-size: inherit;
    line-height: 1.5;
  }

  .astryx-textarea-element:focus,
  .astryx-textarea-element:focus-visible,
  .astryx-textarea-element:active {
    outline: none !important;
    border: none !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }

  .astryx-textarea-element::placeholder {
    color: var(--astryx-color-fg-muted, #a1a1aa);
    opacity: 1;
  }

  .astryx-textarea-box:hover {
    border-color: var(--astryx-color-border-hover, #d4d4d8);
  }

  .astryx-textarea-wrapper.is-focused .astryx-textarea-box {
    border-color: var(--astryx-color-border-focus, #18181b);
    box-shadow:
      0 0 0 1px var(--astryx-color-border-focus, #18181b),
      0 0 0 3px rgba(24, 24, 27, 0.08);
  }

  .astryx-textarea-wrapper.has-error .astryx-textarea-box {
    border-color: var(--astryx-color-danger, #ef4444);
  }
  .astryx-textarea-wrapper.has-error.is-focused .astryx-textarea-box {
    box-shadow:
      0 0 0 1px var(--astryx-color-danger, #ef4444),
      0 0 0 3px rgba(239, 68, 68, 0.12);
  }
  .astryx-textarea-wrapper.has-error .astryx-textarea-label {
    color: var(--astryx-color-danger, #ef4444);
  }

  .astryx-textarea-wrapper.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .astryx-textarea-wrapper.is-disabled .astryx-textarea-box {
    background-color: var(--astryx-color-surface-subtle, #f4f4f5);
    border-color: var(--astryx-color-border-subtle, #e4e4e7);
    pointer-events: none;
  }

  .astryx-textarea-feedback {
    margin: var(--astryx-space-1, 4px) 0 0 0;
    font-size: var(--astryx-font-size-xs, 0.75rem);
    line-height: 1.3;
  }
  .astryx-textarea-feedback.is-error {
    color: var(--astryx-color-danger, #ef4444);
  }
  .astryx-textarea-feedback.is-helper {
    color: var(--astryx-color-fg-muted, #71717a);
  }
</style>
