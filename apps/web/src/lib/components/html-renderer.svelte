<script lang="ts">
  import { afterUpdate, createEventDispatcher } from 'svelte';

  export let html: string;

  const dispatch = createEventDispatcher<{
    load: void;
  }>();

  let prevHtml: string | undefined;

  afterUpdate(() => {
    if (html !== prevHtml) {
      prevHtml = html;
      dispatch('load');
    }
  });
</script>

{@html html}
