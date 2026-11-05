<!--
  PackagesDialog.svelte — Document > Packages… (srs-web#450, #712): the packages installed in this
  document, installed version against the published one, with Upgrade for an outdated one, and the
  published packages it doesn't have, with Install. Presentation only: the core decided all of it
  (check_package_requirements). Upgrade and Install open a plan; nothing is written here. `inline` =
  the styleguide specimen.
-->
<script lang="ts">
  import type { InstalledPackage } from "$lib/package-upgrade.js";
  import type { CatalogEntry } from "$lib/packages/catalog.js";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";

  interface Props {
    packages: InstalledPackage[];
    /** Published packages this document doesn't have. */
    available?: CatalogEntry[];
    busy?: boolean;
    onUpgrade: (packageId: string) => void;
    onInstall?: (packageId: string) => void;
    onClose: () => void;
    inline?: boolean;
  }

  const { packages, available = [], busy = false, onUpgrade, onInstall, onClose, inline = false }: Props = $props();
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
          {#if p.outdated && p.upgradable}
            <Button size="sm" variant="primary" disabled={busy} onclick={() => onUpgrade(p.packageId)} data-testid="package-upgrade-{p.name}">Upgrade</Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if available.length > 0}
    <h3>Published packages</h3>
    <ul class="packages" data-testid="packages-available">
      {#each available as p (p.packageId)}
        <li data-testid="package-available-{p.packageName}">
          <strong>{p.packageName}</strong>
          {p.packageVersion}: {p.description ?? "No description."} {p.typeCount} types.
          <Button size="sm" disabled={busy} onclick={() => onInstall?.(p.packageId)} data-testid="package-install-{p.packageName}">Install</Button>
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
