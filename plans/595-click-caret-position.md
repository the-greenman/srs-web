# Plan: Clicking a rendered paragraph places the caret at the click point

## Summary

`MarkdownText.svelte` enters edit mode on click but always collapses the caret to the
**end** of the text (`collapseToEnd()` in its entry `$effect`), regardless of where the
user clicked. This makes Ctrl-Enter (split-at-caret) always behave as if invoked at the
end, so a click-then-Ctrl-Enter workflow can never split mid-paragraph (srs-web#595).
Keyboard entry (pressing Enter on the rendered view) should keep placing the caret at
the end — only a click should aim for the clicked point, mapped through any inline
markdown (bold, links, code) back to the matching offset in the raw source text.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Verification Agent (srs-web) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted (unaffected — this is DOM/caret presentation logic, not SRS semantics; no record/relation/validation code involved) |

No new ADR needed: this plan does not establish a new architectural constraint. It is a
local bugfix to a presentation-only mechanism (caret placement in a contenteditable),
the same category as the existing `caretSplit`/`atEdgeLine` helpers in `Block.svelte`.

---

## Contracts

### WASM API surface

**No.** `renderMarkdown` (`srs-client.ts`) already returns sanitized HTML; it carries no
source-position metadata, and none is needed. The mapping from a point in the *rendered*
HTML back to an offset in the *raw markdown source* is pure client-side text matching
(the same kind of DOM/Range logic `Block.svelte` already does for `caretSplit`), not an
SRS semantic. No new or changed WASM binding is required.

### TypeScript types

None — no WASM output shape changes.

---

## Scope

> **Revised after plan review** (two findings changed the design; see "Plan review
> findings and responses" below for the full list):
> the mapper is a one-sided tokenizer over the *source* (not a two-pointer match against a
> separately-supplied rendered string), and the click point is captured on **mousedown**,
> not `click`.

- A new pure helper, `src/lib/components/markdown-caret.ts`:
  - `stripInlineMarkdown(source: string): { text: string; sourceOffsets: number[] }` — scans
    `source` once, recognising `**bold**`/`__bold__`, `*italic*`/`_italic_`, `` `code` ``,
    `[text](url "title")`, and backslash escapes; emits the plain text those constructs
    render as, and, in a parallel array, the source index each emitted character came from.
    Nested constructs (e.g. a bold link) recurse over the inner span. Anything unrecognised
    (including block-level markdown — headings, lists, blockquotes) passes through literally
    as its own characters, which is the documented degradation (see Out of scope).
  - `mapRenderedOffsetToSource(source: string, renderedOffset: number): number` — clamps
    `renderedOffset` into `[0, text.length]` and returns `sourceOffsets[clamped]` (or
    `source.length` at the very end). Deterministic and total: every offset in range maps to
    a valid source index, there is no "degraded match" state to handle.
  - `renderedOffsetAtPoint(container: HTMLElement, x: number, y: number): number | null` —
    uses `document.caretRangeFromPoint` (Chromium/WebKit) with a `caretPositionFromPoint`
    fallback (Firefox) to find the DOM position under a point, checks `container.contains`
    on the resolved node, then returns `Range.toString().length` from the start of
    `container` to that point. Returns `null` if the point can't be resolved inside
    `container` — the caller's fallback is the existing end-of-text caret (no pending offset
    is set, so the entry effect's `else` branch runs unchanged).
- `MarkdownText.svelte`:
  - A new `onmousedown={renderMouseDown}` handler on the `__render` div, which runs *before*
    the browser's default mousedown action focuses the element (and `onfocus` flips `editing`
    to true, swapping the div out of the DOM — this happens before `click` would ever fire on
    it, which is also srs-web#596's root cause). For a Ctrl/Cmd+click on a link it
    `preventDefault()`s so focus never happens and `renderClick`'s existing link-opening logic
    still runs on the subsequent `click`; otherwise it resolves the point to a source offset
    via the two helpers above and stores it in component-instance state, `pendingCaret:
    number | null` (an ordinary `$state` field on the component, not `<script module>`).
  - The entry `$effect` reads `pendingCaret` through `untrack()` (matching the existing
    `untrack(() => value)` pattern) so clearing it back to `null` at the end of the effect
    does not register as a dependency and re-trigger the effect — re-running would reset
    `el.textContent` and recompute the caret from scratch, undoing the placement. If
    `pendingCaret` is non-null, it places the caret there (clamped to `[0, value.length]`)
    via a `Range` on the single text node `el.textContent = value` produces; otherwise it
    keeps today's `selectAllChildren` + `collapseToEnd()`. Keyboard entry (`renderKeydown`'s
    Enter path) never sets `pendingCaret`, so it is unaffected.
- Regression coverage:
  - `tests/markdown-caret.test.ts` — unit tests for `stripInlineMarkdown`/
    `mapRenderedOffsetToSource`: plain text identity, bold, italic, code, a link (confirming
    URL characters are never mistaken for content — the case the original two-pointer design
    got wrong), backslash-escaped delimiters, literal `&`/`<`, an unterminated construct,
    offset 0 / past-the-end / negative clamping, and a round-trip monotonicity check across a
    mixed-markdown paragraph.
  - `e2e/essay-editor.spec.ts` — a new test using a helper that resolves a character offset
    to a live on-screen point (via `Range.getClientRects()` in `page.evaluate`, then
    `page.mouse.click`) so the click lands at an exact, deterministic character position
    regardless of font metrics: click mid-paragraph (plain text and a paragraph containing
    `**bold**`/a link), then Ctrl-Enter, asserting the split happens at the clicked point;
    plus a check that Enter-to-edit still lands the caret at the end, and that typing after a
    click inserts at the click point.

**Out of scope:**

- Block-level markdown (headings, lists, blockquotes, code fences) inside a paragraph body.
  `stripInlineMarkdown` only recognises inline constructs; an unrecognised block prefix (e.g.
  `# `, `- `, `> `) passes through as literal text, which can offset the mapped caret by the
  prefix's length. This never throws and never lands outside the clicked paragraph — it is a
  bounded, accepted degradation, not a crash risk — and the issue's acceptance criteria only
  require bold/link fidelity. File a follow-up issue if this proves to matter in practice.
- Hard line breaks (`<br>` from a trailing double-space or backslash before `\n`). A
  **soft** break (plain `\n` inside one paragraph) needs no special handling: pulldown-cmark
  renders it as a literal `\n` character, which is also what `stripInlineMarkdown` emits for
  an unrecognised character, so it maps 1:1 for free. A **hard** break becomes a `<br>`
  element with no corresponding character in the rendered DOM text, which this mapper does
  not model; clicking the line after a hard break can therefore be off by the dropped
  newline. No acceptance criterion in #595 covers this; the existing Ctrl-Enter multi-line
  e2e coverage (`essay-editor.spec.ts:562-575`) exercises typing, not clicking, so it is
  unaffected either way.
- `AnnotationMargin` / other contenteditable surfaces that are not `MarkdownText.svelte`.
- Firefox-specific `caretPositionFromPoint` exact pixel semantics (Playwright's default
  Chromium path uses `caretRangeFromPoint`; the Firefox branch is defensive, not tested
  in CI, since the project's e2e suite runs on Chromium — consistent with the rest of the
  suite).

### Plan review findings and responses

Two reviewers ran in parallel on the original draft (two-pointer matcher, click-time
capture). Blocking/should-fix findings and how each was resolved:

1. **Blocking (Plan Reviewer): mouse entry may bypass `renderClick`.** The render div's
   `onfocus` flips `editing` to true on the browser's default mousedown-triggered focus,
   before `click` fires — so capturing the point in `renderClick` is unreliable (and is
   srs-web#596's root cause for the same reason). **Resolved:** capture on `mousedown`
   instead (`renderMouseDown`); see Scope above.
2. **Blocking (Plan Reviewer): effect self-retrigger.** Reading `pendingCaret` as a tracked
   dependency inside the entry `$effect` and then clearing it would re-run the effect,
   undoing the placement. **Resolved:** read it through `untrack()`.
3. **Blocking (Plan Reviewer): the two-pointer mapper's "skip on mismatch" rule lets URL
   characters coincidentally match upcoming rendered text**, e.g. `[a](xc)c` could map into
   the URL. **Resolved:** replaced the two-pointer matcher with the one-sided
   `stripInlineMarkdown` tokenizer, which never looks at an externally-supplied rendered
   string at all — it only ever walks its own recognised constructs in `source`, so there is
   no coincidental-match failure mode. Covered by a dedicated unit test.
4. **Should-fix (both): contract gaps / instance-vs-module state.** Resolved by the
   redesign above — `mapRenderedOffsetToSource` no longer takes a separate `renderedText`
   parameter (removing the ambiguity about which "rendered text" definition it meant), and
   `pendingCaret` is explicit component-instance `$state`.
5. **Should-fix (Plan Reviewer): Final Acceptance criteria had no corresponding task/test.**
   Resolved: added explicit e2e tasks (Scope above) for "typing after a click inserts at the
   click point" and "Enter still lands at end".
6. **Should-fix (Plan Reviewer): multi-line rationale was imprecise** — soft breaks map fine;
   the real gap is hard breaks (`<br>`). Resolved: Out of scope section above now says this
   precisely.
7. **Should-fix (Plan Reviewer): e2e spec needed a precise click mechanism.** Resolved:
   Scope above specifies the `Range.getClientRects()` + `page.mouse.click` helper.
8. **Nit (Plan Reviewer): add `&`/escape unit cases.** Added.
9. **Should-fix (Architecture Reviewer): maintenance-risk note.** `markdown-caret.ts`
   re-derives knowledge of the same inline syntax the Rust core's markdown parser already
   fully implements; if that grammar grows (footnotes, strikethrough, etc.) this heuristic
   can silently drift. Noted here (and in the module's own doc comment) as a maintenance
   risk parallel to ADR-001's "Residual TypeScript-semantics debt" section — not a blocker
   for this fix, since it only needs to agree on the handful of constructs #595's acceptance
   criteria name (bold, a link), but a reason to prefer small, explicit construct handling
   (as implemented) over cleverness that would make a future drift harder to spot.
- **Should-fix (Architecture Reviewer): e2e click-positioning mechanism was unspecified.**
  Same resolution as item 7 above.
- **Should-fix (Architecture Reviewer): untested block-level markdown.** Resolved by the
  explicit Out of scope entry above (block-level markdown).
- **Should-fix (Architecture Reviewer): no stated fallback for a degraded mid-walk match.**
  Resolved by the redesign in item 3: `stripInlineMarkdown`/`mapRenderedOffsetToSource` are
  total functions with no partial/degraded state to fall back from.

---

## Phases

### Phase 1: Source-offset mapping helper

**Goal:** A pure, unit-tested function maps a rendered-text offset back to a source
markdown offset, covering bold/link/code stripping.

**Agent:** Web App Worker

#### Tasks

- [x] Add `src/lib/components/markdown-caret.ts` with `stripInlineMarkdown`,
  `mapRenderedOffsetToSource`, and `renderedOffsetAtPoint` (tokenizer-based design — see
  "Plan review findings and responses" above).
- [x] Add `tests/markdown-caret.test.ts` covering: identical plain text, `**bold**`,
  `*italic*`/`_italic_`, `` `code` ``, a link (including the URL-bleed regression case),
  backslash escapes, literal `&`/`<`, an unterminated construct, offset 0 / negative /
  past-the-end clamping, and a monotonicity round-trip over mixed markdown.

#### Acceptance Criteria

- [x] `mapRenderedOffsetToSource` returns the correct source index for each covered case.
- [x] `npm run typecheck` passes
- [x] `npm test` passes (new file only touched so far)

#### Testing

```bash
npm run typecheck
npm run lint
npm test -- markdown-caret
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#595)`).

---

### Phase 2: Wire click-to-caret into `MarkdownText.svelte`

**Goal:** Clicking a rendered paragraph enters edit mode with the caret at the clicked
point (mapped through markdown); pressing Enter still goes to the end.

**Agent:** Web App Worker

#### Tasks

- [x] Add `renderMouseDown`, wired as `onmousedown` on the `__render` div — runs before the
  default mousedown-triggered focus (see finding #1 above). Ctrl/Cmd+click on a link
  `preventDefault()`s to keep focus from happening; otherwise resolves the point via
  `renderedOffsetAtPoint`/`mapRenderedOffsetToSource` and stores it in `pendingCaret:
  number | null` (component-instance `$state`).
- [x] In the entry `$effect`, read `pendingCaret` via `untrack()` (finding #2 above); if
  non-null, place the caret there (clamped to `[0, value.length]`) via a `Range`/`Selection`
  on `el.firstChild`, then clear `pendingCaret`; otherwise keep the existing
  `selectAllChildren` + `collapseToEnd()`.
- [x] Left `renderKeydown`'s Enter path untouched — it never sets `pendingCaret`, so it
  keeps landing at the end.
- [x] Left `renderClick`'s Ctrl/Cmd-click-opens-link branch in place — it still runs on
  `click`, now reachable because `renderMouseDown` kept focus (and the DOM swap) from
  happening first.

#### Acceptance Criteria

- [x] Clicking mid-paragraph, then Ctrl-Enter, splits at the clicked point (not the end).
- [x] Pressing Enter on a rendered paragraph still lands the caret at the end.
- [x] Ctrl/Cmd+click on a link still opens the link (now via `renderMouseDown` keeping focus
  from pre-empting `click`).
- [x] `npm run typecheck` passes
- [ ] No regression in the existing Ctrl+Enter / Ctrl+Z e2e test (`essay-editor.spec.ts:539`)
  — verified in Phase 3's e2e run (`npm run e2e` touches the whole file).

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#595)`).

---

### Phase 3: e2e regression coverage

**Goal:** A Playwright test proves the click-then-split behaviour end to end, including
through markdown (bold, a link).

**Agent:** Web App Worker

#### Tasks

- [ ] Add a test in `e2e/essay-editor.spec.ts` near the existing Ctrl-Enter test: type a
  paragraph, click mid-text in its **rendered** form (not via keyboard caret movement),
  Ctrl-Enter, assert the split point matches the click.
- [ ] Add a variant where the paragraph contains `**bold**` text and/or a markdown link,
  clicking inside/after the bold/link span, asserting the split lands at the matching
  source position.

#### Acceptance Criteria

- [ ] `npm run e2e` passes, including the new tests.
- [ ] Existing `essay-editor.spec.ts` tests still pass (no regression).

#### Testing

```bash
npm run build
npm run e2e
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Commit with a message referencing the issue (`... (#595)`).

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] WASM loads and all WASM API calls succeed against `gallery.srsj`
- [ ] `npm test` passes
- [ ] `npm run e2e` passes, including the new click-to-split tests
- [ ] Clicking mid-paragraph (plain text, bold text, a link) and pressing Ctrl-Enter
  splits at the clicked point; typing after a click inserts at the click point; pressing
  Enter on the rendered view still lands the caret at the end.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001) — this plan adds none; the new helper is pure
  DOM/text mapping, not SRS semantics.
- Verification Agent runs after Phase 2/3 and before final sign-off.

## Assumptions

- Playwright's e2e suite runs on Chromium, where `document.caretRangeFromPoint` is
  available; the `caretPositionFromPoint` (Firefox) branch is defensive and not exercised
  by CI, matching the rest of the project's browser-coverage posture.
- The two-pointer greedy match is a heuristic, not a full CommonMark-aware mapper. It is
  sufficient for the acceptance criteria (bold, a link) and for plain text; pathological
  markdown where literal text coincidentally echoes stripped syntax is an accepted
  edge-case limitation, not a regression target.
