<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { createEventDispatcher } from 'svelte';

  export let dialogHeader: string;
  export let dialogMessage: string;
  export let contentStyles: string = '';
  export let showCancel = true;
  export let confirmLabel: string = 'Confirm';
  export let destructive: boolean = false;
  export let resolver: (arg0: boolean) => void;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  function closeDialog(wasCanceled = false) {
    resolver(wasCanceled);
    dispatch('close');
  }
</script>

<DialogTemplate>
  <svelte:fragment slot="header">{dialogHeader}</svelte:fragment>
  <svelte:fragment slot="content">
    <p class="min-w-0 break-words [overflow-wrap:anywhere]" style={contentStyles}>
      {dialogMessage}
    </p>
  </svelte:fragment>
  <div class="flex min-w-0 grow flex-wrap justify-between gap-2" slot="footer">
    <button class={buttonClasses} class:invisible={!showCancel} on:click={() => closeDialog(true)}>
      Cancel
      <Ripple />
    </button>
    <button
      class={buttonClasses}
      class:astryx-confirm-destructive={destructive}
      on:click={() => closeDialog()}
    >
      {confirmLabel}
      <Ripple />
    </button>
  </div>
</DialogTemplate>

<style>
  .astryx-confirm-destructive {
    background-color: var(--astryx-color-danger, #ef4444);
    border-color: var(--astryx-color-danger, #ef4444);
    color: #ffffff;
  }
  .astryx-confirm-destructive:hover {
    background-color: var(--astryx-color-danger-hover, #dc2626);
    border-color: var(--astryx-color-danger-hover, #dc2626);
    opacity: 1;
  }
</style>
