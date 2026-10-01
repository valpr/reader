<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Fa from 'svelte-fa';
  import {
    faArrowUpRightFromSquare,
    faChevronLeft,
    faChevronRight,
    faMagnifyingGlassMinus,
    faMagnifyingGlassPlus,
    faRotateLeft,
    faXmark
  } from '@fortawesome/free-solid-svg-icons';
  import { IconButton } from '@custom-ereader/ui';
  import { hideSpoilerImage$, skipKeyDownListener$ } from '$lib/data/store';
  import {
    type ReaderImageGalleryPicture,
    toggleImageGalleryPictureSpoiler$
  } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery';
  import type { ImagePreviewData } from './book-reader-image-preview';

  export let previewData: ImagePreviewData;
  export let allPictures: ReaderImageGalleryPicture[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  let dialogEl: HTMLElement;
  let viewportEl: HTMLElement;
  let imgEl: HTMLImageElement;

  let currentIndex = previewData?.index ?? -1;
  let currentUrl = previewData?.url ?? '';
  let currentAlt = previewData?.alt ?? 'Image preview';

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  let isDragging = false;
  let isPinching = false;
  let wasPinching = false;
  let isWheeling = false;
  let wheelTimeout: ReturnType<typeof setTimeout> | undefined;

  let imageError = false;

  let naturalWidth = 0;
  let naturalHeight = 0;
  let renderedWidth = 0;
  let renderedHeight = 0;

  // Pointer tracking
  const activePointers = new Map<number, { x: number; y: number }>();
  let startX = 0;
  let startY = 0;
  let startTranslateX = 0;
  let startTranslateY = 0;
  let dragDistance = 0;

  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchStartMidX = 0;
  let pinchStartMidY = 0;
  let pinchStartTranslateX = 0;
  let pinchStartTranslateY = 0;

  let lastTapTime = 0;
  let lastPreviewData: ImagePreviewData | null = null;
  let prevSkipKeyDown = false;
  let previouslyFocusedElement: HTMLElement | null = null;

  $: if (previewData && previewData !== lastPreviewData) {
    lastPreviewData = previewData;
    currentUrl = previewData.url;
    currentIndex = previewData.index ?? -1;
    currentAlt = previewData.alt ?? 'Image preview';
    imageError = false;
    resetTransform();
  }

  $: isIndexed = currentIndex >= 0 && currentIndex < allPictures.length;
  $: currentPicture = isIndexed ? allPictures[currentIndex] : undefined;
  $: showSpoiler = $hideSpoilerImage$ && currentPicture && !currentPicture.unspoilered;

  $: hasPrev = isIndexed && currentIndex > 0;
  $: hasNext = isIndexed && currentIndex < allPictures.length - 1;
  $: zoomPercent = Math.round(scale * 100);

  onMount(() => {
    prevSkipKeyDown = $skipKeyDownListener$;
    $skipKeyDownListener$ = true;
    previouslyFocusedElement = document.activeElement as HTMLElement | null;

    updateImageDimensions();

    // Auto-focus dialog for accessibility
    setTimeout(() => {
      dialogEl?.focus();
    }, 50);
  });

  onDestroy(() => {
    $skipKeyDownListener$ = prevSkipKeyDown;
    if (wheelTimeout) {
      clearTimeout(wheelTimeout);
    }
    previouslyFocusedElement?.focus();
  });

  function close() {
    dispatch('close');
  }

  function onImageLoad() {
    imageError = false;
    updateImageDimensions();
    resetTransform();
  }

  function onImageError() {
    imageError = true;
  }

  function updateImageDimensions() {
    if (!imgEl || !viewportEl) return;
    naturalWidth = imgEl.naturalWidth || imgEl.clientWidth || 1;
    naturalHeight = imgEl.naturalHeight || imgEl.clientHeight || 1;

    const vw = viewportEl.clientWidth || window.innerWidth;
    const vh = viewportEl.clientHeight || window.innerHeight;

    const fitRatio = Math.min(vw / naturalWidth, vh / naturalHeight, 1);
    renderedWidth = naturalWidth * fitRatio;
    renderedHeight = naturalHeight * fitRatio;
  }

  function resetTransform() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    isDragging = false;
    isPinching = false;
    wasPinching = false;
  }

  function clampTranslation() {
    if (!viewportEl) return;
    const vw = viewportEl.clientWidth;
    const vh = viewportEl.clientHeight;

    const currentW = renderedWidth * scale;
    const currentH = renderedHeight * scale;

    const maxPanX = Math.max(0, (currentW - vw) / 2);
    const maxPanY = Math.max(0, (currentH - vh) / 2);

    translateX = Math.min(maxPanX, Math.max(-maxPanX, translateX));
    translateY = Math.min(maxPanY, Math.max(-maxPanY, translateY));
  }

  function zoomToPoint(clientX: number, clientY: number, targetScale: number) {
    const newScale = Math.min(8, Math.max(1, targetScale));
    if (!viewportEl) {
      scale = newScale;
      return;
    }

    if (newScale <= 1.01) {
      resetTransform();
      return;
    }

    const rect = viewportEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const focalX = clientX - cx;
    const focalY = clientY - cy;

    const scaleRatio = newScale / scale;
    translateX = focalX - (focalX - translateX) * scaleRatio;
    translateY = focalY - (focalY - translateY) * scaleRatio;
    scale = newScale;
    clampTranslation();
  }

  function zoomToCenter(targetScale: number) {
    if (!viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    zoomToPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, targetScale);
  }

  function handlePointerDown(ev: PointerEvent) {
    if (!viewportEl) return;
    if ((ev.target as HTMLElement)?.closest('button')) {
      return;
    }
    try {
      viewportEl.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (activePointers.size === 1) {
      startX = ev.clientX;
      startY = ev.clientY;
      startTranslateX = translateX;
      startTranslateY = translateY;
      dragDistance = 0;
      isDragging = true;
    } else if (activePointers.size === 2) {
      isPinching = true;
      wasPinching = true;
      isDragging = false;

      const [p1, p2] = Array.from(activePointers.values());
      pinchStartDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartMidX = (p1.x + p2.x) / 2;
      pinchStartMidY = (p1.y + p2.y) / 2;
      pinchStartScale = scale;
      pinchStartTranslateX = translateX;
      pinchStartTranslateY = translateY;
    }
  }

  function handlePointerMove(ev: PointerEvent) {
    if (!activePointers.has(ev.pointerId)) return;
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (isPinching && activePointers.size >= 2) {
      const [p1, p2] = Array.from(activePointers.values());
      const currDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const currMidX = (p1.x + p2.x) / 2;
      const currMidY = (p1.y + p2.y) / 2;

      if (pinchStartDist > 0) {
        const rawScale = pinchStartScale * (currDist / pinchStartDist);
        const newScale = Math.min(8, Math.max(0.8, rawScale));

        const rect = viewportEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const focalX = pinchStartMidX - cx;
        const focalY = pinchStartMidY - cy;
        const deltaMidX = currMidX - pinchStartMidX;
        const deltaMidY = currMidY - pinchStartMidY;

        const scaleRatio = newScale / pinchStartScale;
        scale = newScale;
        translateX = pinchStartTranslateX * scaleRatio + deltaMidX + focalX * (1 - scaleRatio);
        translateY = pinchStartTranslateY * scaleRatio + deltaMidY + focalY * (1 - scaleRatio);

        if (scale > 1) {
          clampTranslation();
        }
      }
    } else if (isDragging && activePointers.size === 1) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      dragDistance = Math.hypot(dx, dy);

      if (scale > 1.05) {
        translateX = startTranslateX + dx;
        translateY = startTranslateY + dy;
        clampTranslation();
      } else {
        // Elastic pull-down when at 1x
        if (dy > 0) {
          translateY = dy * 0.7;
        }
      }
    }
  }

  function handlePointerUp(ev: PointerEvent) {
    try {
      viewportEl?.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }

    activePointers.delete(ev.pointerId);

    if (activePointers.size === 1) {
      // Re-anchor drag coordinates to remaining pointer so panning doesn't lock
      isPinching = false;
      const remaining = Array.from(activePointers.values())[0];
      startX = remaining.x;
      startY = remaining.y;
      startTranslateX = translateX;
      startTranslateY = translateY;
      dragDistance = 0;
      isDragging = true;
    } else if (activePointers.size === 0) {
      const didPinch = wasPinching;
      wasPinching = false;
      isPinching = false;
      isDragging = false;

      // Check pull-down dismiss
      if (scale <= 1.05 && translateY > 100 && Math.abs(translateX) < 80) {
        close();
        return;
      }

      // Snap back if scale was pinched < 1
      if (scale < 1) {
        resetTransform();
      } else if (scale > 1) {
        clampTranslation();
      } else {
        translateY = 0;
        translateX = 0;
      }

      // Tap / double-tap detection only if not coming from a pinch gesture
      if (!didPinch && dragDistance < 10) {
        const now = Date.now();
        if (now - lastTapTime < 300) {
          // Double-tap
          lastTapTime = 0;
          if (scale > 1.2) {
            resetTransform();
          } else {
            zoomToPoint(ev.clientX, ev.clientY, 2.5);
          }
        } else {
          lastTapTime = now;
        }
      }
    }
  }

  function handlePointerCancel(ev: PointerEvent) {
    handlePointerUp(ev);
  }

  function handleWheel(ev: WheelEvent) {
    ev.preventDefault();
    isWheeling = true;
    if (wheelTimeout) {
      clearTimeout(wheelTimeout);
    }
    wheelTimeout = setTimeout(() => {
      isWheeling = false;
    }, 150);

    const factor = ev.deltaY < 0 ? 1.25 : 0.8;
    zoomToPoint(ev.clientX, ev.clientY, scale * factor);
  }

  function handleKeyDown(ev: KeyboardEvent) {
    // Focus trap
    if (ev.key === 'Tab' && dialogEl) {
      const focusable = dialogEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
          return;
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
          return;
        }
      }
    }

    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      close();
    } else if (ev.key === '+' || ev.key === '=') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      zoomToCenter(scale * 1.25);
    } else if (ev.key === '-' || ev.key === '_') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      zoomToCenter(scale / 1.25);
    } else if (ev.key === '0') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      resetTransform();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (scale > 1.05) {
        translateX -= 60;
        clampTranslation();
      } else {
        nextImage();
      }
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (scale > 1.05) {
        translateX += 60;
        clampTranslation();
      } else {
        previousImage();
      }
    } else if (ev.key === 'ArrowUp') {
      if (scale > 1.05) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        translateY += 60;
        clampTranslation();
      }
    } else if (ev.key === 'ArrowDown') {
      if (scale > 1.05) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        translateY -= 60;
        clampTranslation();
      }
    }
  }

  function nextImage() {
    if (hasNext) {
      currentIndex++;
      currentUrl = allPictures[currentIndex].url;
      currentAlt = '';
      imageError = false;
      resetTransform();
    }
  }

  function previousImage() {
    if (hasPrev) {
      currentIndex--;
      currentUrl = allPictures[currentIndex].url;
      currentAlt = '';
      imageError = false;
      resetTransform();
    }
  }

  function openInNewTab() {
    if (currentUrl) {
      window.open(currentUrl, '_blank');
    }
  }

  function revealSpoiler() {
    if (currentPicture) {
      currentPicture.unspoilered = true;
      toggleImageGalleryPictureSpoiler$.next({ url: currentUrl, unspoilered: true });
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} on:resize={updateImageDimensions} />

<div
  bind:this={dialogEl}
  tabindex="-1"
  class="fixed inset-0 z-[70] flex flex-col w-full max-w-full overflow-hidden bg-black/92 text-white select-none writing-horizontal-tb outline-none"
  style="touch-action: none; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px);"
  role="dialog"
  aria-modal="true"
  aria-label="Image preview"
  transition:fade={{ duration: 200 }}
>
  <!-- Top bar -->
  <header
    class="flex items-center justify-between w-full max-w-full px-2 sm:px-3 py-2 bg-black/40 backdrop-blur-sm z-20 gap-1 sm:gap-2 shrink-0"
  >
    <div class="flex items-center gap-2 min-w-0 shrink">
      {#if isIndexed && allPictures.length > 1}
        <span class="text-sm font-medium text-neutral-300 whitespace-nowrap">
          {currentIndex + 1} / {allPictures.length}
        </span>
      {/if}
      <span
        class="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 whitespace-nowrap"
        title="Current Zoom"
        role="status"
        aria-live="polite"
      >
        {zoomPercent}%
      </span>
    </div>

    <div class="flex items-center gap-0.5 sm:gap-1 shrink-0">
      <IconButton
        label="Open image in new tab"
        size="lg"
        class="h-11 w-11 shrink-0 text-neutral-200 hover:text-white"
        on:click={openInNewTab}
      >
        <Fa icon={faArrowUpRightFromSquare} />
      </IconButton>

      <IconButton
        label="Zoom out"
        size="lg"
        disabled={scale <= 1}
        class="h-11 w-11 shrink-0 text-neutral-200 hover:text-white"
        on:click={() => zoomToCenter(scale / 1.35)}
      >
        <Fa icon={faMagnifyingGlassMinus} />
      </IconButton>

      {#if scale > 1.05}
        <IconButton
          label="Reset zoom"
          size="lg"
          class="h-11 w-11 shrink-0 text-neutral-200 hover:text-white"
          on:click={resetTransform}
        >
          <Fa icon={faRotateLeft} />
        </IconButton>
      {/if}

      <IconButton
        label="Zoom in"
        size="lg"
        disabled={scale >= 8}
        class="h-11 w-11 shrink-0 text-neutral-200 hover:text-white"
        on:click={() => zoomToCenter(scale * 1.35)}
      >
        <Fa icon={faMagnifyingGlassPlus} />
      </IconButton>

      <IconButton
        label="Close image preview"
        size="lg"
        class="h-11 w-11 shrink-0 text-neutral-200 hover:text-white hover:bg-neutral-800/80"
        on:click={close}
      >
        <Fa icon={faXmark} />
      </IconButton>
    </div>
  </header>

  <!-- Viewport -->
  <main
    class="flex-1 relative flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
    bind:this={viewportEl}
    on:pointerdown={handlePointerDown}
    on:pointermove={handlePointerMove}
    on:pointerup={handlePointerUp}
    on:pointercancel={handlePointerCancel}
    on:wheel|nonpassive={handleWheel}
  >
    <div
      class="relative flex items-center justify-center max-w-full max-h-full will-change-transform"
      style="transform: translate3d({translateX}px, {translateY}px, 0) scale({scale}); {isDragging ||
      isPinching ||
      isWheeling
        ? 'transition: none;'
        : 'transition: transform 200ms ease-out;'}"
    >
      {#if imageError}
        <div class="flex flex-col items-center justify-center p-6 text-center text-neutral-400">
          <p class="text-base font-medium">画像を読み込めませんでした</p>
          <p class="text-xs text-neutral-500 mt-1">Unable to load image preview</p>
        </div>
      {:else}
        <img
          bind:this={imgEl}
          src={currentUrl}
          alt={currentAlt}
          class="max-w-[100vw] max-h-[calc(100vh-5rem)] max-h-[calc(100dvh-5rem)] object-contain select-none pointer-events-none"
          class:blur-2xl={showSpoiler}
          draggable="false"
          on:load={onImageLoad}
          on:error={onImageError}
        />
      {/if}

      {#if showSpoiler && !imageError}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-auto">
          <button
            type="button"
            class="min-h-[44px] min-w-[44px] px-5 py-2.5 bg-black/75 hover:bg-black/90 text-white font-bold rounded-full text-sm backdrop-blur-sm cursor-pointer border border-white/20 transition-transform active:scale-95 flex items-center justify-center"
            on:click|stopPropagation={revealSpoiler}
          >
            ネタバレ (Show Image)
          </button>
        </div>
      {/if}
    </div>

    <!-- Navigation chevrons -->
    {#if hasPrev}
      <button
        type="button"
        aria-label="Previous image"
        title="Previous Image"
        class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center h-12 w-12 rounded-full bg-black/50 hover:bg-black/80 text-white text-xl transition-opacity pointer-events-auto opacity-70 hover:opacity-100 cursor-pointer"
        on:pointerdown|stopPropagation
        on:pointerup|stopPropagation
        on:click|stopPropagation={previousImage}
      >
        <Fa icon={faChevronLeft} />
      </button>
    {/if}

    {#if hasNext}
      <button
        type="button"
        aria-label="Next image"
        title="Next Image"
        class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center h-12 w-12 rounded-full bg-black/50 hover:bg-black/80 text-white text-xl transition-opacity pointer-events-auto opacity-70 hover:opacity-100 cursor-pointer"
        on:pointerdown|stopPropagation
        on:pointerup|stopPropagation
        on:click|stopPropagation={nextImage}
      >
        <Fa icon={faChevronRight} />
      </button>
    {/if}
  </main>
</div>
