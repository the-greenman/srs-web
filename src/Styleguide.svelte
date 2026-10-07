<!--
  Styleguide — hidden live specimen page (/styleguide, srs-web#420, ADR-019). Mounts the REAL
  components with fixture props (src/styleguide/fixtures.ts); no SRS semantics (ADR-001).
  The theme switcher sets data-theme on <html>; demo.css is imported here only.
-->
<script lang="ts">
  import "./styles/themes/demo.css";
  import { onMount, type Snippet } from "svelte";
  import {
    ActionMenu, ActorChip, ActorMark, ActorStack, AgentFeed, AttachmentGlyph, AttachmentPreview, BinTray, Block, BlockStack, Button, Checkbox, Modal,
    CommentBadge, CommentThread, DraftTray, EyeToggle, Field, HoverCard, IconButton, InlineText, Input,
    LayersPanel, MarkdownHelp, MarkdownText, AgentPanel, McpConnection, Panel, AnnotationMargin, PinnedPane, ReferencesTray, Select, Tag,
    TagChip, Textarea, Notice, Diagnostics, Toast, ToastHost, SrsMark, Wordmark,
  } from "$lib/components";
  import UpgradePlan from "$lib/components/UpgradePlan.svelte";
  import PackagesDialog from "$lib/components/PackagesDialog.svelte";
  import SourceChooser from "$lib/components/SourceChooser.svelte";
  import LiveRegions from "$lib/components/LiveRegions.svelte";
  import { notify } from "$lib/notices.svelte";
  import { pairingMinutesLeft } from "$lib/components/agent-panel";
  import ToolbarSpecimen from "./styleguide/ToolbarSpecimen.svelte";
  import ShellSpecimen from "./styleguide/ShellSpecimen.svelte";
  import Frame from "./styleguide/Frame.svelte";
  import RecordsView from "$lib/generic/RecordsView.svelte";
  import RelationGraph from "$lib/generic/RelationGraph.svelte";
  import Icons from "./styleguide/icons";
  import { initWasm } from "$lib/srs-client";
  import * as fx from "./styleguide/fixtures";
  import { HEADER_GROUPS } from "$lib/essay/header-actions";

  const noop = () => {};
  const KEY = "srs-web.styleguide.theme";
  const sections = [
    ["tokens", "Tokens"],
    ["buttons", "Buttons and icons"],
    ["icons", "Icons"],
    ["menus", "Menus and popovers"],
    ["toolbar", "Toolbar"],
    ["chips", "Chips and badges"],
    ["actors", "Actors"],
    ["srs-mark", "SRS mark"],
    ["annotations", "Annotations and comments"],
    ["paragraph", "Paragraph"],
    ["panels", "Panels and trays"],
    ["agents", "Agent library"],
    ["shell", "Page frame"],
    ["records", "Records and map"],
    ["chooser", "Source chooser"],
    ["notices", "Notices"],
    ["forms", "Form controls"],
    ["dialogs", "Dialogs"],
  ];

  const agentGroupTitles: Record<string, string> = {
    none: "No relay (a seeded agent stays hidden)",
    empty: "One relay, no agents",
    several: "Several relays and agents: online, saved with a long name, in use elsewhere",
    errors: "Connection errors: rejected and failed",
    pairing: "Pairing shown: connector URL, code, expiry",
  };
  let theme = $state("Default");
  let wasm = $state<"loading" | "ready" | string>("loading");
  let swatchValues = $state<Record<string, string>>({});
  let tokenValues = $state<Record<string, string>>({});
  let text = $state("Editable text");
  let input = $state("Hello");
  let choice = $state("one");
  let area = $state("Some\nlines");
  let pressed = $state(false);
  let helpAnchor = $state<HTMLButtonElement>();
  let helpOpen = $state(false);

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
      [...fx.swatches, ...fx.sizes, ...fx.spaces, ...fx.radii].map((n) => [n, cs.getPropertyValue(n).trim()])
    );
    tokenValues = Object.fromEntries(fx.componentTokens.map((n) => [n, cs.getPropertyValue(n).trim()]));
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

