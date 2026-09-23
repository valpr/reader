<script lang="ts">
  import { faImage } from '@fortawesome/free-regular-svg-icons';
  import { onDestroy } from 'svelte';
  import Fa from 'svelte-fa';

  export let imagePath: string | Blob;
  export let title: string;
  export let progress: number;

  let objectUrl = '';

  onDestroy(() => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  });

  function convertImagePath(value: string | Blob) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    if (typeof value !== 'string') {
      objectUrl = URL.createObjectURL(
        value.type ? value : new Blob([value], { type: 'image/jpeg' })
      );

      return objectUrl;
    }

    return value;
  }

  function mapImagePathFactory() {
    let prevValue: string | Blob | undefined;
    let prevResponse: string | undefined;

    const isEqual = (newValue: string | Blob) => {
      if (!prevValue) return false;
      if (prevValue instanceof Blob && newValue instanceof Blob) {
        return prevValue.type === newValue.type && prevValue.size === newValue.size;
      }
      if (typeof prevValue !== 'object' || typeof newValue !== 'object') {
        return prevValue === newValue;
      }
      return false;
    };

    return (value: string | Blob) => {
      if (isEqual(value)) return prevResponse as string;

      prevValue = value;
      prevResponse = convertImagePath(value);

      return prevResponse;
    };
  }

  const mapImagePath = mapImagePathFactory();

  let imgEl: HTMLImageElement | undefined;
  let imageLoading = true;

  $: imageLoadComplete = imgEl?.complete && !imageLoading;
  $: alt = `${title}_cover`;
</script>

<div tabindex="0" role="button" class="aspect-w-2 aspect-h-3 relative" on:click on:keyup>
  <div class="inline">
    <div class="h-full w-full text-5xl sm:text-7xl">
      {#if !imageLoadComplete}
        <Fa class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" icon={faImage} />
      {/if}

      {#if imagePath}
        <img
          decoding="async"
          loading="lazy"
          referrerpolicy="no-referrer"
          class="book-cover relative h-full w-full object-cover transition delay-150 duration-700 ease-out"
          class:blur={!imageLoadComplete}
          src={mapImagePath(imagePath)}
          {alt}
          bind:this={imgEl}
          on:load={() => (imageLoading = false)}
        />
      {/if}
    </div>

    <div class="absolute inset-x-0 bottom-0">
      <div
        class="sm:h-21 h-16 bg-gray-800 bg-opacity-80 p-0.5 px-1.5 text-justify text-sm text-white sm:p-1.5 sm:text-base"
      >
        <span class="line-clamp-3">{title}</span>
      </div>
      {#if progress > 0}
        <div class="px-2 pb-1.5">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="{title} reading progress"
            data-testid="book-card-progress"
            class="relative h-1.5 w-full rounded-full bg-black/50 backdrop-blur-sm"
          >
            <!-- User-requested progress color; intentionally not a theme token. -->
            <div
              class="h-full rounded-full bg-[#D6ADFF] shadow-[0_0_8px_0_rgba(214,173,255,0.8)]"
              style:width="{progress * 100}%"
            ></div>
            <div
              aria-hidden="true"
              class="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#D6ADFF] bg-white shadow-[0_0_6px_rgba(214,173,255,0.9)]"
              style:left="{progress * 100}%"
            ></div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
