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

- A new pure helper, `src/lib/components/markdown-caret.ts`:
  - `mapRenderedOffsetToSource(source: string, renderedText: string, renderedOffset: number): number`
    — two-pointer walk matching `renderedText` characters against `source` characters in
    order; a source character that doesn't match the next expected rendered character is
    treated as stripped markup and skipped. Handles bold/italic markers, inline code
    backticks, and link syntax (`[text](url)` — url and brackets skipped, link text matched).
  - `renderedOffsetAtPoint(container: HTMLElement, x: number, y: number): number | null`
    — uses `document.caretRangeFromPoint` (Chromium/WebKit) with a
    `caretPositionFromPoint` fallback (Firefox) to find the DOM position under a click,
    then measures the rendered-text length from the start of `container` to that point.
    Returns `null` if the point can't be resolved inside `container`.
- `MarkdownText.svelte`:
  - `renderClick` captures the click point (before `editing = true`) and computes a pending
    source offset via the two helpers above; stores it in a module-local `$state`.
  - The entry `$effect` consumes a pending offset if present (placing the caret there via a
    `Range` on the single text node `el.textContent = value` produces) instead of always
    calling `collapseToEnd()`; clears the pending offset after use. Keyboard entry (no
    pending offset) keeps today's `collapseToEnd()` behaviour.
- Regression coverage:
  - `tests/markdown-caret.test.ts` — unit tests for `mapRenderedOffsetToSource` (plain
    text, bold, link, inline code, click past the end, click at 0).
  - `e2e/essay-editor.spec.ts` — a new test: click mid-paragraph (plain text and a
    paragraph containing `**bold**`/a link), then Ctrl-Enter, asserts the split happens at
    the clicked point, not at the end.

**Out of scope:**

- Multi-line (soft-break / `\n`) click mapping. CommonMark soft breaks render as a literal
  newline character inside the `<p>`, which browsers collapse visually to whitespace, so a
  click inside a wrapped multi-line *single* paragraph is not pixel-distinguishable from
  index-based mapping edge cases beyond what two-pointer matching already handles for
  plain runs of text; no acceptance criterion in #595 covers it, and the existing
  Ctrl-Enter multi-line e2e coverage (`essay-editor.spec.ts:562-575`) exercises typing, not
  clicking, so it is unaffected. If a real gap surfaces here later, file a follow-up issue
  rather than widening this PR.
- `AnnotationMargin` / other contenteditable surfaces that are not `MarkdownText.svelte`.
- Firefox-specific `caretPositionFromPoint` exact pixel semantics (Playwright's default
  Chromium path uses `caretRangeFromPoint`; the Firefox branch is defensive, not tested
  in CI, since the project's e2e suite runs on Chromium — consistent with the rest of the
  suite).

---

## Phases

### Phase 1: Source-offset mapping helper

**Goal:** A pure, unit-tested function maps a rendered-text offset back to a source
markdown offset, covering bold/link/code stripping.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `src/lib/components/markdown-caret.ts` with `mapRenderedOffsetToSource` and
  `renderedOffsetAtPoint`.
- [ ] Add `tests/markdown-caret.test.ts` covering: identical plain text, `**bold**`,
  `[text](url)`, `` `code` ``, offset 0, offset at/past the end, offset inside the markup
  run itself (e.g. right after the closing `**`).

#### Acceptance Criteria

- [ ] `mapRenderedOffsetToSource` returns the correct source index for each covered case.
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (new file only touched so far)

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

- [ ] In `renderClick`, before setting `editing = true`, resolve the click point to a
  rendered-text offset (`renderedOffsetAtPoint` against `e.currentTarget`) and map it to a
  source offset (`mapRenderedOffsetToSource`); stash it in a `$state` field (e.g.
  `pendingCaret: number | null`).
- [ ] In the entry `$effect`, if `pendingCaret !== null`, place the caret there (clamp to
  `[0, el.firstChild?.length ?? 0]`) via a `Range`/`Selection`, then clear `pendingCaret`;
  otherwise keep the existing `selectAllChildren` + `collapseToEnd()`.
- [ ] Keep `renderKeydown`'s Enter path untouched — it never sets `pendingCaret`, so it
  keeps landing at the end.

#### Acceptance Criteria

- [ ] Clicking mid-paragraph, then Ctrl-Enter, splits at the clicked point (not the end).
- [ ] Pressing Enter on a rendered paragraph still lands the caret at the end.
- [ ] Ctrl/Cmd+click on a link still opens the link (unchanged `renderClick` early return).
- [ ] `npm run typecheck` passes
- [ ] No regression in the existing Ctrl+Enter / Ctrl+Z e2e test (`essay-editor.spec.ts:539`).

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
