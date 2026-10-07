<!--
  PackagesDialog.svelte — Document > Packages… (srs-web#450): the bundled packages installed in this
  document, installed version against bundled, with Upgrade for an outdated one. Presentation only: the
  core decided which are outdated (check_package_requirements). Upgrade opens the plan (UpgradePlan);
  nothing is written here. `inline` = the styleguide specimen.
-->
<script lang="ts">
  import type { InstalledPackage } from "$lib/package-upgrade.js";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";

  interface Props {
    packages: InstalledPackage[];
    busy?: boolean;
    onUpgrade: (packageId: string) => void;
    onClose: () => void;
    inline?: boolean;
  }

  const { packages, busy = false, onUpgrade, onClose, inline = false }: Props = $props();
</script>

<Modal title="Packages" testid="packages-modal" {inline} onCancel={onClose}>
  {#if packages.length === 0}
    <p data-testid="packages-empty">No bundled packages are installed in this document.</p>
  {:else}
    <ul class="packages" data-testid="packages-list">
      {#each packages as p (p.packageId)}
        <li data-testid="package-row-{p.name}">
          <strong>{p.name}</strong>
          installed {p.installed}{p.outdated ? `, ${p.bundled} is available` : ", up to date"}
          {#if p.outdated}
            <Button size="sm" variant="primary" disabled={busy} onclick={() => onUpgrade(p.packageId)} data-testid="package-upgrade-{p.name}">Upgrade</Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#snippet actions()}
    <Button size="sm" onclick={onClose} data-testid="packages-close">Close</Button>
  {/snippet}
</Modal>

<style>
  .packages {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: var(--space-sm);
  }
</style>
