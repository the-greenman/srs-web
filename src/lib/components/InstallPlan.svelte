<!--
  InstallPlan.svelte — what installing a published package adds, in a Modal (srs-web#712). The writer's
  click here is the only thing that installs, whether they asked or a connected agent did. Presentation
  only: the core decided what is met. `inline` = the styleguide specimen.
-->
<script lang="ts">
  import type { PackageInstallPlan } from "$lib/packages/catalog.js";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";
  import Notice from "./Notice.svelte";

  interface Props {
    plan: PackageInstallPlan;
    fromAgent?: boolean;
    error?: string | null;
    onInstall: () => void;
    onCancel: () => void;
    inline?: boolean;
  }

  const { plan, fromAgent = false, error = null, onInstall, onCancel, inline = false }: Props = $props();

  const target = $derived(plan.packages[plan.packages.length - 1]);
  const dependencies = $derived(plan.packages.slice(0, -1));
</script>

<Modal title="Install {target.packageName} {target.packageVersion}" testid="install-modal" {inline} {onCancel}>
  {#if fromAgent}
    <p data-testid="install-from-agent">A connected agent asked for this. Nothing is installed unless you confirm.</p>
  {/if}
  <p>{target.description ?? "No description."} {target.typeCount} types, {target.fieldCount} fields.</p>
  {#if dependencies.length > 0}
    <p>It needs these too, so they will be installed as well:</p>
    <ul data-testid="install-dependencies">
      {#each dependencies as d (d.packageId)}<li>{d.packageName} {d.packageVersion}</li>{/each}
    </ul>
  {/if}
  {#if plan.unmet.length > 0}
    <Notice kind="warning" testid="install-unmet">This document needs {plan.unmet.join(", ")} first. Upgrade it under Document > Packages…, then install this.</Notice>
  {/if}
  {#if error}<Notice kind="error" testid="install-error">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="sm" onclick={onCancel} data-testid="install-cancel">Cancel</Button>
    <Button size="sm" variant="primary" disabled={plan.unmet.length > 0} onclick={onInstall} data-testid="install-apply">Install</Button>
  {/snippet}
</Modal>
