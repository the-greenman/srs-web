<!--
  UpgradePlan.svelte — the dry-run plan of a package upgrade (srs-web#450), in a Modal.

  Presentation only (ADR-001): the core planned it (upgrade_package_bundle, dryRun) and decides
  conflicts; this lists the counts, each conflict (the local copy is kept) and the core's warnings.
  Apply runs the real upgrade; Cancel closes. `inline` = the styleguide specimen.
-->
<script lang="ts">
  import type { UpgradePackageResult } from "$lib/srs-client.js";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";
  import Notice from "./Notice.svelte";

  interface Props {
    plans: UpgradePackageResult[];
    busy?: boolean;
    error?: string | null;
    onApply: () => void;
    onCancel: () => void;
    inline?: boolean;
    testid?: string;
  }

  const { plans, busy = false, error = null, onApply, onCancel, inline = false, testid = "upgrade-modal" }: Props = $props();

  const title = $derived(
    plans.length === 1
      ? `Upgrade ${plans[0].name} ${plans[0].previousVersion} → ${plans[0].version}`
      : `Upgrade ${plans.length} packages`
  );
  const counts = (p: UpgradePackageResult): [string, number][] => [
    ["added", p.added.length],
    ["new versions", p.newVersions.length],
    ["updated", p.updated.length],
    ["repaired", p.repaired.length],
  ];
</script>

<Modal {title} {testid} {inline} {onCancel}>
  {#each plans as plan (plan.packageId)}
    <section data-testid="upgrade-plan-{plan.name}">
      {#if plans.length > 1}<h3>{plan.name} {plan.previousVersion} → {plan.version}</h3>{/if}
      <ul data-testid="upgrade-counts">
        {#each counts(plan) as [label, n] (label)}<li>{n} {label}</li>{/each}
      </ul>
      {#if plan.conflicts.length}
        <p>Your local edits are kept for these definitions:</p>
        <ul data-testid="upgrade-conflicts">
          {#each plan.conflicts as c (c.id)}<li>{c.name} ({c.conflictKind})</li>{/each}
        </ul>
      {/if}
      {#if plan.removedUpstream.length}
        <p>No longer in the package:</p>
        <ul data-testid="upgrade-removed">
          {#each plan.removedUpstream as r (r.id)}<li>{r.name}</li>{/each}
        </ul>
      {/if}
      {#if plan.dependencyWarnings.length}
        <ul data-testid="upgrade-warnings">
          {#each plan.dependencyWarnings as w (w)}<li>{w}</li>{/each}
        </ul>
      {/if}
    </section>
  {/each}
  {#if error}<Notice kind="error">{error}</Notice>{/if}
  {#snippet actions()}
    <Button size="sm" onclick={onCancel} disabled={busy} data-testid="upgrade-cancel">Cancel</Button>
    <Button size="sm" variant="primary" onclick={onApply} disabled={busy} data-testid="upgrade-apply">{busy ? "Upgrading…" : "Apply"}</Button>
  {/snippet}
</Modal>
