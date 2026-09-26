<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import ProfileChoiceModal from '$lib/components/profile-choice-modal.svelte';
  import { pagePath } from '$lib/data/env';
  import { logger } from '$lib/data/logger';
  import {
    applyProfileById,
    detectSuggestedProfileId,
    isFirstTimeProfileUser,
    markProfileChoiceSeen,
    type SuggestedProfileId
  } from '$lib/data/profiles/profile-manager';
  import { database } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { observe } from '$lib/functions/rxjs/use-observable';
  import { isMobile } from '$lib/functions/utils';
  import { catchError, map, of, tap } from 'rxjs';
  import { onMount } from 'svelte';

  const targetManage = `${pagePath}/manage`;

  // First-run profile choice lives ONLY on this landing route so the book
  // library manage screen (and every spec that loads it directly) never mounts
  // it. Desktop/laptop visitors never see it (detectSuggestedProfileId null).
  let showProfileChoice = false;
  let preselectedProfileId: SuggestedProfileId = 'default-mobile';
  let choicePending = false;
  let pendingTarget: string | null = null;

  if (browser && isFirstTimeProfileUser()) {
    const minDim = window.screen ? Math.min(window.screen.width, window.screen.height) : undefined;
    const suggested = detectSuggestedProfileId(window.navigator.userAgent || '', isMobile(window), {
      maxTouchPoints: window.navigator.maxTouchPoints || 0,
      minScreenDimension: minDim
    });
    if (suggested) {
      preselectedProfileId = suggested;
      // Set before the autoNavigate$ subscription below can emit, so the
      // redirect below waits for the user's choice.
      choicePending = true;
      showProfileChoice = true;
    }
  }

  const autoNavigate$ = database.lastItem$.pipe(
    map((lastItem) => (lastItem ? `${pagePath}/b?id=${lastItem.dataId}` : targetManage)),
    catchError((err) => {
      logger.error('Error loading last item, navigating to manage:', err);
      return of(targetManage);
    }),
    tap((target) => {
      pendingTarget = target;
      if (!choicePending) {
        goto(target);
      }
    })
  );

  function resolveChoice(selectedId: SuggestedProfileId | null) {
    if (selectedId) {
      applyProfileById(selectedId);
    }
    markProfileChoiceSeen();
    choicePending = false;
    showProfileChoice = false;
    goto(pendingTarget ?? targetManage);
  }

  onMount(() => {
    // Safety fallback: if autoNavigate$ does not trigger within 1.5s, navigate to manage
    const timer = setTimeout(() => {
      if (!choicePending) {
        goto(targetManage);
      }
    }, 1500);

    return () => clearTimeout(timer);
  });
</script>

<svelte:head>
  <title>Valpr Reader</title>
</svelte:head>

<div
  use:observe={autoNavigate$}
  class="flex min-h-screen w-screen flex-col items-center justify-center p-6 text-center"
>
  <div class="max-w-md space-y-4">
    <div
      class="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--astryx-color-primary-subtle,rgba(99,102,241,0.12))] text-[var(--astryx-color-primary,#6366f1)] mb-2 shadow-sm"
    >
      <svg class="h-8 w-8 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"
        />
      </svg>
    </div>
    <h1
      class="text-3xl font-bold tracking-tight text-[var(--astryx-color-fg-primary,#18181b)] sm:text-4xl"
    >
      Valpr Reader
    </h1>
    <p class="text-sm text-[var(--astryx-color-fg-muted,#71717a)]">
      A browser-based e-book reader optimized for Japanese text, popup dictionaries, and offline
      reading.
    </p>
    <div
      class="flex items-center justify-center gap-2 pt-2 text-xs text-[var(--astryx-color-fg-muted,#71717a)]"
    >
      <span
        class="inline-block h-2 w-2 animate-ping rounded-full bg-[var(--astryx-color-primary,#6366f1)]"
      ></span>
      <span>Opening reader...</span>
    </div>
    <div class="pt-4">
      <a
        href={targetManage}
        class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-[var(--astryx-color-primary,#6366f1)] hover:bg-[var(--astryx-color-surface-hover,#f4f4f5)] transition-colors"
      >
        Go to Book Manager &rarr;
      </a>
    </div>
  </div>

  <footer
    class="mt-12 flex flex-wrap items-center justify-center gap-4 text-xs text-[var(--astryx-color-fg-muted,#71717a)]"
  >
    <a
      href="{pagePath}/docs/"
      target="_blank"
      rel="noreferrer external"
      class="underline hover:text-[var(--astryx-color-fg-primary,#18181b)] transition-colors"
    >
      Documentation
    </a>
    <span>&bull;</span>
    <a
      href="{pagePath}/privacy"
      class="underline hover:text-[var(--astryx-color-fg-primary,#18181b)] transition-colors"
    >
      Privacy Policy
    </a>
    <span>&bull;</span>
    <a
      href="{pagePath}/terms"
      class="underline hover:text-[var(--astryx-color-fg-primary,#18181b)] transition-colors"
    >
      Terms of Service
    </a>
    <span>&bull;</span>
    <a
      href="https://github.com/valpr/reader"
      target="_blank"
      rel="noopener noreferrer"
      class="hover:text-[var(--astryx-color-fg-primary,#18181b)] transition-colors"
    >
      GitHub
    </a>
  </footer>
</div>

<ProfileChoiceModal
  bind:open={showProfileChoice}
  preselectedId={preselectedProfileId}
  on:confirm={(e) => resolveChoice(e.detail)}
  on:close={() => resolveChoice(null)}
/>
