<script lang="ts">
  import { faImage } from '@fortawesome/free-regular-svg-icons';
  import { onDestroy } from 'svelte';
  import Fa from 'svelte-fa';

  export let coverImage: string | Blob | undefined;
  export let title: string;

  let objectUrl = '';

  function resolveCover(value: string | Blob | undefined): string {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    if (value && typeof value !== 'string') {
      objectUrl = URL.createObjectURL(
        value.type ? value : new Blob([value], { type: 'image/jpeg' })
      );
      return objectUrl;
    }
    return value || '';
  }

  $: coverSrc = resolveCover(coverImage);

  onDestroy(() => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  });
</script>

<div
  class="relative flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--astryx-color-surface-sunken,#f4f4f5)] dark:bg-zinc-800"
>
  {#if coverSrc}
    <img
      src={coverSrc}
      alt={`${title} cover`}
      decoding="async"
      loading="lazy"
      class="absolute inset-0 h-full w-full object-cover"
    />
  {:else}
    <Fa icon={faImage} class="text-4xl opacity-40" />
  {/if}
</div>
