<script lang="ts">
  import {
    getExpiredSyncTargets,
    storageConnectionStates$
  } from '$lib/data/storage/storage-oauth-manager';
  import { pendingCloudSync$, syncTarget$, transientNotice$ } from '$lib/data/store';
  import { getFriendlyStorageSourceName } from '$lib/data/storage/storage-types';
  import { onDestroy } from 'svelte';

  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let lastSeenNoticeId = 0;

  $: states = $storageConnectionStates$;
  $: pending = $pendingCloudSync$;
  // Primary-only: global announcements never fire for a secondary cloud.
  // Secondary sessions surface in Settings per-source status and reconnect
  // on demand when one of their books is opened.
  $: expiredSource = getExpiredSyncTargets($syncTarget$, states, pending)[0] || '';

  // Note: "Sync complete" is announced directly from the triggerCloudSync
  // promise (reconnect flow / manual Sync button — the only callers) via
  // pushTransientNotice. Background syncs (autosave replication, silent
  // token-refresh retries, session restore) never push, so they stay silent.

  onDestroy(() => {
    if (noticeTimer) clearTimeout(noticeTimer);
  });

  // Transient notices (offline skips, other non-blocking info): each push
  // re-renders the pill and restarts the auto-dismiss timer.
  $: notice = $transientNotice$;
  $: {
    if (notice && notice.id !== lastSeenNoticeId) {
      lastSeenNoticeId = notice.id;
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        lastSeenNoticeId = 0;
        transientNotice$.next(null);
      }, 5000);
    }
  }
</script>

<!--
  Always mounted outside the router outlet so assistive technology announces
  sync status transitions. Visible banners live in page flows (manage banner,
  settings card, reader icon) to respect fixed headers and reader immersion.
-->
<div role="status" aria-live="polite" class="sr-only">
  {#if expiredSource}
    Sync paused. Session expired for {getFriendlyStorageSourceName(expiredSource)}.
  {/if}
</div>

{#if notice}
  <div
    data-testid="cloud-notice-toast"
    role="status"
    class="writing-horizontal-tb fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-lg"
    style="background-color: var(--astryx-color-fg-primary, #18181b); color: var(--astryx-color-surface, #ffffff);"
  >
    {notice.message}
  </div>
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
