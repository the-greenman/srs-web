<!--
  UpgradePlan.svelte — the dry-run plan of a package upgrade (srs-web#450), in a Modal.

  Presentation only (ADR-001): the core planned it (upgrade_package_bundle, dryRun) and decides
  conflicts; this lists the counts, the definitions an earlier bundle proved unmodified, and each
  conflict. A definition nothing can prove (`no-reference-copy`) has an opt-in checkbox (default off,
  `adopt` is the checked ids); a local edit or key collision is kept and only explained.
  Apply runs the real upgrade; Cancel closes. `inline` = the styleguide specimen.
-->
<script lang="ts">
  import type { UpgradePackageResult } from "$lib/srs-client.js";
  import { isAdoptable, keptReason } from "$lib/upgrade-plan.js";
  import Button from "./Button.svelte";
  import Checkbox from "./Checkbox.svelte";
  import Modal from "./Modal.svelte";
  import Notice from "./Notice.svelte";

  interface Props {
    plans: UpgradePackageResult[];
    /** Ids of the unproven definitions the user agreed to replace. */
    adopt?: string[];
    busy?: boolean;
    error?: string | null;
    onApply: () => void;
    onCancel: () => void;
    inline?: boolean;
    testid?: string;
  }

  let { plans, adopt = $bindable([]), busy = false, error = null, onApply, onCancel, inline = false, testid = "upgrade-modal" }: Props = $props();

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
    ["unchanged", p.unchanged.length],
  ];
</script>

<Modal {title} {testid} {inline} {onCancel}>
  {#each plans as plan (plan.packageId)}
    <section data-testid="upgrade-plan-{plan.name}">
      {#if plans.length > 1}<h3>{plan.name} {plan.previousVersion} → {plan.version}</h3>{/if}
      <ul data-testid="upgrade-counts">
        {#each counts(plan) as [label, n] (label)}<li>{n} {label}</li>{/each}
      </ul>
      {#if plan.updated.some((u) => u.provenBy)}
        <p>Updated definitions are unchanged from the published version they came from:</p>
        <ul data-testid="upgrade-verified">
          {#each plan.updated.filter((u) => u.provenBy) as u (`${u.kind}:${u.id}@${u.version}`)}<li>{u.name} (verified against {u.provenBy})</li>{/each}
        </ul>
      {/if}
      {#if plan.conflicts.some(isAdoptable)}
        <p>These cannot be verified as unchanged, so they are kept unless you choose to replace them:</p>
        <ul data-testid="upgrade-unproven">
          {#each plan.conflicts.filter(isAdoptable) as c (`${c.kind}:${c.id}@${c.version}`)}
            <li>
              <Checkbox bind:group={adopt} value={c.id} disabled={busy} data-testid="upgrade-adopt-{c.name}">
                {c.name}: Replace with the published definition (any local change to it is lost)
              </Checkbox>
            </li>
          {/each}
        </ul>
      {/if}
      {#if plan.conflicts.some((c) => !isAdoptable(c))}
        <p>Kept as they are:</p>
        <ul data-testid="upgrade-conflicts">
          {#each plan.conflicts.filter((c) => !isAdoptable(c)) as c (`${c.kind}:${c.id}@${c.version}`)}<li>{c.name}: {keptReason(c)}</li>{/each}
        </ul>
      {/if}
      {#if plan.removedUpstream.length}
        <p>No longer in the package:</p>
        <ul data-testid="upgrade-removed">
          {#each plan.removedUpstream as r (`${r.kind}:${r.id}@${r.version}`)}<li>{r.name}</li>{/each}
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
