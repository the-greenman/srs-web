<script lang="ts">
/**
 * The site editor shell (ADR-029, srs-web#680). Phase 1: a placeholder that opens; the canvas,
 * inspector, drafts and Bin come in Phase 4.
 */
import AppShell from "$lib/components/AppShell.svelte";
import type { EditorShellProps } from "$lib/editors/registry.js";

let { repoName, documentTitle }: EditorShellProps = $props();
</script>

<AppShell>
  {#snippet main()}
    <p data-testid="site-shell">{documentTitle ?? repoName}</p>
  {/snippet}
</AppShell>
