<script lang="ts">
  import { page } from '$app/stores';
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { issuesUrl } from '$lib/data/env';
  import { pushTransientNotice } from '$lib/data/store';
  import {
    buildDiagnosticsReport,
    buildIssuePrefill,
    buildNewIssueUrl,
    copyTextToClipboard
  } from '$lib/functions/diagnostics/diagnostics-report';

  export let title = 'Error';

  export let message: string;

  $: routeId = $page?.route?.id ?? $page?.url?.pathname ?? '';
  $: report = buildDiagnosticsReport({ routeId });
  $: fullJson = JSON.stringify(report, null, 2);
  $: encodedLog = encodeURIComponent(fullJson);
  $: downloadableLog = `data:text/json;charset=utf-8,${encodedLog}`;
  $: prefill = buildIssuePrefill(report);
  $: newIssueUrl = buildNewIssueUrl(issuesUrl, prefill.title, prefill.body);

  async function copyReportAndOpenIssue() {
    await copyTextToClipboard(fullJson);
    pushTransientNotice('Report copied — paste it in the issue');
    window.open(newIssueUrl, '_blank', 'noopener');
  }
</script>

<DialogTemplate data-testid="log-report-dialog">
  <svelte:fragment slot="header">{title}</svelte:fragment>
  <svelte:fragment slot="content">
    <p class="min-w-0 break-words [overflow-wrap:anywhere]">{message}</p>
  </svelte:fragment>
  <svelte:fragment slot="footer">
    <button
      type="button"
      data-testid="copy-report-issue"
      class="{buttonClasses} min-h-[44px] w-full sm:w-auto"
      on:click={copyReportAndOpenIssue}
    >
      Copy Report & Report Issue
      <Ripple />
    </button>
    <a
      class="{buttonClasses} min-h-[44px] w-full text-center leading-[44px] sm:w-auto"
      href={downloadableLog}
      download="log.json"
      data-testid="download-report"
    >
      Download Report
      <Ripple />
    </a>
  </svelte:fragment>
</DialogTemplate>
