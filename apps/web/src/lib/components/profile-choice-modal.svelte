<script lang="ts">
  import { faBookOpen, faCheck, faMobileScreen } from '@fortawesome/free-solid-svg-icons';
  import { Button, Dialog } from '@custom-ereader/ui';
  import { createEventDispatcher } from 'svelte';
  import Fa from 'svelte-fa';
  import type { SuggestedProfileId } from '$lib/data/profiles/profile-manager';

  export let open: boolean = false;
  export let preselectedId: SuggestedProfileId = 'default-mobile';

  const dispatch = createEventDispatcher<{
    confirm: SuggestedProfileId;
    close: void;
  }>();

  let selectedId: SuggestedProfileId = preselectedId;

  // Reset the selection while closed so each fresh open starts at the
  // detected suggestion; user picks made while open are never clobbered.
  $: if (!open) {
    selectedId = preselectedId;
  }

  function select(id: SuggestedProfileId) {
    selectedId = id;
  }

  function handleKey(e: KeyboardEvent, id: SuggestedProfileId) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(id);
    }
  }

  function handleConfirm() {
    dispatch('confirm', selectedId);
  }
</script>

/** * @license BSD-3-Clause * Copyright (c) 2026, ッツ Reader Authors * All rights reserved. */

<Dialog
  bind:open
  title="Choose your reading profile"
  description="Looks like you're not on a desktop. Pick a starting point — you can change it anytime in Settings > Reader > Profiles."
  size="sm"
  showCloseButton={false}
  closeOnBackdropClick={false}
  on:close
  data-testid="profile-choice-modal"
>
  <div
    role="radiogroup"
    aria-label="Starting profile"
    class="grid grid-cols-1 gap-2.5 w-full max-w-full py-2"
  >
    <div
      role="radio"
      aria-checked={selectedId === 'default-mobile'}
      tabindex="0"
      data-testid="profile-choice-mobile"
      on:click={() => select('default-mobile')}
      on:keydown={(e) => handleKey(e, 'default-mobile')}
      class="relative flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all duration-150 cursor-pointer select-none min-w-0 w-full max-w-full overflow-hidden break-words [overflow-wrap:anywhere]"
      class:border-zinc-800={selectedId === 'default-mobile'}
      class:dark:border-zinc-200={selectedId === 'default-mobile'}
      class:shadow-sm={selectedId === 'default-mobile'}
      class:border-zinc-200={selectedId !== 'default-mobile'}
      class:dark:border-zinc-700={selectedId !== 'default-mobile'}
      style="background-color: {selectedId === 'default-mobile'
        ? 'var(--astryx-color-surface-selected, rgba(255, 255, 255, 0.08))'
        : 'var(--astryx-color-surface, transparent)'};"
    >
      <span
        class="w-9 h-9 rounded-md flex items-center justify-center text-sm font-semibold shrink-0 min-h-[44px] min-w-[44px]"
        style="background-color: var(--astryx-color-surface-subtle, rgba(0, 0, 0, 0.05)); color: var(--astryx-color-fg-primary, inherit);"
      >
        <Fa icon={faMobileScreen} />
      </span>
      <span class="flex flex-col min-w-0 flex-1">
        <span class="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate min-w-0">
          Mobile / Phone
        </span>
        <span class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Compact layout with tap-edge page turning (17px font, 1 column)
        </span>
      </span>
      {#if selectedId === 'default-mobile'}
        <span
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0"
        >
          <Fa icon={faCheck} class="text-[9px]" />
          Selected
        </span>
      {/if}
    </div>

    <div
      role="radio"
      aria-checked={selectedId === 'default-ereader'}
      tabindex="0"
      data-testid="profile-choice-ereader"
      on:click={() => select('default-ereader')}
      on:keydown={(e) => handleKey(e, 'default-ereader')}
      class="relative flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all duration-150 cursor-pointer select-none min-w-0 w-full max-w-full overflow-hidden break-words [overflow-wrap:anywhere]"
      class:border-zinc-800={selectedId === 'default-ereader'}
      class:dark:border-zinc-200={selectedId === 'default-ereader'}
      class:shadow-sm={selectedId === 'default-ereader'}
      class:border-zinc-200={selectedId !== 'default-ereader'}
      class:dark:border-zinc-700={selectedId !== 'default-ereader'}
      style="background-color: {selectedId === 'default-ereader'
        ? 'var(--astryx-color-surface-selected, rgba(255, 255, 255, 0.08))'
        : 'var(--astryx-color-surface, transparent)'};"
    >
      <span
        class="w-9 h-9 rounded-md flex items-center justify-center text-sm font-semibold shrink-0 min-h-[44px] min-w-[44px]"
        style="background-color: var(--astryx-color-surface-subtle, rgba(0, 0, 0, 0.05)); color: var(--astryx-color-fg-primary, inherit);"
      >
        <Fa icon={faBookOpen} />
      </span>
      <span class="flex flex-col min-w-0 flex-1">
        <span class="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate min-w-0">
          E-Reader / E-Ink
        </span>
        <span class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          High contrast for E-Ink devices (20px font, 500 weight, pinned header)
        </span>
      </span>
      {#if selectedId === 'default-ereader'}
        <span
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shrink-0"
        >
          <Fa icon={faCheck} class="text-[9px]" />
          Selected
        </span>
      {/if}
    </div>
  </div>

  <svelte:fragment slot="footer">
    <Button
      variant="ghost"
      size="sm"
      on:click={() => dispatch('close')}
      data-testid="profile-choice-skip"
    >
      Skip (keep Desktop)
    </Button>
    <Button
      variant="primary"
      size="sm"
      on:click={handleConfirm}
      data-testid="profile-choice-confirm"
    >
      Confirm
    </Button>
  </svelte:fragment>
</Dialog>
