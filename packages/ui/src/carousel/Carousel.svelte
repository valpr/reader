<script lang="ts">
  import { afterUpdate, createEventDispatcher, onMount, tick } from 'svelte';

  /**
   * Scroll-snap carousel. Consumers place one element per slide in the
   * default slot and mark each with `data-carousel-slide`. The carousel
   * advances exactly one slide per control/indicator interaction.
   */
  export let ariaLabel: string = 'Carousel';
  export let showControls: boolean = true;
  export let showIndicators: boolean = true;
  export let previousLabel: string = 'Previous slide';
  export let nextLabel: string = 'Next slide';
  let customClass: string = '';
  export { customClass as class };

  const dispatch = createEventDispatcher<{
    change: { index: number; count: number };
  }>();

  let trackEl: HTMLElement;
  let slideCount = 0;
  let currentIndex = 0;
  let reduceMotion = false;

  function readSlides(): HTMLElement[] {
    if (!trackEl) return [];
    return Array.from(trackEl.querySelectorAll<HTMLElement>('[data-carousel-slide]'));
  }

  function slideStep(): number {
    const slides = readSlides();
    if (slides.length === 0) return 0;
    const gap = Number.parseFloat(getComputedStyle(trackEl).columnGap || '0') || 0;
    return slides[0].getBoundingClientRect().width + gap;
  }

  function refreshSlides() {
    const count = readSlides().length;
    slideCount = count;
    currentIndex = limitIndex(currentIndex, count);
  }

  function limitIndex(index: number, count: number) {
    if (count <= 0) return 0;
    return Math.min(Math.max(index, 0), count - 1);
  }

  function scrollBehavior(): ScrollBehavior {
    return reduceMotion ? 'auto' : 'smooth';
  }

  function goToSlide(index: number) {
    const count = readSlides().length;
    if (count === 0) return;
    const target = limitIndex(index, count);
    currentIndex = target;
    trackEl.scrollTo({ left: target * slideStep(), behavior: scrollBehavior() });
    dispatch('change', { index: target, count });
  }

  function handleScroll() {
    const step = slideStep();
    if (step > 0) {
      const next = limitIndex(Math.round(trackEl.scrollLeft / step), readSlides().length);
      if (next !== currentIndex) {
        currentIndex = next;
        dispatch('change', { index: next, count: readSlides().length });
      }
    }
  }

  onMount(() => {
    reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const update = () => refreshSlides();
    tick().then(update);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });

  afterUpdate(() => {
    refreshSlides();
  });
</script>

<div
  role="region"
  aria-roledescription="carousel"
  aria-label={ariaLabel}
  class="astryx-carousel {customClass}"
>
  <div class="astryx-carousel-viewport">
    {#if showControls && slideCount > 1}
      <button
        type="button"
        class="astryx-carousel-control is-prev"
        aria-label={previousLabel}
        disabled={currentIndex === 0}
        on:click={() => goToSlide(currentIndex - 1)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    {/if}

    <div
      class="astryx-carousel-track"
      bind:this={trackEl}
      role="group"
      aria-label={`${ariaLabel} slides`}
      on:scroll={handleScroll}
    >
      <slot />
    </div>

    {#if showControls && slideCount > 1}
      <button
        type="button"
        class="astryx-carousel-control is-next"
        aria-label={nextLabel}
        disabled={currentIndex === slideCount - 1}
        on:click={() => goToSlide(currentIndex + 1)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    {/if}
  </div>

  {#if showIndicators && slideCount > 1}
    <div class="astryx-carousel-indicators" role="group" aria-label={`${ariaLabel} position`}>
      {#each Array(slideCount) as _, index (index)}
        <button
          type="button"
          class="astryx-carousel-dot"
          class:is-active={index === currentIndex}
          aria-label={`Go to slide ${index + 1}`}
          aria-current={index === currentIndex}
          on:click={() => goToSlide(index)}
        ></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .astryx-carousel {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
    font-family: var(--astryx-font-family-sans, sans-serif);
  }

  .astryx-carousel-viewport {
    display: flex;
    align-items: stretch;
    gap: var(--astryx-space-2, 8px);
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .astryx-carousel-track {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: var(--astryx-space-3, 12px);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    padding: var(--astryx-space-1, 4px);
    margin: calc(-1 * var(--astryx-space-1, 4px));
    box-sizing: border-box;
  }
  .astryx-carousel-track::-webkit-scrollbar {
    display: none;
  }
  .astryx-carousel-track:focus-visible {
    outline: 2px solid var(--astryx-color-border-focus, #18181b);
    outline-offset: 2px;
    border-radius: var(--astryx-radius-md, 6px);
  }

  .astryx-carousel-track > :global([data-carousel-slide]) {
    scroll-snap-align: start;
    scroll-snap-stop: always;
    flex-shrink: 0;
    min-width: 0;
  }

  .astryx-carousel-control {
    flex-shrink: 0;
    align-self: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    width: 44px;
    height: 44px;
    box-sizing: border-box;
    border-radius: var(--astryx-radius-full, 9999px);
    border: 1px solid var(--astryx-color-border-default, #e4e4e7);
    background-color: var(--astryx-color-surface, #ffffff);
    color: var(--astryx-color-fg-primary, #18181b);
    cursor: pointer;
  }
  .astryx-carousel-control:hover:not(:disabled) {
    background-color: var(--astryx-color-surface-hover, #f4f4f5);
  }
  .astryx-carousel-control:focus-visible {
    outline: 2px solid var(--astryx-color-border-focus, #18181b);
    outline-offset: 2px;
  }
  .astryx-carousel-control:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .astryx-carousel-indicators {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--astryx-space-2, 8px);
    margin-top: var(--astryx-space-2-5, 10px);
  }

  .astryx-carousel-dot {
    width: 28px;
    min-height: 24px;
    padding: 8px 0;
    background: transparent;
    border: none;
    cursor: pointer;
    position: relative;
  }
  .astryx-carousel-dot::after {
    content: '';
    display: block;
    width: 100%;
    height: 6px;
    border-radius: var(--astryx-radius-full, 9999px);
    background-color: var(--astryx-color-border-default, #d4d4d8);
  }
  .astryx-carousel-dot.is-active::after {
    background-color: var(--astryx-color-brand, #18181b);
  }
  .astryx-carousel-dot:focus-visible {
    outline: 2px solid var(--astryx-color-border-focus, #18181b);
    outline-offset: 2px;
    border-radius: var(--astryx-radius-full, 9999px);
  }
</style>
