<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import DomainHint from '$lib/components/domain-hint.svelte';
  import CloudSyncStatus from '$lib/components/cloud/cloud-sync-status.svelte';
  import { basePath, clearConsoleOnReload } from '$lib/data/env';
  import { dialogManager, type Dialog } from '$lib/data/dialog-manager';
  import { userFontsCacheName, type UserFont } from '$lib/data/fonts';
  import { appThemeMode$, fontFamilyGroupOne$, isOnline$, userFonts$ } from '$lib/data/store';
  import { restoreCloudSessions } from '$lib/data/storage/storage-oauth-manager';
  import {
    startProactiveRefresh,
    stopProactiveRefresh
  } from '$lib/data/storage/token-refresh-scheduler';
  import { applyAppTheme } from '$lib/functions/app-theme';
  import { dummyFn, isMobile, isMobile$ } from '$lib/functions/utils';
  import { MetaTags } from 'svelte-meta-tags';
  import '../app.css';

  let path = '';
  let dialogs: Dialog[] = [];
  let clickOnCloseDisabled = false;
  let zIndex = '';

  $: if (browser) {
    isMobile$.next(isMobile(window));
    addUserFonts($userFonts$);
    applyAppTheme($appThemeMode$);
  }

  onMount(() => {
    const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => applyAppTheme($appThemeMode$);

    systemDarkMode.addEventListener('change', handleSystemThemeChange);
    return () => systemDarkMode.removeEventListener('change', handleSystemThemeChange);
  });

  if (clearConsoleOnReload && import.meta.hot) {
    // eslint-disable-next-line no-console
    import.meta.hot.on('vite:beforeUpdate', () => console.clear());
  }

  function addUserFonts(userFonts: UserFont[]) {
    let styleContent = '';

    for (let index = 0, { length } = userFonts; index < length; index += 1) {
      const userFont = userFonts[index];
      const ext = userFont.fileName.split('.').pop() || '';

      let format = '';

      switch (ext) {
        case 'otf':
          format = 'opentype';
          break;
        case 'ttf':
          format = 'truetype';
          break;
        default:
          format = ext;
          break;
      }

      styleContent += `@font-face{font-family: '${userFont.name}';font-style: normal;font-weight: 400;font-display: swap;src: local(''), url('${userFont.path}') format('${format}')}\n`;
    }

    let styleElement = document.getElementById(userFontsCacheName);

    if (!styleContent) {
      styleElement?.remove();
      return;
    }

    const textNode = document.createTextNode(styleContent);

    if (styleElement) {
      styleElement.replaceChild(textNode, styleElement.childNodes[0]);
    } else {
      styleElement = document.createElement('style');
      styleElement.id = userFontsCacheName;

      styleElement.appendChild(textNode);
      document.head.append(styleElement);
    }
  }

  function closeAllDialogs() {
    dialogManager.dialogs$.next([]);
    clickOnCloseDisabled = false;
    zIndex = '';
  }

  dialogManager.dialogs$.subscribe((d) => {
    clickOnCloseDisabled = d[0]?.disableCloseOnClick ?? false;
    zIndex = d[0]?.zIndex ?? '';
    dialogs = d;
  });

  onMount(() => {
    if (!browser) {
      return;
    }

    startProactiveRefresh();

    // Session state is in-memory, so after a refresh we silently re-validate
    // each persisted cloud source using its stored refresh token. Skipped
    // while offline; retried once the browser reports connectivity again.
    const handleOnline = () => void restoreCloudSessions();
    if (isOnline$.getValue()) {
      handleOnline();
    }
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  });

  onDestroy(() => {
    stopProactiveRefresh();
  });

  page.subscribe((p) => (path = p.url.pathname));
</script>

<svelte:window bind:online={$isOnline$} />

<MetaTags
  title="Valpr Reader"
  description="Online e-book reader that supports dictionary extensions like Yomitan"
  canonical="{basePath}{path !== '/' ? path : ''}"
  openGraph={{
    type: 'website',
    images: [
      {
        url: `${basePath}/icons/regular-icon@512x512.png`,
        width: 512,
        height: 512
      }
    ]
  }}
/>

<slot />

<CloudSyncStatus />

{#if dialogs.length > 0}
  <div class="writing-horizontal-tb fixed inset-0 z-50 h-full w-full" style:z-index={zIndex}>
    <div
      tabindex="0"
      role="button"
      class="tap-highlight-transparent absolute inset-0 backdrop-blur-[2px] transition-opacity"
      style="background-color: var(--astryx-color-overlay, rgba(0, 0, 0, 0.4));"
      on:click={() => {
        if (!clickOnCloseDisabled) {
          closeAllDialogs();
        }
      }}
      on:keyup={dummyFn}
    ></div>

    <div
      class="relative top-1/2 left-1/2 inline-block w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] max-h-[90vh] max-h-[90dvh] overflow-y-auto p-4 sm:w-auto sm:max-w-[80vw] -translate-x-1/2 -translate-y-1/2"
    >
      {#each dialogs as dialog}
        {#if typeof dialog.component === 'string'}
          {@html dialog.component}
        {:else}
          <svelte:component this={dialog.component} {...dialog.props} on:close={closeAllDialogs} />
        {/if}
      {/each}
    </div>
  </div>
{/if}

<span style={`font-family: ${$fontFamilyGroupOne$ || 'Noto Serif JP'}`}></span>

<DomainHint />
