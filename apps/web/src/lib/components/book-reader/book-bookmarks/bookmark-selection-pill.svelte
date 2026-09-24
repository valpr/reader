<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Fa from 'svelte-fa';
  import { faBookmark } from '@fortawesome/free-solid-svg-icons';
  import Ripple from '$lib/components/ripple.svelte';
  import { suppressDictionaryScan } from '$lib/functions/suppress-dictionary-scan';

  const dispatch = createEventDispatcher<{
    bookmark: void;
  }>();

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    suppressDictionaryScan();
    dispatch('bookmark');
  }
</script>

<div
  class="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-40 -translate-x-1/2 select-none"
  data-testid="bookmark-selection-pill"
>
  <button
    type="button"
    class="flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--astryx-color-border-subtle,#e4e4e7)] bg-[var(--astryx-color-surface-elevated,#ffffff)] px-5 py-2 text-sm font-medium text-[var(--astryx-color-fg-primary,#18181b)] shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
    on:mousedown|preventDefault
    on:click={handleClick}
  >
    <Fa icon={faBookmark} class="text-blue-500" />
    <span>Highlight text</span>
    <Ripple />
  </button>
</div>
