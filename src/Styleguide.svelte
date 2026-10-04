<!--
  Styleguide — hidden live specimen page (/styleguide, srs-web#420, ADR-019). Mounts the REAL
  components with fixture props (src/styleguide/fixtures.ts); no SRS semantics (ADR-001).
  The theme switcher sets data-theme on <html>; demo.css is imported here only.
-->
<script lang="ts">
  import "./styles/themes/demo.css";
  import { onMount, type Snippet } from "svelte";
  import {
    ActorChip, AgentFeed, AttachmentGlyph, Block, BlockStack, Button,
    CommentBadge, CommentThread, IconButton, DraftTray, EyeToggle, Field, HoverCard, InlineText, Input,
    LayersPanel, McpConnection, ParagraphMargin, PinnedPane, Select, Tag,
    TagChip, Textarea,
  } from "$lib/components";
  import ActionMenu from "$lib/components/ActionMenu.svelte";
  import BinTray from "$lib/components/BinTray.svelte";
  import MarkdownHelp from "$lib/components/MarkdownHelp.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import MarkdownText from "$lib/components/MarkdownText.svelte";
  import Icons from "./styleguide/icons";
  import { initWasm } from "$lib/srs-client";
  import * as fx from "./styleguide/fixtures";

  const noop = () => {};
  const KEY = "srs-web.styleguide.theme";
  const sections = [
    ["tokens", "Tokens"],
    ["buttons", "Buttons and icons"],
    ["icons", "Icons"],
    ["menus", "Menus and popovers"],
    ["chips", "Chips and badges"],
    ["actors", "Actors"],
    ["annotations", "Annotations and comments"],
    ["paragraph", "Paragraph"],
    ["panels", "Panels and trays"],
    ["forms", "Form controls"],
  ];

  let theme = $state("Default");
  let wasm = $state<"loading" | "ready" | string>("loading");
  let swatchValues = $state<Record<string, string>>({});
  let text = $state("Editable text");
  let input = $state("Hello");
  let choice = $state("one");
  let area = $state("Some\nlines");
  let pressed = $state(false);

  function apply(t: string) {
    const root = document.documentElement;
    if (t === "Demo") root.dataset.theme = "demo";
    else delete root.dataset.theme;
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    // Re-read after the cascade settles so swatches follow the theme.
    requestAnimationFrame(readTokens);
  }
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    swatchValues = Object.fromEntries(
      [...fx.swatches, ...fx.sizes, ...fx.spaces].map((n) => [n, cs.getPropertyValue(n).trim()])
    );
  }

  onMount(() => {
    try {
      theme = localStorage.getItem(KEY) === "Demo" ? "Demo" : "Default";
    } catch {}
    apply(theme);
    initWasm().then(
      () => (wasm = "ready"),
      (e) => (wasm = e instanceof Error ? e.message : String(e))
    );
    return () => delete document.documentElement.dataset.theme;
  });
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
  <title>Styleguide</title>
</svelte:head>

