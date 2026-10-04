# Plan: Agent participation kit (#422)

## Summary

Phase 3 of story muDemocracy.org#282. Agents are first-class participants, so annotations, comments and actor identity must be standard components, not essay code. Today:
- `src/lib/essay/annotations.ts` and `CommentThread` read the essay model (`model.comments[paragraphId]`).
- Identity is a full-width lozenge (`ActorChip`, hue from `actorHue` in `src/lib/agent-activity.ts`), and `AttachmentGlyph` has its own, different hue function (kind string, mod 360).
- Unattributed authors render as "anon HUMAN" (#420 finding).
- Long threads are unbounded, raw-markdown, always expanded.
- Margin notes overflow the page and the rail (no grid column, no alignment, letter-only kind marks, one-off dashed "+N").

Six ordered phases, each with a gate and a commit:
1. One actor hue function; compact `ActorMark`, full `ActorChip`, `ActorStack`, explicit unattributed state.
2. Generic annotations/comments model in `src/lib/annotations.ts`, keyed by instanceId; essay becomes an adapter.
3. `CommentThread` long-thread behaviours.
4. `AnnotationMargin`: a real grid column, one kind-icon map, the hook #424 flips for wide.
5. Adoption in Generic / Governance / Guides (gated by feature detection) and multi-agent presence.
6. Styleguide states, e2e, docs (ADR-020 parts).

Presentation and client-side composition only. No SRS semantics in TS (ADR-001). No new WASM method.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | Sonnet subagent (phases in order) |
| Verification | Haiku subagent (after each gate and before sign-off) |

See [agents.md](agents.md).

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client. Comment loading and creation stay pure WASM pass-through (`listRelations`, `createRecord`, `createRelation`); grouping, clamping and collapsing are presentation. | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | New parts and tokens are skin API; every state is a `/styleguide` specimen. | accepted |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | Lucide icons mapped once from the data key; `--<block>-<prop>` tokens on `:root`; `data-part` tables. Phase 6 appends parts for `ActorMark`, `ActorStack`, `CommentThread`, `AnnotationMargin`. | accepted |

Owner decisions (2026-10-04), recorded here and detailed under "Decided by owner 2026-10-04":

| Ref | Decision | Status |
|---|---|---|
| D1 | Thread placement: inline under the paragraph, bounded. `CommentThread` stays placement-agnostic so #426 can move it. | decided |
| D2 | Shape language: human = circle; agent = rounded square with a corner notch. | decided |
| D3 | Kind icons: one fixed client map keyed by data key, with a fallback icon. | decided |
| D4 | Comment type stays essay-only for now; comments show only where `commentsAvailable(repo)`; other annotation kinds show everywhere. | decided |

ADR-020 gains parts, each written by the phase that adds it: Phase 1 writes the `ActorMark` shape rule (D2) and actor tokens; Phase 4 writes the `--margin-width` token family and the kind-icon map rule (D3, `annotation-icons.ts`); Phase 6 appends the `data-part` tables for `ActorMark`, `ActorStack`, `CommentThread`, `AnnotationMargin`. No new ADR.

## Investigation results (these gate the plan)

### 1. Spec gate: comments exist only where the essay package is installed

- The comment Type and the relation are defined in the **essay package** `com.mudemocracy.essay` (muSrs/packages/essay, muDemocracy.org#229/#250), not in the SRS spec or srs-rust core.
  - Constants: `src/lib/essay/type-registry.ts:9-13` (`COMMENT_TYPE_ID` 7482e41b…, `COMMENTS_ON` = `com.mudemocracy.essay/comments-on`, relation-type id 607009b0…).
  - Definition text (e2e/fixtures/essay.srsj, relation-type 607009b0): "**Essay-local for now; expected to become a core 'agent commentary on human content' mechanism when a second consumer appears (owner, 2026-10-02).**" This phase is that second consumer.
  - The relation type has no source/target type restriction (only `irreflexive`), so a comment can target any instance. The engine does not need to change for that.
- A Generic/Governance/Guides repo that does not install the essay package has **no comment type and no `comments-on`**. `createRecord` of an unknown type fails. srs-web has **no package-install call** (`src/lib/srs-client.ts` only lists packages), so the client cannot add it.
- **Option (i) is chosen: feature-detect, no upstream work needed for this phase.**
  - Comments are shown and creatable only when `listTypes(repo)` contains the comment type id AND `listRelationTypes(repo)` contains the `comments-on` key. Both are existing pass-through calls (`listTypes` srs-client.ts:1422, `listRelationTypes` :2229).
  - With neither installed, the thread/badge for that instance is absent (not disabled). Existing annotations (attachments, relations) still render.
  - Reads of other annotation kinds need nothing new: `context_record` already returns every relation with `createdAt`/`createdBy` (#1246, `context-record.json` schema; TS `ContextRelation` srs-client.ts:~2193).
- **Required changes outside srs-web: none for this phase.** No spec, srs-rust core or WASM change.
- **Follow-up (not blocking; owner decided 2026-10-04 to keep essay-only and file no issue, D4):** promoting comment type + `comments-on` out of the essay package into a shared package so Generic/Governance/Guides corpora get them without installing `com.mudemocracy.essay`. That is a package/spec change (muDemocracy.org packages, possibly core RFC-029 definitions), not srs-rust code.
- **Attachment/related actor is real Phase 2 work**, not a pass-through: `Attachment` and `Related` gain `actor`, filled from `ContextRelation.createdBy` (#1246) in `toAttachment` / `toRelated`, with a unit test.

### 1b. Structural edges in the margin (N4)

- `contextRecord(..., excludeRelationCategories?)` already accepts engine-side category exclusion (srs-client.ts:2209-2218; essay uses it at `essay-document.ts:280`). The `ContextRecordPayload` schema (srs-rust `context-record.json`) does not expose a per-relation category on `ContextRelation`. So Phase 5 excludes `composition`/`sequence` via the engine option and needs no srs-rust change. If the owner later wants membership excluded too, that is a category name passed to the same option.

### 2. Multi-agent: the data model and relay already support N agents

- One relay channel plus one MCP session per agent connection is already built (#358): `src/lib/agent-connections.ts` (host-minted `agent:<uuid>` per connection), `App.svelte:283-410` (`agents[]`, `hostFor`, `openAgentSession`, `observeSession` per agent), `AgentStatus.agents[]` in `src/lib/agent-activity.ts`. The relay's takeover/409 is per channel, so N agents = N channels.
- `e2e/agent-channels.spec.ts` already runs two agents (alpha, beta) commenting on one paragraph with distinct names.
- **UI gap, not upstream:** `AgentFeed` and `McpConnection` render a full chip per row; there is no at-a-glance "who is here" strip. Phase 5 adds `ActorStack` of connected agents and compact marks in rows.
- **Not verified locally:** whether `browser-executor-relay` (not in this workspace) caps concurrent channels per origin. The e2e relay is mocked and accepts any N, so the automated 3-agent test cannot detect it. Do a **manual live-relay check with 3 agents** (Assumptions); file the upstream issue below only if that check fails. Otherwise nothing is blocked upstream.
  - Proposed title (the-greenman/browser-executor-relay): `Support N concurrent executor channels from one browser origin`
  - Body: srs-web runs one channel per agent (srs-web#358) and the story muDemocracy.org#282 requires several agents on one document. Reproduce: open 3 channels from one origin; expected all stay `online`; actual: <paste>. Acceptance: 3+ concurrent channels per origin stay connected; takeover/409 stays per channel. Parent: muDemocracy.org#282.

### 3. Existing selectors touching comments, margin, actor chips, glyphs

**Rule (as #421):** each changed selector has one fate, listed here, re-pointed in the same commit as the markup. No aliases. `data-testid`s and accessible names are kept unless listed.

| Selector | Used by | Fate | Becomes |
|---|---|---|---|
| `actor-chip`, `actor-name`, `actor-kind` testids on the **full** `ActorChip` | essay-comments 37-38, 141-151; agent-channels 121, 271; migrate-rev8 31-32; ActorChip.test; McpConnection.test:12 | **kept** (full chip unchanged) | unchanged |
| `actor-name` inside `AgentFeed` rows | agent-channels 371; AgentFeed.test | re-point (rows become compact `ActorMark`) | `getByTestId("actor-mark")` with `toHaveAccessibleName("alpha (agent)")` |
| `actor-name` in `McpConnection` | McpConnection.test:12 | **kept** (a name must be read: uses full chip) | unchanged |
| `actor-name` in a comment run by one author | agent-channels 121, 271 | **kept**, but shown once per run of same-actor comments | tests already use distinct authors; `comment` testid count unchanged (one per article) |
| "Unknown author" span (`comment-author` testid) in `CommentThread` | none in e2e | replaced by `ActorMark unattributed` | `getByTestId("actor-mark")` with name "Unattributed" |
| `comment`, `comment-thread`, `comment-badge`, `.comments__text`, `Reply` textbox, `Your name`, `Comment` button | essay-comments, essay-editor 497-506, essay-write-guard 149-175, migrate-rev8, mobile-layout 56-75, agent-channels | **kept** (names unchanged; `Comment` stays the submit button's name) | unchanged. `.comments__text` now holds rendered HTML; text assertions still match. |
| `.glyph`, `--glyph-hue`, `.hover-card__remove` | essay-editor 284-310, essay-write-guard 184-188, AttachmentGlyph.test 26-27, ParagraphMargin.test:26 | **kept** class `glyph` and `hover-card__remove`; letter replaced by a Lucide icon; hue now = attaching actor via `--actor-hue` | `--glyph-hue` assertion in AttachmentGlyph.test:27 re-pointed to `--actor-hue` |
| `paragraph-margin`, `margin-more`, `margin-overflow`, `relation-indicator`, `shared-badge` testids | ParagraphMargin.test, EssayShell.test:139-178, essay-editor 334, 421 | **kept** | unchanged |
| `.margin__item > *:first-child` order check | ParagraphMargin.test:30-33 | re-point (file becomes `AnnotationMargin.test.ts`; rows get `data-part="row"`/`"mark"`) | `[data-part="row"] > [data-part="mark"]` yields `["comment-badge","glyph-wrap","margin__relation"]` order |
| `.margin__text`, `.margin--expanded` | ParagraphMargin.test:55-61, EssayShell.test:160-162 | **kept** `.margin--expanded` as the #424 hook; `.margin__text` kept | unchanged |
| `margin-variant` testid | EssayShell.test:139-162 | re-point (experiment flag retired; viewer override remains as header action `margin`, mobile-layout:52) | assert via `data-margin="expanded"` on `.essay-shell` |
| `.comment-badge` bounding box | mobile-layout:63 | **kept** | unchanged |
| new testids `actor-mark`, `actor-stack` (ActorStack root), `presence` (connected-agents strip), `rail` (essay rail) | Phases 1, 4, 5 | **new**, no existing selectors affected | used by the new e2e |
| `agent-feed`, `agent-feed-entry`, `agent-feed-focus`, `mcp-*` testids | agent-channels, mcp-relay, AgentFeed.test | **kept** | unchanged |

## Contracts

### WASM API surface

**No** new or changed WASM methods. Used as they are: `list_types`, `list_relation_types`, `list_relations`, `context_record`, `create_record`, `create_relation`, `renderMarkdown`.

### TypeScript types

- `Annotation` (moved to `src/lib/annotations.ts`) gains `actor` for every kind (attachment/relation: the relation's `createdBy`, via new `actor` on `Attachment`/`Related`). `AnnotationKind` stays the closed union `"comments" | "attachment" | "relation" | "shared"`; `icon` carries the data key (neighbour type / relation type).
- `Comment` (`{id, text, createdAt, author?}`) moves to `src/lib/comments.ts`.
- `ActorMark` / `ActorChip` / `ActorStack` take `actor?: Actor` (undefined = unattributed).

## Scope

**In scope:** the four owner scope comments (unattributed state; compact mark + stack; long threads; margin redesign) and the #421 deferral (one hue function, shared `.hue-pill` tokens).

**Out of scope:** Toolbar/menu (#423), AppShell/wide toggle/hamburger (#424), NavTree (#425), URL address (#426), modals (#428). Wide mode itself is #424: this plan only defines the hook it flips. Agents never write essay text (owner ruling, write guard unchanged). No package install, no new SRS type.

---

## Phases

### Phase 1: Actor identity: one hue, compact mark, stack, unattributed

**Goal:** one hue function and one set of actor components; AI vs human is told by shape; an unattributed author is an explicit state.

**Agent:** Web App Worker

#### Tasks

- [x] **One hue function.** Keep `actorHue(id)` (`agent-activity.ts:102`); move it to `src/lib/actor-hue.ts` (no re-export). Importers to update (grep'd): `src/lib/components/ActorChip.svelte:8`, `tests/agent-activity.test.ts:4,69` (move that assertion to `tests/actor-hue.test.ts`). `attachment.css` lines 3, 13, 15, 16, 23 (`--glyph-hue`) change in this phase too. `AttachmentGlyph` stops computing its own hue (delete the `reduce` at line ~27 of `AttachmentGlyph.svelte`); its hue now comes from the actor (Phase 4) and falls back to a neutral token when none. Both use `--actor-hue` and the shared `.hue-pill` tokens already in `tokens-components.css` (`--hue-pill-*`, #421). Delete `--glyph-hue`. Add `.hue-pill` / `.hue-pill--solid` in `comments.css` as the one rule set; `.actor-chip` and `.glyph` compose it instead of repeating `hsl(...)`.
- [x] **`ActorMark.svelte`** (new, compact, the default): a focusable circle (`<span tabindex="0" role="img" aria-label="Scribe (agent)">`) in the actor's hue with the initial.
   - **Shape language (D2, decided):** agents = a squarer shape (`border-radius` token `--actor-mark-radius-ai`, default a rounded square) with a corner notch; humans = circle. Not colour-dependent: must read in monochrome.
   - Tooltip via `HoverCard` on hover/focus, **reusing or extracting `AttachmentGlyph`'s hover/close-delay logic into one shared helper (no copied timer)**: name, kind, id. The `aria-label` carries the name, so the tooltip is never the only way.
   - Props: `actor?: Actor`, `size?: "sm"|"md"`. `data-testid="actor-mark"`, `data-part="mark"`.
- [x] **`ActorChip.svelte`** stays the full lozenge (keep testids `actor-chip`, `actor-name`, `actor-kind`); it composes `.hue-pill` and renders the `ActorMark` shape as its leading glyph. Add `actor?: Actor`.
- [x] **Unattributed:** `actor` undefined, or no `id`, renders "Unattributed" in a neutral (hue-less) mark and chip, no kind text. This replaces "anon HUMAN" and the "Unknown author" span.
- [x] **`ActorStack.svelte`** (new): overlapping `ActorMark`s, `max` (default 3) then "+N" as an `IconButton`/`Button size="sm"` opening a `Popover` list of the rest. `aria-label="3 agents and 1 person"`-style summary derived from kinds.
- [x] Tokens in `tokens-components.css`: `--actor-mark-size`, `--actor-mark-radius-human`, `--actor-mark-radius-ai`, `--actor-stack-overlap`. Export from `index.ts`.
- [x] Update `tests/ActorChip.test.ts`; add `tests/ActorMark.test.ts`, `tests/ActorStack.test.ts` (unattributed, aria-label "Scribe (agent)", "+N").

#### Acceptance Criteria

- [x] `grep -rn "glyph-hue" src` and `grep -n "reduce((h, c)" src/lib/components/AttachmentGlyph.svelte` find nothing; one hue function exists.
- [x] Unattributed renders "Unattributed", never "anon" / "HUMAN".
- [x] Human and agent marks differ by shape in a grayscale screenshot check (computed `border-radius` differs).
- [x] `tests/styles-tokens.test.ts` and `tests/breakpoints.test.ts` stay green.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

#### Milestone gate

1. All criteria met. 2. typecheck, lint, test, build pass. 3. Tick boxes here. 4. Commit: `feat: ActorMark, ActorStack, one hue function and unattributed state (#422)`.

---

### Phase 2: Generic annotations and comments model

**Goal:** annotations and comments key on any `instanceId`; the essay supplies an adapter; attachments and related carry their actor.

**Agent:** Web App Worker

#### Tasks

- [x] `git mv src/lib/essay/annotations.ts src/lib/annotations.ts` (update its header comment, which names `ParagraphMargin`). `annotationsFor(source, instanceId)` takes a small `AnnotationSource` interface `{ comments; attachments; sharedIn?; related?; label(id) }` instead of `EssayModel`; essay builds it in a thin adapter under `essay/`. `Annotation` lives in `src/lib/annotations.ts`; `Comment` lives in `src/lib/comments.ts`. `AnnotationKind` stays a closed union; `icon` carries the data key.
- [x] **Comments module `src/lib/comments.ts`** owns `COMMENT_TYPE_ID`, `COMMENTS_ON` (and `COMMENTS_ON_TYPE_ID`), `Comment`, `loadComments(repo, types)` with its `WeakMap` cache (moved unchanged from `essay-document.ts:182-212`), and `addComment(repo, targetId, text)` (moved from `essay-document.ts:408`; same `createRecord` + `createRelation`, the engine stamps `createdBy`). `typeVersion` is private in `essay-document.ts:163`: move it to the shared `src/lib/type-version.ts` and import it from both `essay-document.ts` and `comments.ts`. `essay/type-registry.ts` imports the constants from `src/lib/comments.ts`, so there is no generic-to-essay dependency (grep: no non-essay `src/lib` file imports `essay/`). `commentsAvailable(repo)` is a **pass-through**: `listTypes` contains the comment type id AND `listRelationTypes` contains the `COMMENTS_ON` key. No new derivations.
- [x] **Attachment/Related actor (real work).** Add `actor?: Actor` to `Attachment` (`essay-document.ts:73`) and `Related` (`:92`). Fill it from `ContextRelation.createdBy` (srs-client.ts ~:2193) in `toAttachment` (~:214) and `toRelated`. `annotationsFor` copies it to `Annotation.actor` for attachment and relation kinds. Pure field copy; no inference. (`SrsRelation`/`listRelations` is not involved.)
- [x] Phase 2 leaves the margin variant code (`VARIANT_KEY`, `MarginVariant`, `loadVariant`, `saveVariant`, `EssayShell.svelte:68,207-208`) untouched; it moves with `annotations.ts` unchanged and Phase 4 swaps it.
- [x] Tests: move `tests/annotations.test.ts` with `git mv`; add (a) a unit test that `toAttachment`/`toRelated` carry `createdBy` into `actor` and `annotationsFor` exposes it, (b) `annotationsFor` on a non-essay source, (c) `commentsAvailable` false for `gallery.srsj`, true for `essay.srsj`.

#### Acceptance Criteria

- [x] The A1 unit test passes (actor present on attachment and related annotations).
- [x] `src/lib/essay/annotations.ts` is gone; `annotationsFor` has no `EssayModel` import; no `src/lib/**` (non-essay) file imports from `essay/`.
- [x] Selector disposition for this phase: no DOM selector changes; `e2e/essay-comments.spec.ts`, `e2e/essay-write-guard.spec.ts`, `e2e/essay-editor.spec.ts` green unmodified.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/essay-comments.spec.ts e2e/essay-write-guard.spec.ts e2e/essay-editor.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Commands above pass. 3. Tick boxes. 4. Commit: `refactor: instance-keyed annotations and comments model (#422)`.

---

### Phase 3: CommentThread long-thread behaviours

**Goal:** `CommentThread` is bounded, compressible, markdown-rendered, with a pinned composer.

**Agent:** Web App Worker

#### Tasks (`CommentThread.svelte`, `comments.css`, `src/lib/comments.ts`)

- [ ] **Bounded + scroll:** `.comments__list` is the scroller: `max-height: var(--comment-thread-max)` (default `24rem`), `overflow-y: auto`; scroll to the newest on mount, on add, and after "reveal all". The composer sits **outside** the scroller (a sibling below it, not sticky), so it never scrolls away.
- [ ] **Clamp long comments:** wrapper uses `display:-webkit-box; -webkit-line-clamp: var(--comment-clamp-lines)` (default 6); verify it clamps rendered markdown with block children (paragraphs, lists). A real `Button size="sm" variant="ghost"` "Show more / Show less" with `aria-expanded`, shown only when `scrollHeight > clientHeight`.
- [ ] **Collapse long threads:** beyond `N = 8` (named const) older comments sit behind "N earlier comments"; plus a one-line thread summary (last author `ActorMark`, count, first line) toggle.
- [ ] **Group runs:** pure `groupRuns(comments)` in `src/lib/comments.ts` (consecutive same `actor.id`, or consecutive unattributed). First of a run: full `ActorChip`; later items: compact `ActorMark`.
- [ ] **Markdown:** `MarkdownText` is an editor, so extract a read-only `src/lib/components/MarkdownView.svelte` (`value` -> `{@html renderMarkdown(value)}`) as the ONLY `{@html renderMarkdown(...)}` site. `MarkdownText`'s rendered mode (line ~117) and `PinnedPane.svelte:53` move onto it (both are direct fits); `CommentThread` uses it.
- [ ] **Timestamps:** `<time datetime title>` only when `createdAt` is non-empty (omit the element otherwise). A small `relativeTime(iso, now)` in `src/lib/comments.ts`: relative up to a day ("just now", "N min ago", "N h ago"), then `toLocaleDateString`; the full locale time goes in `title`. Do not reuse `ago` (no day bucket); unit-test the buckets and the empty case.
- [ ] **Composer:** `Textarea` autogrows to `--comment-composer-max`; Ctrl/Cmd+Enter submits; submit is `Button size="sm" variant="primary"`, enabled as soon as there is text; `Your name` input kept.
- [ ] `data-part` additions: `list`, `earlier`, `more`, `time`, `summary`.

#### Acceptance Criteria

- [ ] e2e in `e2e/agent-channels.spec.ts`, using its existing MCP comment helper: a 3,000-character agent comment plus 25 replies. Assert the scroller's `clientHeight` <= the computed max in px (resolve `--comment-thread-max` rem to px) and `scrollHeight > clientHeight`; the composer is inside the viewport; "N earlier comments" reveals the rest and the newest is scrolled into view; "Show more" toggles `aria-expanded` (e2e only: happy-dom has no layout); `*em*` renders as `<em>`.
- [ ] e2e: an agent comment containing `<script>` and `<img onerror>` is inert (no script run, no `img` element in the DOM, text escaped).
- [ ] Vitest: `groupRuns`, `relativeTime`, `grep -rn "{@html renderMarkdown" src` returns only `MarkdownView.svelte`; a `MarkdownView` test covers emphasis and escaped HTML.
- [ ] Selector disposition for this phase: `comment`, `comment-thread`, `comment-badge`, `Reply`, `Your name`, `Comment`, `.comments__text` pass unchanged; the "Unknown author" span becomes an unattributed `ActorMark` (`getByTestId("actor-mark")`).

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/essay-comments.spec.ts e2e/mobile-layout.spec.ts e2e/agent-channels.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Commands above pass. 3. Tick boxes. 4. Commit: `feat: bounded, compressible, markdown comment threads (#422)`.

---

### Phase 4: AnnotationMargin as a real grid column

**Goal:** the margin is its own column (`--margin-width`), one row system, one kind-icon map, one `data-margin` hook for wide.

**Agent:** Web App Worker

#### Tasks

- [ ] `git mv ParagraphMargin.svelte AnnotationMargin.svelte` and `git mv tests/ParagraphMargin.test.ts tests/AnnotationMargin.test.ts`. Update every rename site: `src/lib/components/index.ts`, `EssayShell.svelte:18,579`, `Styleguide.svelte`, `docs/adr/020-icon-set-and-component-token-api.md` lines 41 and 82, `src/lib/components/README.md:69`, the `annotations.ts` header.
- [ ] **Grid column:** touch `src/styles/components/block.css` and `src/styles/essay-shell.css` (the Block grid and the essay page frame get a margin column `var(--margin-width)`). `--margin-width` and `--margin-width-wide` tokens in `tokens-components.css`. Delete both squeeze rules: `margin.css:62` and `block.css:283` (`:has(.margin--expanded)`). Text uses `min-width:0` + clamp so nothing crosses the page edge or the rail.
- [ ] **One mechanism: `data-margin`.** `data-margin="compact|expanded"` on the shell sets the width token and the `.margin--compact` / `.margin--expanded` classes react to it. #424's Wide toggle reuses this same setter and adds no second one. Under the `phone` breakpoint (480) the margin goes inline below the paragraph behind a count.
- [ ] **Whole seam swap happens here.** Keep the header action testid `margin-variant` (`essay/header-actions.ts:68`). Delete `VARIANT_KEY`, `MarginVariant`, `loadVariant`, `saveVariant` from `src/lib/annotations.ts` and their uses at `EssayShell.svelte:68,207-208`; add a `srs-web.margin` loader/saver beside the header action that sets `data-margin`; update `tests/EssayShell.test.ts:139-178`.
- [ ] **One row system:** `[data-part="row"]` containing `[data-part="mark"]` on a shared left edge (`--margin-mark-size`), a 1-2 line clamped `[data-part="label"]`, `--margin-row-gap`. First row aligns to the paragraph's first line. `CommentBadge` is a row like any other.
- [ ] **Kind icons, mapped once:** `KIND_ICONS` in `src/lib/components/annotation-icons.ts` maps the data key (`icon`) to a Lucide component, with a fallback icon (names verified in `node_modules/@lucide/svelte/dist/icons/`). Letters are never the only cue. State in the file header and ADR-020: `attachment` is a client presentation grouping by neighbour kind, never inferred from SRS semantics.
- [ ] **Hue = attaching actor:** `--actor-hue` from `annotation.actor` (filled in Phase 2); no actor = neutral. `attachment.css` `--glyph-hue` uses (lines 3, 13, 15, 16, 23) move to `--actor-hue` and the `.hue-pill` rules (changed-files list).
- [ ] **Rail testid:** add `data-testid="rail"` to the `<aside class="panel-rail">` element in `src/lib/essay/EssayShell.svelte:620` (used by the 1920 no-overlap e2e).
- [ ] **"+N":** `Button size="sm"` opening the existing `Popover` (drop the dashed `.margin__more` style).
- [ ] **Hover/focus** on a row shows the full text (`HoverCard`) and highlights its paragraph (`.block[data-annotation-hover]` outline). Presentation only.
- [ ] `data-part` additions: `row`, `mark`, `label`, `more`.

#### Acceptance Criteria

- [ ] `e2e/annotation-margin.spec.ts` (new): at 1920x1080 with `data-margin="expanded"`, no `[data-part="row"]` bounding box intersects `[data-testid="rail"]`'s box (the rail testid added in this phase) or exceeds the right edge of `.essay-shell__page`; at 1280 the compact form shows; at 390 the notes are reachable inline.
- [ ] `tests/AnnotationMargin.test.ts`: order unchanged, `+N` opens the popover list, label text present only in the expanded form.
- [ ] `grep -rnE "loadVariant|saveVariant|VARIANT_KEY|MarginVariant" src tests` returns nothing; `margin-variant` remains only as the header action testid (`header-actions.ts`, `EssayShell.test.ts`, e2e).
- [ ] No `:has(.margin--expanded)` remains in `src/styles`.
- [ ] Selector disposition for this phase: `paragraph-margin`, `margin-more`, `margin-overflow`, `relation-indicator`, `shared-badge`, `.glyph`, `hover-card__remove`, `.margin--expanded`, `.margin__text` unchanged; `.margin__item > *:first-child` becomes `[data-part="row"] > [data-part="mark"]`; `--glyph-hue` becomes `--actor-hue` (AttachmentGlyph.test:27); EssayShell.test:160-162 asserts `data-margin` instead of the removed toggle class.
- [ ] Touch targets still 44px under `pointer: coarse`.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/annotation-margin.spec.ts e2e/essay-editor.spec.ts e2e/essay-touch.spec.ts e2e/mobile-layout.spec.ts e2e/navigation.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Commands above pass. 3. Tick boxes. 4. Commit: `feat: AnnotationMargin grid column, kind icons and data-margin hook (#422)`.

---

### Phase 5: Adoption in other shells and multi-agent presence

**Goal:** Generic, Governance and Guides inspectors show comments (where available) and the engine's relations for the selected instance; every connected agent is individually visible.

**Agent:** Web App Worker

#### Tasks

- [ ] **Non-essay annotation source (no relation classification in TS, ADR-001).** For the selected `instanceId` in `GenericSrsShell.svelte` (`selectedRecord`, ~241-310), `GovernanceShell.svelte` (`Inspector` ~1151) and `GuidesShell.svelte` (selected section), render an `AnnotationMargin` plus `CommentThread` showing:
  - (a) comments, only where `commentsAvailable(repo)`;
  - (b) one generic `relation` annotation per relation returned by `contextRecord(repo, instanceId, undefined, STRUCTURAL_CATEGORIES)` (`srs-client.ts:2209`; the existing `STRUCTURAL_CATEGORIES = ["composition","sequence"]` from `essay-document.ts` moves to `src/lib/annotations.ts`). The ENGINE leaves structural edges out (`excludeRelationCategories`); no TS relation-type lists. `ContextRelation` exposes no per-relation category, so none is read. Comments are not shown as relation rows because "comments render in the thread" (a presentation rule: `comments-on` rows are skipped, not classified). Each row shows: label = `listRelationTypes(repo)` label for `relationType` (key->label map, as `essay-document.ts:278`), direction = `direction`, neighbour title = `targetLabel`/`sourceLabel` by direction (as `toAttachment`), actor = `createdBy`.
  - Call sites: today Generic builds `selectedRelations` from `listRelations` (GenericSrsShell ~305-310) and no shell calls `contextRecord` except essay (`essay-document.ts:280`). Phase 5 adds a `contextRecord` call on selection in each shell. `selectedRecord` (Generic ~241), the Governance selected decision and the Guides selected section all have the instanceId, and `repo` is in scope, so `ContextRelation` is reachable from Generic's selection path with no new binding.
  - The `attachment` grouping (neighbour-kind presentation) stays essay-only: it is a client presentation grouping by neighbour kind and is never inferred from SRS semantics.
- [ ] Mark the rendered containers with `data-srs-instance="<uuid>"`.
- [ ] Comment creation in these shells uses `addComment`. Hidden entirely when `!commentsAvailable(repo)` (no disabled UI).
- [ ] **Write guard.** KNOWN, ACCEPTED GAP: non-essay shells have no agent write guard. Pre-existing; this phase does not widen it. The e2e goes in `e2e/essay-write-guard.spec.ts` with the essay open. Asserted: (1) an agent `record_create` of a comment plus `relation_create` of `com.mudemocracy.essay/comments-on` targeting a **non-paragraph instance** (e.g. the essay record) succeeds, producing a comment record and the relation; (2) an agent `record_update` of a guarded paragraph's text is refused. For a non-guarded, non-paragraph instance the test asserts that an agent `record_update` is **allowed** and the test comment states this is the documented known gap.
- [ ] **Multi-agent presence:** `AgentFeed` rows use `ActorMark` plus name text; `McpConnection` rows keep the full chip (a name must be read) and gain the compact mark in the header; an `ActorStack` (`data-testid="actor-stack"`) of connected agents in a `data-testid="presence"` strip in the Agents panel header and essay rail. Source: `agentStatus.agents[]` (no data-model change), plus a per-agent status dot.
- [ ] e2e extending `e2e/agent-channels.spec.ts`: three agents (the relay is mocked and accepts any N) comment on one instance; assert distinct names and distinct shapes by kind; assert hue only for fixed ids known to produce different hues.
- [ ] e2e on `essay.srsj` and `gallery.srsj` for the non-essay adoption.

#### Acceptance Criteria

- [ ] Gallery (no comment package): inspector shows the engine's relations but no comment UI and no console error; essay corpus: comments work on a non-paragraph instance; every `context_record` relation except `comments-on` appears with label, direction, neighbour title and actor.
- [ ] The `e2e/essay-write-guard.spec.ts` assertions above pass.
- [ ] Selector disposition for this phase: `agent-feed*` and `mcp-*` testids unchanged; `actor-name` in `AgentFeed` rows re-pointed to `actor-mark` with accessible name "alpha (agent)" (agent-channels:371, AgentFeed.test); `actor-name` in `McpConnection` unchanged.
- [ ] No regression in `navigation.spec.ts`, `mobile-layout.spec.ts`.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/agent-channels.spec.ts e2e/essay-write-guard.spec.ts e2e/navigation.spec.ts e2e/mobile-layout.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Commands above pass. 3. Tick boxes. 4. Commit: `feat: annotations and comments in every shell; per-agent presence (#422)`.

---

### Phase 6: Styleguide, e2e, docs

**Goal:** every state is a specimen; docs match the code.

**Agent:** Web App Worker, then Verification

#### Tasks

- [ ] `Styleguide.svelte` + fixtures: Actors section with compact and full side by side for 1 human + 3 agents, `ActorStack` (3, 6 actors), unattributed. Annotations section: compact / expanded / narrow-inline; paragraphs with 0, 1, 4, 10 annotations; long labels. Comments: long agent review plus short replies; 25 comments (earlier collapsed); grouped same-author runs; markdown; empty; needs-name.
- [ ] `e2e/styleguide.spec.ts`: no console errors; sections render in both themes; no hard-coded colour under the demo theme for the new marks (the existing computed-style check).
- [ ] Docs: ADR-020 part table rows (`ActorMark`, `ActorStack`, `CommentThread`, `AnnotationMargin`) and the new tokens; `src/styles/README.md` token list; `src/lib/components/README.md` (rename ParagraphMargin; list new components). No new ADR.
- [ ] Update this plan's checkboxes.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/styleguide.spec.ts e2e/essay-comments.spec.ts e2e/agent-channels.spec.ts e2e/annotation-margin.spec.ts e2e/essay-write-guard.spec.ts e2e/essay-editor.spec.ts e2e/mobile-layout.spec.ts e2e/navigation.spec.ts
```

#### Final Acceptance

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
- [ ] `npx playwright test e2e/styleguide.spec.ts e2e/essay-comments.spec.ts e2e/agent-channels.spec.ts e2e/essay-editor.spec.ts e2e/mobile-layout.spec.ts e2e/navigation.spec.ts` green.
- [ ] `grep -rn "anon" src` shows no actor-name fallback; no raw `hsl(` outside tokens and the shared `.hue-pill` rule set.
- [ ] WASM loads and calls succeed against `gallery.srsj` and `essay.srsj`.

#### Milestone gate

1. All criteria met. 2. Verification agent signs off. 3. Commit: `docs/test: styleguide states, e2e and ADR-020 parts for agent participation (#422)`. Agents push the branch only; owner reviews the diff before the PR. (Verification audits; the worker commits.)

---

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only and commits at each milestone gate; Verification audits each gate. No SRS semantics in TS (ADR-001); a missing WASM capability is a srs-rust issue, not TS inference.
- Agents never write essay text (owner ruling); the write guard code is untouched.
- Owner chain steps are never edited by agents.
- Verification Agent runs after each gate.

## Assumptions

- Feature detection by the essay package's type id and relation key is the decided approach (D4); revisit when a shared comment package is wanted (not filed as an issue) (the constants are essay-namespaced but now live in `src/lib/comments.ts`; `essay/type-registry.ts` imports them).
- `context_record` supplies relation `createdBy` for attachments (#1246 in the schema). If a read that the margin needs lacks it, name the missing field and file a srs-rust issue.
- Relay concurrency beyond two channels is unverified (relay repo not in the workspace; the e2e relay is mocked). Manual live-relay check with 3 agents before sign-off; the proposed upstream issue (Investigation 2) is filed only if it fails.
- Lucide icon names are verified against the installed package before use.
- Late review adjustment 1 (MarkdownView): the single `{@html renderMarkdown(...)}` site rule covers `CommentThread` and `PinnedPane` through the new read-only `src/lib/components/MarkdownView.svelte`. `MarkdownText` keeps its own render on its contenteditable element as a documented exception: it is an editor, and moving it would change `Block`'s DOM. The grep acceptance excludes `MarkdownText.svelte` explicitly.
- Late review adjustment 2 (STRUCTURAL_CATEGORIES): it moves to `src/lib/annotations.ts`; `essay-document.ts` imports it from there, and no non-essay file imports from `essay/`.
- `N = 8` earlier-comments threshold, 6-line clamp, `24rem` thread max are defaults on tokens/consts and tunable.

## Decided by owner 2026-10-04

- **D1 Thread placement: A.** Inline under the paragraph, bounded with internal scroll. `CommentThread` stays placement-agnostic so #426 can move it to the rail.
- **D2 Shape: A.** Human = circle; agent = rounded square with a corner notch. (ADR-020 rule written in Phase 1.)
- **D3 Kind icons: A.** One fixed client map (`annotation-icons.ts`) keyed by the data key, with a fallback icon. (ADR-020 rule written in Phase 4.)
- **D4 Comment type scope: essay-only for now.** No promotion issue. Phase 5: Generic/Governance/Guides show comments only where `commentsAvailable(repo)` is true; attachments, relations and shared annotations show everywhere. "Revisit when a shared package is wanted" is an Assumption, not a filed issue.
