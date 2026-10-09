<!--
  LensPoc — the hidden /lens route (plans/ux-lenses.md §5): a minimal opener for the four surveyed
  corpora (public/poc/<name>.srs, gitignored) or any .srs/.srsj file, then LensShell over the real WASM
  engine. `#repo=<name>` reopens a corpus directly. No scoped style (lens.css).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Button from "$lib/components/Button.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import {
    type SrsRepository,
    initWasm,
    loadRepo,
    loadRepoFromArchive,
    repositoryId,
    resolveRepositoryTitle,
  } from "$lib/srs-client.js";
  import LensShell from "./LensShell.svelte";
  import { type Lens, curatedLenses, deriveLenses } from "./lens.js";

  const corpora = [
    ["spec", "spec"],
    ["musrs", "muSrs"],
    ["programme", "programme"],
    ["site", "semanticops.com"],
  ] as const;

  let ready = $state(false);
  let error = $state<string | null>(null);
  let opened = $state<{ repo: SrsRepository; title: string; curated: Lens[]; extra: Lens[] } | null>(null);

  function open(repo: SrsRepository, fallback: string): void {
    opened = {
      repo,
      title: resolveRepositoryTitle(repo, fallback),
      curated: curatedLenses[repositoryId(repo)] ?? [],
      extra: deriveLenses(repo),
    };
  }

  async function openCorpus(name: string): Promise<void> {
    error = null;
    try {
      const res = await fetch(`/poc/${name}.srs`);
      if (!res.ok) throw new Error(`${name}.srs: ${res.status}`);
      const p = new URLSearchParams(location.hash.slice(1));
      p.set("repo", name);
      history.replaceState(null, "", `#${p}`);
      open(loadRepoFromArchive(new Uint8Array(await res.arrayBuffer())), name);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function openFile(e: Event): Promise<void> {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = null;
    try {
      const repo = file.name.endsWith(".srsj")
        ? loadRepo(await file.text())
        : loadRepoFromArchive(new Uint8Array(await file.arrayBuffer()));
      history.replaceState(null, "", "#");
      open(repo, file.name.replace(/\.srsj?$/, ""));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  onMount(() => {
    initWasm().then(
      () => {
        ready = true;
        const name = new URLSearchParams(location.hash.slice(1)).get("repo");
        if (name && corpora.some(([n]) => n === name)) void openCorpus(name);
      },
      (e) => (error = e instanceof Error ? e.message : String(e))
    );
  });
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
  <title>Lenses</title>
</svelte:head>

{#if opened}
  {#key opened.repo}
    <LensShell repo={opened.repo} title={opened.title} curated={opened.curated} extra={opened.extra} />
  {/key}
{:else}
  <div class="lens-open" data-testid="lens-open">
    <h1>Lenses</h1>
    <p class="lens-empty">A proof of concept: three panes, four layouts, one lens at a time.</p>
    {#if error}<Notice kind="error">{error}</Notice>{/if}
    <div class="lens-open__row">
      {#each corpora as [name, label] (name)}
        <Button disabled={!ready} data-testid="lens-open-{name}" onclick={() => openCorpus(name)}>{label}</Button>
      {/each}
    </div>
    <label class="lens-open__file">
      <span>or open a file</span>
      <input type="file" accept=".srs,.srsj" disabled={!ready} onchange={openFile} />
    </label>
  </div>
{/if}