{#snippet gated(content: Snippet)}
  {#if wasm === "ready"}
    {@render content()}
  {:else if wasm === "loading"}
    <p>Loading…</p>
  {:else}
    <p role="alert">Markdown unavailable: {wasm}</p>
  {/if}
{/snippet}

{#snippet md(value: string, label: string)}
  {#snippet inner()}<MarkdownText {value} base="block" {label} oncommit={noop} />{/snippet}
  {@render gated(inner)}
{/snippet}

<main class="sg">
  <header class="sg__bar">
    <h1>Styleguide</h1>
    <Field label="Theme" id="sg-theme">
      <Select id="sg-theme" bind:value={theme} options={["Default", "Demo"]} onchange={(e) => apply(e.currentTarget.value)} />
    </Field>
  </header>
  <nav class="sg__toc" aria-label="Sections">
    {#each sections as [id, title]}<a href="#{id}">{title}</a>{/each}
  </nav>

  <section id="tokens">
    <h2>Tokens</h2>
    <h3>Colour</h3>
    <div class="sg__grid">
      {#each fx.swatches as n}
        <div class="sg__swatch">
          <div class="sg__chip" style:background="var({n})"></div>
          <span>{n}</span><span>{swatchValues[n]}</span>
        </div>
      {/each}
    </div>
    <h3>Type scale</h3>
    {#each fx.sizes as n}
      <div style:font-size="var({n})">{n} {swatchValues[n]} — The quick brown fox</div>
    {/each}
    <h3>Spacing</h3>
    {#each fx.spaces as n}
      <div class="sg__swatch"><span>{n} {swatchValues[n]}</span><div class="sg__space" style:width="var({n})"></div></div>
    {/each}
  </section>

  <section id="buttons">
    <h2>Buttons and icons</h2>
    <h3>Button md</h3>
    <div class="sg__row">
      {#each ["primary", "secondary", "ghost", "mono"] as const as v}
        <Button variant={v}>{v}</Button>
      {/each}
      <Button variant="mono" active>mono active</Button>
      <Button variant="mono" active={pressed} onclick={() => (pressed = !pressed)}>toggle</Button>
      <Button disabled>disabled</Button>
      <Button variant="primary" disabled>primary disabled</Button>
    </div>
    <h3>Button sm</h3>
    <div class="sg__row">
      {#each ["primary", "secondary", "ghost", "mono"] as const as v}
        <Button size="sm" variant={v}>{v}</Button>
      {/each}
      <Button size="sm" disabled>disabled</Button>
    </div>
    <h3>IconButton</h3>
    <div class="sg__row">
      <IconButton icon={Icons.plus} label="Plain" />
      <IconButton icon={Icons.plus} label="Outline" variant="outline" />
      <IconButton icon={Icons.eye} label="Pressed" variant="outline" pressed />
      <IconButton icon={Icons.eye} label="Not pressed" variant="outline" pressed={false} />
      <IconButton icon={Icons.plus} label="Small" size="sm" variant="outline" />
      <IconButton icon={Icons.plus} label="Disabled" variant="outline" disabled />
    </div>
  </section>

  <section id="icons">
    <h2>Icons</h2>
    <p>Every icon the UI uses (Lucide, ADR-020).</p>
    <div class="sg__row">
      {#each Object.entries(Icons) as [name, icon]}
        <IconButton {icon} label={name} variant="outline" />
      {/each}
    </div>
  </section>

  <section id="menus">
    <h2>Menus and popovers</h2>
    <div class="sg__row">
      <ActionMenu actions={fx.menuActions} label="Opening" />
    </div>
    <div class="sg__pop"><MarkdownHelp open onclose={noop} /></div>
    <HoverCard kind="note" title="Interview notes" text="A read-only preview card." relation="evidences" />
  </section>

  <section id="chips">
    <h2>Chips and badges</h2>
    <div class="sg__row">{#each fx.statuses as s}<Tag status={s}>{s}</Tag>{/each}</div>
    <div class="sg__row">
      <TagChip label="topic" onSelect={noop} />
      <TagChip label="selected" selected onSelect={noop} />
      <TagChip label="removable" onRemove={noop} />
      <ActorChip actor={fx.human} />
      <CommentBadge count={0} label="Add comment" onclick={noop} />
      <CommentBadge count={3} label="3 comments" onclick={noop} />
      <AttachmentGlyph kind="note" title="Interview notes" text="Preview text" />
      <AttachmentGlyph kind="spreadsheet" title="Budget" pinned />
      <EyeToggle label="Opening" />
      <EyeToggle hidden label="Opening" />
    </div>
  </section>

  <section id="actors">
    <h2>Actors</h2>
    <div class="sg__row">
      <ActorChip actor={fx.human} />
      {#each fx.agents as a}<ActorChip actor={a} />{/each}
      <ActorChip actor={fx.unattributed} />
    </div>
  </section>

  <section id="annotations">
    <h2>Annotations and comments</h2>
    <h3>Margin: compact</h3>
    <ParagraphMargin annotations={fx.annotations} onopen={noop} />
    <h3>Margin: expanded</h3>
    <ParagraphMargin annotations={fx.annotations} variant="expanded" onopen={noop} />
    <div class="sg__grid">
      <div><h3>Empty</h3><CommentThread onadd={noop} /></div>
      <div><h3>Agents and a human</h3><CommentThread comments={fx.comments} onadd={noop} /></div>
      <div><h3>Needs a name</h3><CommentThread needsName onadd={noop} /></div>
    </div>
  </section>

  <section id="paragraph">
    <h2>Paragraph</h2>
    <BlockStack items={fx.stackItems} source="styleguide" ondrop={noop} label="Specimen paragraphs">
      {#snippet row(item, handle)}
        {@const t = fx.stackText[item.id]}
        {#snippet block()}
          <Block
            id={item.id} title={t.title} body={t.body} {handle}
            onbody={noop} ontitle={noop} onhide={noop} onnew={noop} onindent={noop} onmove={noop}
          >
            {#snippet margin()}
              <ParagraphMargin annotations={fx.annotations.slice(0, 2)} onopen={noop} />
            {/snippet}
          </Block>
        {/snippet}
        {@render gated(block)}
      {/snippet}
    </BlockStack>
    <h3>InlineText</h3>
    <InlineText value={text} label="Specimen text" oncommit={(v) => (text = v)} />
    <h3>MarkdownText</h3>
    {@render md("Some **bold** and *italic* text.", "Specimen markdown")}
  </section>

  <section id="panels">
    <h2>Panels and trays</h2>
    <div class="sg__grid">
      <Panel title="Panel" aside={3}><p>Panel body.</p></Panel>
      <Panel title="Static" collapsible={false}><p>Not collapsible.</p></Panel>
      <Panel title="Layers" aside={fx.layers.length}>
        <LayersPanel
          layers={fx.layers} ondrop={noop} onhide={noop} onfold={noop} onselect={noop} onkey={noop}
        />
      </Panel>
      <Panel title="Draft"><DraftTray items={fx.draftItems} ondrop={noop} onputback={noop} /></Panel>
      <Panel title="Bin"><BinTray items={fx.binItems} onrestore={noop} onforget={noop} /></Panel>
      <div>
        {#snippet pinnedPane()}<PinnedPane items={fx.pinned} onunpin={noop} />{/snippet}
        {@render gated(pinnedPane)}
      </div>
      <Panel title="Agents">
        <AgentFeed status={fx.agentStatus} now={fx.NOW} paragraphLabel={fx.paragraphLabel} onselect={noop} />
      </Panel>
      <McpConnection
        status="online" callerUrl="https://relay.example/mcp/abc123" repositoryName="Specimen repo"
        actor={fx.agents[0]} lastActivity="titled ¶ Opening · 2 min ago"
        onDisconnect={noop} onRotate={noop} onTakeover={noop}
      />
    </div>
  </section>

  <section id="forms">
    <h2>Form controls</h2>
    <div class="sg__grid">
      <Field label="Input" id="sg-input" typeHint="string" help="Helper text"><Input id="sg-input" bind:value={input} /></Field>
      <Field label="Select" id="sg-select" typeHint="select"><Select id="sg-select" bind:value={choice} options={["one", "two"]} /></Field>
      <Field label="Textarea" id="sg-area" typeHint="text" required><Textarea id="sg-area" bind:value={area} /></Field>
      <Field label="Invalid" id="sg-bad" error="This value is not allowed"><Input id="sg-bad" value="oops" /></Field>
    </div>
  </section>
</main>
