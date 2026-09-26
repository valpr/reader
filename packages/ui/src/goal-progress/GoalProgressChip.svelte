<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Tooltip from '../tooltip/Tooltip.svelte';
  import type { GoalProgressChipState, GoalProgressVariant } from '../types';

  export let timeLabel: string = '';
  export let timePercent: number = 0;
  export let charLabel: string = '';
  export let charPercent: number = 0;
  export let windowLabel: string = '';
  export let remainingLabel: string = '';
  export let state: GoalProgressChipState = 'active';
  export let variant: GoalProgressVariant = 'chip';
  export let size: 'sm' | 'md' = 'md';
  export let label: string = 'Reading goal progress';

  const dispatch = createEventDispatcher<{ click: MouseEvent }>();

  $: hasTime = timeLabel !== '';
  $: hasChars = charLabel !== '';
  $: hasContent = hasTime || hasChars;
  $: badgePercent = Math.floor(
    hasTime && hasChars ? Math.min(timePercent, charPercent) : hasTime ? timePercent : charPercent
  );
  $: clampedTime = Math.min(100, Math.max(0, timePercent));
  $: clampedChars = Math.min(100, Math.max(0, charPercent));
  $: tooltipText = [label, windowLabel, timeLabel, charLabel, remainingLabel]
    .filter((part) => part !== '')
    .join(' • ');
  $: accessibleLabel = tooltipText || label;

  function handleClick(event: MouseEvent) {
    dispatch('click', event);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dispatch('click', event as unknown as MouseEvent);
    }
  }
</script>

{#if hasContent}
  <Tooltip text={tooltipText}>
    <button
      type="button"
      class="astryx-goal-chip"
      data-testid="goal-progress-chip"
      data-state={state}
      data-variant={variant}
      data-size={size}
      aria-label={accessibleLabel}
      title={tooltipText}
      on:click={handleClick}
      on:keydown={handleKeyDown}
    >
      {#if variant === 'badge'}
        <span class="astryx-goal-badge-dot" data-state={state} aria-hidden="true"></span>
        <span class="astryx-goal-badge-percent">{badgePercent}%</span>
      {:else}
        <span class="astryx-goal-rows">
          {#if hasTime}
            <span class="astryx-goal-row">
              <span class="astryx-goal-text min-w-0 truncate" title={timeLabel}>{timeLabel}</span>
              <span
                class="astryx-goal-bar"
                role="progressbar"
                aria-label={timeLabel}
                aria-valuenow={Math.round(clampedTime)}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span class="astryx-goal-fill" style:width={`${clampedTime}%`}></span>
              </span>
            </span>
          {/if}
          {#if hasChars}
            <span class="astryx-goal-row">
              <span class="astryx-goal-text min-w-0 truncate" title={charLabel}>{charLabel}</span>
              <span
                class="astryx-goal-bar"
                role="progressbar"
                aria-label={charLabel}
                aria-valuenow={Math.round(clampedChars)}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span class="astryx-goal-fill" style:width={`${clampedChars}%`}></span>
              </span>
            </span>
          {/if}
          {#if windowLabel !== '' || remainingLabel !== ''}
            <span
              class="astryx-goal-meta min-w-0 break-words [overflow-wrap:anywhere]"
              title={[windowLabel, remainingLabel].filter((p) => p !== '').join(' • ')}
            >
              {[windowLabel, remainingLabel].filter((p) => p !== '').join(' • ')}
            </span>
          {/if}
        </span>
      {/if}
      <slot />
    </button>
  </Tooltip>
{/if}

<style>
  .astryx-goal-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--astryx-space-2, 8px);
    max-width: 100%;
    min-width: 0;
    padding: var(--astryx-space-1-5, 6px) var(--astryx-space-3, 12px);
    border: 1px solid var(--astryx-color-border-default, #e4e4e7);
    border-radius: var(--astryx-radius-full, 9999px);
    background-color: var(--astryx-color-surface, #ffffff);
    color: var(--astryx-color-fg-primary, #18181b);
    font-size: var(--astryx-font-size-xs, 0.75rem);
    font-weight: var(--astryx-font-weight-medium, 500);
    line-height: 1.35;
    cursor: pointer;
    box-sizing: border-box;
  }
  .astryx-goal-chip:hover {
    background-color: var(--astryx-color-surface-subtle, #f4f4f5);
  }
  .astryx-goal-chip:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--astryx-color-surface, #fff),
      0 0 0 4px var(--astryx-color-border-focus, #18181b);
  }
  .astryx-goal-chip[data-size='md'] {
    min-height: 44px;
  }
  .astryx-goal-chip[data-size='sm'] {
    min-height: 28px;
    padding: var(--astryx-space-1, 4px) var(--astryx-space-2-5, 9px);
  }
  .astryx-goal-badge-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: var(--astryx-radius-full, 9999px);
    background-color: var(--astryx-color-brand, #18181b);
  }
  .astryx-goal-badge-dot[data-state='complete'] {
    background-color: var(--astryx-color-success, #16a34a);
  }
  .astryx-goal-badge-dot[data-state='overdue'] {
    background-color: var(--astryx-color-warning, #f59e0b);
  }
  .astryx-goal-badge-percent {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .astryx-goal-rows {
    display: flex;
    flex-direction: column;
    gap: var(--astryx-space-1, 4px);
    min-width: 0;
    width: 100%;
  }
  .astryx-goal-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .astryx-goal-text {
    display: block;
  }
  .astryx-goal-bar {
    display: block;
    width: 100%;
    height: 10px;
    border-radius: var(--astryx-radius-full, 9999px);
    background-color: var(--astryx-color-surface-active, #e4e4e7);
    overflow: hidden;
  }
  .astryx-goal-fill {
    display: block;
    height: 100%;
    border-radius: var(--astryx-radius-full, 9999px);
    background-color: var(--astryx-color-brand, #18181b);
    opacity: 0.7;
  }
  .astryx-goal-meta {
    display: block;
    color: var(--astryx-color-fg-secondary, #52525b);
  }
</style>
