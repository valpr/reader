<script lang="ts">
  import Popover from '$lib/components/popover/popover.svelte';
  import { syncActivity$ } from '$lib/functions/replication/replication-progress';
  import { IconButton } from '@custom-ereader/ui';
  import { faArrowsRotate } from '@fortawesome/free-solid-svg-icons';
  import { onDestroy } from 'svelte';
  import Fa from 'svelte-fa';

  // Hover (desktop, via Popover pointer mode) or long-press (touch, via the
  // 500ms timer below — same precedent as the bookmark long-press in the
  // reader header) reveals what is syncing right now. Tap also opens the
  // panel on touch since pointerenter fires on touch-down.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let popoverElm: Popover;

  function handlePressStart() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressTimer = undefined;
      void popoverElm?.toggleOpen();
    }, 500);
  }

  function handlePressEnd() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = undefined;
    }
  }

  onDestroy(() => {
    if (pressTimer) clearTimeout(pressTimer);
  });
</script>

<svelte:window on:pointerup={handlePressEnd} on:pointercancel={handlePressEnd} />

{#if $syncActivity$.active}
  <span
    role="status"
    aria-live="polite"
    data-testid="sync-activity-icon"
    class="inline-flex items-center"
  >
    <Popover
      placement="bottom"
      fallbackPlacements={['bottom-end', 'bottom-start']}
      yOffset={4}
      eventType="pointer"
      contentStyles="padding: 0.75rem;"
      bind:this={popoverElm}
    >
      <div slot="icon" class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center">
        <IconButton
          nativeTooltip={false}
          label={$syncActivity$.label || 'Sync in progress'}
          size="md"
          variant="ghost"
          aria-label={$syncActivity$.label || 'Sync in progress'}
          on:pointerdown={handlePressStart}
          on:mouseleave={handlePressEnd}
        >
          <Fa icon={faArrowsRotate} class="animate-spin text-base" />
        </IconButton>
      </div>
      <div
        slot="content"
        class="w-full min-w-0 max-w-[16rem] break-words text-sm font-medium text-[var(--astryx-color-fg-primary)] [overflow-wrap:anywhere]"
      >
        {$syncActivity$.label || 'Sync in progress'}
        {#if $syncActivity$.total !== undefined && ($syncActivity$.total ?? 0) > 1}
          <span class="mt-0.5 block text-xs font-normal text-[var(--astryx-color-fg-muted)]">
            {($syncActivity$.completed ?? 0) + 1} of {$syncActivity$.total}
          </span>
        {/if}
      </div>
    </Popover>
  </span>
{/if}
