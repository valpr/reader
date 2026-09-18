<script lang="ts">
  import Fa from 'svelte-fa';
  import { faSpinner } from '@fortawesome/free-solid-svg-icons';
</script>

<div
  class="flex items-center justify-center text-7xl"
  role="status"
  aria-label="Loading book"
  data-testid="book-loading-overlay"
>
  <Fa icon={faSpinner} spin />
</div>