{#snippet thread()}<CommentThread comments={[...fx.comments, ...fx.longComments]} onadd={noop} />{/snippet}

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

{#snippet rail()}
  <Panel title="Layers" aside={fx.layers.length + fx.longLayers.length}>
    <LayersPanel layers={[...fx.layers, ...fx.longLayers]} ondrop={noop} onhide={noop} onfold={noop} onselect={noop} onkey={noop} />
  </Panel>
  <Panel title="Draft"><DraftTray items={[...fx.draftItems, ...fx.longDraftItems]} ondrop={noop} onputback={noop} /></Panel>
  <Panel title="Bin"><BinTray items={[...fx.binItems, ...fx.longBinItems]} onrestore={noop} onforget={noop} /></Panel>
  <Panel title="References" aside={fx.referenceItems.length}><ReferencesTray items={fx.referenceItems} onopen={noop} onfocus={noop} onremove={noop} /></Panel>
  {#snippet pinnedPane()}<PinnedPane items={[...fx.pinned, ...fx.longPinned]} onunpin={noop} onremove={noop} />{/snippet}
  {@render gated(pinnedPane)}
  <Panel title="Agents">
    <AgentFeed status={fx.agentStatus} now={fx.NOW} paragraphLabel={fx.paragraphLabel} onselect={noop} />
    <AgentPanel
      relays={fx.relays} agents={fx.panelAgents} now={fx.NOW}
      onAddRelay={() => null} onUpdateRelay={() => null} onRemoveRelay={() => null} onSetDefault={noop}
      onConnectNew={noop} onConnect={noop} onDisconnect={noop} onForget={noop} onRename={noop} onRotate={noop} onTakeover={noop}
      pair={async () => fx.agentGroups.pairing.pairing.data}
    />
  </Panel>
  <Panel title="Comments">{@render gated(thread)}</Panel>
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
    <h3>Radius</h3>
    {#each fx.radii as n}<div class="sg__swatch"><span>{n} {swatchValues[n]}</span></div>{/each}
    <h3>Component tokens</h3>
    <div class="sg__tokens" data-testid="sg-component-tokens">
      {#each fx.componentTokens as n}<span>{n}</span><span>{tokenValues[n]}</span>{/each}
    </div>
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
    <h3>ActionMenu</h3>
    <div class="sg__row">
      <ActionMenu actions={fx.menuActions} label="Opening" />
    </div>
    <h3>Inside an overflow container (top layer, never clipped)</h3>
    <div class="sg__scroll" data-testid="sg-popover-scroll">
      <div class="sg__scroll-pad"></div>
      <ActionMenu actions={fx.menuActions} label="Scrolled" testid="sg-scroll-menu" />
      <button type="button" class="sg__outside" data-testid="sg-outside-button">Another button</button>
    </div>
    <h3>MarkdownHelp, standalone (anchored to the button)</h3>
    <div class="sg__row">
      <IconButton bind:ref={helpAnchor} icon={Icons["circle-question-mark"]} label="Help anchor" variant="outline" />
    </div>
    <MarkdownHelp id="sg-md-help" anchor={helpAnchor} bind:open={helpOpen} />
    <div class="sg__row"><Button size="sm" variant="mono" popovertarget="sg-md-help" popovertargetaction="toggle">Toggle help</Button></div>
    <h3>HoverCard (static)</h3>
    <HoverCard static kind="note" title="Interview notes" text="A read-only preview card." relation="evidences" onremove={noop} />
    <h3>HoverCard (static, long text)</h3>
    <HoverCard static kind="note" title="Interview notes" text={'A longer reading card. '.repeat(24)} relation="evidences" onremove={noop} />
    <h3>AttachmentPreview</h3>
    <div><AttachmentPreview kind="spreadsheet" title="Budget sheet" text="Q3 budget figures, clamped to three lines when pinned." relation="evidences" clamp /></div>
    <h3>Margin overflow (+N)</h3>
    <AnnotationMargin annotations={fx.annotations} max={2} onopen={noop} />
  </section>

  <section id="toolbar">
    <h2>Toolbar</h2>
    <p class="sg__note">One registry, one renderer. The tier is forced here; the live bar picks it from the width.
      Document is pinned open; View and the narrow overflow open on click.</p>
    {#each [["1440px", "full", "Full tier, 1440px: labelled menus, lone Help icon", "document"], ["768px", "compact", "Compact tier, 768px: icon-only menus", undefined], ["390px", "narrow", "Narrow tier, 390px: title, Save, one overflow", undefined]] as const as [width, tier, caption, pinned]}
      <figure class="sg__figure">
        <figcaption>{caption}</figcaption>
        <div class="sg__frame sg__toolbar" data-testid="sg-toolbar-frame" data-tier={tier} style:width>
          <ToolbarSpecimen title="On small democracy" {tier} {pinned} groups={HEADER_GROUPS} actions={fx.toolbarActions}>
            {#snippet status()}<span>Unsaved changes</span>{/snippet}
          </ToolbarSpecimen>
        </div>
      </figure>
    {/each}
    <h3>Toolbar: read-only document (opened from a link): no Save, Save a copy… in Document</h3>
    <div class="sg__frame sg__toolbar" style:width="768px">
      <ToolbarSpecimen title="meeting" tier="full" groups={HEADER_GROUPS} actions={fx.readOnlyToolbarActions} />
    </div>
    <Notice kind="info">Opened from semanticops.com, read-only. Use Document &gt; Save a copy… to keep an editable copy.</Notice>
    <h3>Toolbar: Save disabled (clean) and a lead slot</h3>
    <div class="sg__frame sg__toolbar" style:width="768px">
      <ToolbarSpecimen title="A clean document" tier="compact" groups={HEADER_GROUPS} actions={fx.toolbarActions.map((a) => (a.kind === "primary" ? { ...a, enabled: false } : a))}>
        {#snippet lead()}<IconButton icon={Icons["circle-question-mark"]} label="Lead slot" />{/snippet}
      </ToolbarSpecimen>
    </div>
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
    <p>Shape tells kind, not colour: a human is a circle, an agent a notched square. No actor is "Unattributed".</p>
    <h3>Compact and full, side by side</h3>
    <div class="sg__pairs" data-testid="sg-actor-pairs">
      {#each [fx.human, ...fx.agents, fx.unattributed] as a}
        <div class="sg__pair"><ActorMark actor={a} /><ActorMark actor={a} size="sm" /><ActorChip actor={a} /></div>
      {/each}
    </div>
    <h3>Stack: 3 (no overflow), 6 (+3), with an unattributed entry</h3>
    <div class="sg__row">
      <ActorStack actors={[fx.human, ...fx.agents.slice(0, 2)]} />
      <ActorStack actors={fx.manyActors} />
      <ActorStack actors={[fx.unattributed, fx.agents[0]]} />
    </div>
  </section>

  <section id="wordmark">
    <h2>Wordmark</h2>
    <p class="sg__note">The SemanticOps name: Semantic regular, Ops bold, tight tracking. Sizes sm, md, lg.</p>
    <div class="sg__row" data-testid="sg-wordmark">
      {#each ["sm", "md", "lg"] as const as size}
        <figure class="sg__figure">
          <figcaption>{size}</figcaption>
          <Wordmark {size} />
        </figure>
      {/each}
    </div>
  </section>

  <section id="srs-mark">
    <h2>SRS mark</h2>
    <p class="sg__note">The upright S: an ink half and a paper half split by an S line, a seed of the opposite colour in each, an ink rim.
      Decorative, always beside a text label. Colours are --srs-mark-ink, --srs-mark-paper and --srs-mark-line; the Theme switcher reskins it.</p>
    <div class="sg__row sg__marks" data-testid="sg-srs-mark">
      {#each [[16, "16px: the picker size"], [24, "24px"], [96, "96px"]] as const as [size, caption]}
        <figure class="sg__figure">
          <figcaption>{caption}</figcaption>
          <SrsMark {size} />
        </figure>
      {/each}
    </div>
  </section>

  <section id="annotations">
    <h2>Annotations and comments</h2>
    <h3>Margin: compact, expanded and narrow (inline, as under the phone breakpoint)</h3>
    <div class="sg__margins">
      <div class="sg__col" style:width="var(--margin-width-compact)"><AnnotationMargin annotations={fx.annotationSet(4)} onopen={noop} /></div>
      <div class="sg__col" style:width="var(--margin-width-wide)"><AnnotationMargin annotations={fx.annotationSet(4)} variant="expanded" onopen={noop} /></div>
      <div class="sg__col sg__inline"><AnnotationMargin annotations={fx.annotationSet(10)} max={5} onopen={noop} /></div>
    </div>
    <h3>Long labels (wide column)</h3>
    <div class="sg__col" style:width="var(--margin-width-wide)"><AnnotationMargin annotations={fx.longLabelAnnotations} variant="expanded" onopen={noop} /></div>
    <h3>Paragraphs with 0, 1, 4 and 10 annotations (wide margin)</h3>
    {#snippet annotated()}
      <div class="sg__wide">
        <BlockStack items={fx.annotatedItems} source="styleguide-annotated" ondrop={noop} label="Annotated paragraphs">
          {#snippet row(item, handle)}
            <Block id={item.id} title={`${item.id.slice(3)} annotations`} body="A paragraph with its margin." {handle} onbody={noop} ontitle={noop} onhide={noop} onnew={noop} onindent={noop} onmove={noop}>
              {#snippet margin()}
                <AnnotationMargin annotations={fx.annotationSet(Number(item.id.slice(3)))} variant="expanded" onopen={noop} />
              {/snippet}
            </Block>
          {/snippet}
        </BlockStack>
      </div>
    {/snippet}
    {@render gated(annotated)}
    <h3>Comment threads</h3>
    {#snippet threads()}
      <div class="sg__grid">
        <div><h3>Empty</h3><CommentThread onadd={noop} /></div>
        <div><h3>With a close control</h3><CommentThread comments={fx.comments} onadd={noop} onclose={noop} /></div>
        <div><h3>Needs a name</h3><CommentThread needsName onadd={noop} /></div>
        <div><h3>Long agent review plus short replies</h3><CommentThread comments={fx.reviewThread} onadd={noop} /></div>
        <div><h3>25 comments (earlier collapsed)</h3><CommentThread comments={fx.manyComments} onadd={noop} /></div>
        <div><h3>Grouped same-author runs</h3><CommentThread comments={fx.runComments} onadd={noop} /></div>
        <div><h3>Markdown, and inert HTML</h3><CommentThread comments={fx.markdownComments} onadd={noop} /></div>
        <div><h3>Agents and a human</h3><CommentThread comments={fx.comments} onadd={noop} /></div>
      </div>
    {/snippet}
    {@render gated(threads)}
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
              <AnnotationMargin annotations={fx.annotations.slice(0, 2)} onopen={noop} />
            {/snippet}
          </Block>
        {/snippet}
        {@render gated(block)}
      {/snippet}
    </BlockStack>
    <h3>Paragraph tool states</h3>
    <p class="sg__note">Handle and ⋯ are always visible. The strip (hide, zoom, copy link) sits inside the title row.</p>
    {#snippet specimen(label: string, t: { title: string; body: string }, cls: string, o: { hidden?: boolean } = {})}
      {#snippet one()}
        <div class={`sg__paragraph ${cls}`} data-testid="sg-paragraph-state" data-state={label}>
          <Block
            id={`sg-${label}`} title={t.title} body={t.body} hidden={o.hidden}
            onbody={noop} ontitle={noop} onhide={noop} onnew={noop} onindent={noop} onmove={noop}
            onzoom={noop} oncopylink={noop} onpull={noop} ondelete={noop}
          />
        </div>
      {/snippet}
      <figure class="sg__figure"><figcaption>{label}</figcaption>{@render gated(one)}</figure>
    {/snippet}
    {@render specimen("idle: handle and menu only", fx.stripText.titled, "")}
    {@render specimen("hover: strip shown", fx.stripText.titled, "sg__strip-on")}
    {@render specimen("focus: strip shown (focused body, nothing hovered)", fx.stripText.oneLine, "sg__strip-on")}
    {@render specimen("hidden paragraph", fx.stripText.titled, "sg__strip-on", { hidden: true })}
    {@render specimen("long title: the strip covers the end of it", fx.stripText.longTitle, "sg__strip-on")}
    {@render specimen("touch: menu only", fx.stripText.titled, "sg__touch")}
    <h3>Hover wins over focus: one-line paragraph under a neighbour with an open thread (live: focus A's text, hover B)</h3>
    <div class="essay-shell__page sg__page" data-testid="sg-strip-pair">
      <BlockStack items={[{ id: "p1", depth: 0 }, { id: "p2", depth: 0 }]} source="styleguide-strip" ondrop={noop} label="Strip pair">
        {#snippet row(item, handle)}
          {#snippet block()}
            <Block
              id={item.id} title={item.id === "p1" ? "Claim" : ""} body={item.id === "p1" ? "The previous paragraph has an open thread." : "A one-line paragraph."} {handle}
              onbody={noop} ontitle={noop} onhide={noop} onnew={noop} onindent={noop} onmove={noop} onzoom={noop} oncopylink={noop}
            />
            {#if item.id === "p1"}{@render gated(thread)}{/if}
          {/snippet}
          {@render gated(block)}
        {/snippet}
      </BlockStack>
    </div>
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
    </div>
    <p>Rail components at the real inspector width (20rem) and a narrow width (15rem), with long text.</p>
    <div class="sg__rails">
      <Frame width="var(--inspector-width)" caption="Inspector 20rem">{@render rail()}</Frame>
      <Frame width="15rem" caption="Narrow 15rem">{@render rail()}</Frame>
    </div>
  </section>

  <section id="agents">
    <h2>Agent library</h2>
    <p>The AgentPanel: rows, never headings. Each state at the rail widths (20rem, 18rem) and a narrow width (16rem).</p>
    {#each Object.entries(fx.agentGroups) as [name, g] (name)}
      <h3>{agentGroupTitles[name]}</h3>
      <div class="sg__rails" data-testid="sg-agent-{name}">
        {#each fx.agentWidths as [width, caption] (width)}
          <Frame {width} {caption} testid="sg-agent-frame">
            {#if "pairing" in g}
              <McpConnection status="online" pairingView={{ ...g.pairing, minutes: pairingMinutesLeft(g.pairing.data.expiresAt, fx.NOW) }} onClosePair={noop} onRetryPair={noop} />
            {:else}
            <AgentPanel
              relays={g.relays} agents={g.agents} now={fx.NOW}
              onAddRelay={() => null}
              onUpdateRelay={() => null} onRemoveRelay={() => null} onSetDefault={noop}
              onConnectNew={noop} onConnect={noop} onDisconnect={noop} onForget={noop} onRename={noop} onRotate={noop} onTakeover={noop}
              pair={async () => fx.agentGroups.pairing.pairing.data}
            />
            {/if}
          </Frame>
        {/each}
      </div>
    {/each}
  </section>

  <section id="shell">
    <h2>Page frame</h2>
    <p class="sg__note">One frame for every editor: a 100dvh grid whose nav and inspector scroll themselves. At or below 720px the nav,
      and at or below 1100px the inspector, are drawers opened from the bar. Shown at 375px: both closed, the nav drawer open, the
      inspector drawer open (badge = unseen activity). The drawer is drawn statically here; the live one is a modal dialog.</p>
    <div class="sg__shells">
      {#each [["none", "Drawers closed"], ["nav", "Nav drawer open"], ["inspector", "Inspector drawer open"]] as const as [open, caption]}
        <figure class="sg__figure">
          <figcaption>{caption}</figcaption>
          <ShellSpecimen {open} />
        </figure>
      {/each}
    </div>
    <h3>Wide: the content cap, off and on</h3>
    <div class="sg__row">
      {#each [["Wide off: --content-max 46rem", "var(--content-max)"], ["Wide on: --content-max-wide 80rem", "var(--content-max-wide)"]] as [caption, cap]}
        <figure class="sg__figure" data-testid="sg-wide">
          <figcaption>{caption}</figcaption>
          <div class="sg__frame"><div class="sg__capbar" style:max-width={cap}>content</div></div>
        </figure>
      {/each}
    </div>
  </section>

  <section id="records">
    <h2>Records and map</h2>
    <p class="sg__note">Records over a repository larger than one page: grouped by type, collapsed, a count each; a group pages 50 at a time.
      With search text the list is flat and ranked, reads "N results" and shows the matching snippet. The map focuses one record: inbound
      neighbours on the left, outbound on the right, relation types in the legend and on hover or focus, labels wrapped to two lines.
      Colours are the <code>--generic-graph-*</code> tokens.</p>
    <div class="sg__shells">
      <figure class="sg__figure sg__figure--list" data-testid="sg-records-grouped">
        <figcaption>Grouped by type (no search)</figcaption>
        <RecordsView typeOptions={[]} searching={false} total={704} groups={fx.recordGroups} onOpen={noop} />
      </figure>
      <figure class="sg__figure sg__figure--list" data-testid="sg-records-searched">
        <figcaption>Searched: flat, ranked</figcaption>
        <RecordsView search="travelling form" typeOptions={[]} searching={true} total={9} hits={fx.recordSearchHits} onOpen={noop} />
      </figure>
    </div>
    <div class="sg__shells">
      <figure class="sg__figure sg__figure--map" data-testid="sg-map-focus">
        <figcaption>Focused on a record, both directions</figcaption>
        <RelationGraph view="focus" focus={fx.focusMap.focus} layout={fx.focusMap.layout} onOpen={noop} />
      </figure>
      <figure class="sg__figure sg__figure--map" data-testid="sg-map-outbound">
        <figcaption>Focused, outbound only (12 of 156 shown)</figcaption>
        <RelationGraph view="focus" focus={fx.outboundOnlyMap.focus} layout={fx.outboundOnlyMap.layout} onOpen={noop} />
      </figure>
      <figure class="sg__figure sg__figure--map" data-testid="sg-map-container">
        <figcaption>A container, first 24 members of {fx.cappedContainerMap.totalNodes} records</figcaption>
        <RelationGraph view="container" graph={fx.cappedContainerMap} onOpen={noop} />
      </figure>
    </div>
  </section>

  <section id="chooser">
    <h2>Source chooser</h2>
    <p class="sg__note">The landing options: this device and folders first, cloud providers (unconfigured here), then "From a URL" for a read-only link.
      The input is a native <code>type=url</code>; the button stays disabled until it holds a link, and a refusal shows as an error Notice below.</p>
    <SourceChooser
      providers={{
        dropbox: { configured: false, label: "Dropbox", authenticate: noop, open: noop },
        googleDrive: { configured: false, label: "Google Drive", authenticate: noop, open: noop },
        github: { configured: false, label: "GitHub", authenticate: noop, open: noop },
      } as never}
      onOpen={async () => {}}
      onOpenUrl={async () => { throw new Error("Only https:// links can be opened."); }}
    />
  </section>

  <section id="notices">
    <h2>Notices</h2>
    <p class="sg__note">A toast is a transient event (bottom-centre of the main column; errors are sticky), a Notice is persistent
      state, Diagnostics groups the engine's findings by identical message. Specimens are drawn statically; the button fires the real toast.</p>
    <h3>Toast</h3>
    <div class="stack">
      <Toast data-specimen kind="info" text="Saved. Newer changes remain unsaved." testid="specimen-toast-info" />
      <Toast data-specimen kind="success" text="Link copied" testid="specimen-toast-success" />
      <Toast data-specimen kind="error" text="Could not save: the folder is read-only." testid="specimen-toast-error" />
      <Button variant="secondary" data-testid="specimen-fire-toast" onclick={() => notify({ kind: "success", key: "sg", text: "Link copied" })}>Fire toast</Button>
    </div>
    <h3>Notice</h3>
    <div class="stack">
      <Notice data-specimen kind="info" testid="specimen-notice-info">This link points to a paragraph that is no longer here.</Notice>
      <Notice data-specimen kind="warning" testid="specimen-notice-warning">2 size warnings: the document is large.</Notice>
      <Notice data-specimen kind="error" testid="specimen-notice-error" onDismiss={noop}>Could not export: the engine refused the view.</Notice>
      <Notice data-specimen kind="info" testid="specimen-notice-action" action={{ label: "Review upgrade", onAction: noop }}>essay 1.7.0 is available (installed 1.5.0).</Notice>
    </div>
    <h3>Diagnostics</h3>
    <div class="stack">
      <div data-testid="specimen-diagnostics-collapsed"><Diagnostics data-specimen variant="notice" diagnostics={fx.noticeDiagnostics} documentKey="sg-collapsed" /></div>
      <div data-testid="specimen-diagnostics-expanded"><Diagnostics data-specimen variant="notice" diagnostics={fx.noticeDiagnostics} documentKey="sg-expanded" expanded /></div>
      <div data-testid="specimen-diagnostics-panel"><Diagnostics diagnostics={fx.noticeDiagnostics} /></div>
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
    <div class="sg__row" data-testid="sg-checkbox">
      <Checkbox checked>Checked</Checkbox>
      <Checkbox>Unchecked</Checkbox>
    </div>
  </section>

  <section id="dialogs">
    <h2>Dialogs</h2>
    <Modal inline title="Save to…" testid="sg-modal">
      <p>This repository is not saved yet. Choose where to keep it.</p>
      <Button variant="primary">To this device</Button>
      <Button>Dropbox</Button>
      <Button>Google Drive</Button>
      {#snippet actions()}<Button size="sm">Cancel</Button>{/snippet}
    </Modal>
    <Modal inline title="Save to GitHub" testid="sg-modal-branch">
      <p>Committing to <strong>owner/repo</strong>.</p>
      <fieldset>
        <label class="checkbox"><input type="radio" name="sg-branch" checked /><span>Commit to <code>main</code></span></label>
        <label class="checkbox"><input type="radio" name="sg-branch" /><span>Create a new branch</span></label>
      </fieldset>
      <Input placeholder="Commit message (optional)" aria-label="Commit message" />
      {#snippet actions()}
        <Button size="sm">Cancel</Button>
        <Button size="sm" variant="primary">Save</Button>
      {/snippet}
    </Modal>
    <UpgradePlan inline testid="sg-upgrade-plan" plans={[fx.upgradePlan]} onApply={() => {}} onCancel={() => {}} />
    <div data-testid="sg-packages-dialog"><PackagesDialog inline packages={fx.installedPackagesFx} onUpgrade={() => {}} onClose={() => {}} /></div>
  </section>
</main>
<LiveRegions />
<ToastHost />
