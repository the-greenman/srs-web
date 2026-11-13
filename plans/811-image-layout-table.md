# Plan: De-duplicate image layout rules (srs-web#811)

> **Usage note:** The purpose of a plan file is to be reviewed and executed by agents. Write it with that reader in mind: unambiguous tasks, explicit file paths, named functions, checkable acceptance criteria. A plan that requires human interpretation at execution time is incomplete.

## Summary

`imageFigureHtml` in `src/lib/essay/image-paragraph.ts` (srs-web#766) hand-computes inline CSS
(margin/width literals) for image layout (full-width vs. original size; left/centre/right alignment)
for the "Copy as HTML" pasted output. This duplicates the same layout rule already expressed as CSS
classes (`src/styles/components/image-paragraph.css`) via `imageClasses()` in the same file. Pure DRY
refactor: introduce one shared lookup table that both `imageClasses()` and `imageFigureHtml()` read,
so the rule is authored once. No visual or behavioural change.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (this session) |
| Web App Worker | Claude (this session) |
| Verification | Claude (this session) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | n/a — this is presentation layout, not SRS semantics; no WASM/core involvement |
| [ADR-027](../docs/adr/027-editor-layers.md) | layer discipline: headless logic has no markup, no `document` | satisfied — `image-paragraph.ts` is already headless; the new table stays in that same headless module, consumed by both the component (`ImageParagraph.svelte`, via `imageClasses`) and the Copy-as-HTML path (`imageFigureHtml`). No look change, so no `/styleguide` step applies. |

No new ADR: this does not establish a new constraint, reject an alternative, or change a prior
decision — it collapses two hand-authored copies of an existing, unchanged rule into one.

---

## Contracts

### WASM API surface

**No.** This is a pure TypeScript refactor inside `src/lib/essay/image-paragraph.ts`. No new or
changed WASM method; no srs-rust dependency.

### TypeScript types

No change to any WASM-derived TS type. `ImageSize`/`ImageAlign`/`ImageSpec` (already defined in this
file) are unchanged in shape; only the internal implementation of `imageClasses` and `imageFigureHtml`
changes.

---

## Scope

- `src/lib/essay/image-paragraph.ts`: add a shared, private layout table (`IMAGE_LAYOUTS`, keyed by
  `"full" | ImageAlign`) holding, per layout option, the CSS class suffix(es), the inline `<img>`
  width/margin, and the caption's inline `text-align` value. Rewrite `imageClasses()` and
  `imageFigureHtml()` to read from it instead of each computing their own literals.
- `tests/image-paragraph.test.ts`: keep all existing assertions passing byte-for-byte (they already
  pin exact class strings and exact inline style strings). Add a test that iterates the four layout
  options and asserts `imageClasses()` and `imageFigureHtml()` agree with each other (i.e. are visibly
  derived from one table), not just with a hand-written expectation.

**Out of scope:**

- Any change to `src/styles/components/image-paragraph.css` (the CSS stays exactly as-is; the table's
  values must continue to match it, but the CSS is not restructured).
- Any change to `ImageParagraph.svelte`, `ImageParagraphEditor.svelte`, or `essay-document.ts` (they
  call `imageClasses`/`imageFigureHtml` and are unaffected by the internal refactor).
- Any change to the e2e test `220c54d` ("every SVG in Copy as HTML is an `<img>` data URL") — it must
  keep passing unmodified.

---

## Phases

### Phase 1: Shared layout table + refactor

**Goal:** `imageClasses` and `imageFigureHtml` both read layout values (class suffix, inline width,
inline margin, caption align) from one table; no behaviour change.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/essay/image-paragraph.ts`, add a private `ImageLayoutRule` interface and a
      `IMAGE_LAYOUTS: Record<"full" | ImageAlign, ImageLayoutRule>` table with one entry per layout
      option (`full`, `left`, `centre`, `right`), each carrying: the figure's full class string (what
      `imageClasses` returns today), the inline `<img>` `width` declaration (`"width:100%;"` or `""`),
      the inline `<img>` `margin` declaration, and the caption's inline `text-align` value.
- [ ] Add a small helper `layoutKeyFor(size: ImageSize, align: ImageAlign): "full" | ImageAlign` that
      both consumers call, so the "full-width ignores align" rule is itself written once.
- [ ] Rewrite `imageClasses()` to return `IMAGE_LAYOUTS[layoutKeyFor(size, align)].className` (name
      TBD during implementation to match existing style).
- [ ] Rewrite `imageFigureHtml()` to look up the same table entry and use its `width`/`margin`/
      `captionAlign` fields in place of the current inline `{left:…, centre:…, right:…}` object
      literals.
- [ ] Verify every literal value carried over unchanged (no accidental value change): full-width
      width `"width:100%;"`, margin `"0 auto"`; left margin `"0 auto 0 0"`; centre margin `"0 auto"`;
      right margin `"0 0 0 auto"`; caption align `"left"`/`"center"`/`"right"` matching
      `image-paragraph.css`'s `.image-paragraph--{left,centre,right} .image-paragraph__caption` rules.

#### Acceptance Criteria

- [ ] All existing assertions in `tests/image-paragraph.test.ts` pass unchanged (exact class strings,
      exact inline style substrings).
- [ ] `imageClasses` and `imageFigureHtml` share one table — no second hand-written copy of
      class-suffix/width/margin literals remains in the file.
- [ ] `npm run typecheck` passes.
- [ ] No regression in `ImageParagraph.svelte` rendering (reading view) or Copy-as-HTML output.

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
3. Update this plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#811)`).

---

### Phase 2: Consistency test

**Goal:** A test exists that would fail if a future edit re-introduces a second, drifting copy of the
layout rule.

**Agent:** Web App Worker

#### Tasks

- [ ] In `tests/image-paragraph.test.ts`, add a test (e.g. `describe("imageClasses and
      imageFigureHtml share one layout table", …)`) that, for each of the four layout options, derives
      the expected inline `width`/`margin` from the same values asserted in the existing
      `imageClasses` table test, and checks `imageFigureHtml`'s output contains them — i.e. a change
      to one without the other breaks this test.
- [ ] Confirm the pre-existing srs-web#766 "copies as HTML with the reading view's layout" test still
      passes unchanged.
- [ ] Confirm the e2e test covering "every SVG in Copy as HTML is an `<img>` data URL" (`220c54d`)
      still passes unchanged.

#### Acceptance Criteria

- [ ] New consistency test passes.
- [ ] All pre-existing image-paragraph unit tests pass unchanged.
- [ ] Relevant e2e test(s) pass unchanged.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run e2e
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run the full test command above.
3. Mark checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#811)`).

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all existing + new tests)
- [ ] `npm run e2e` passes, including the image-related specs
- [ ] Rendered output (live reading view and Copy-as-HTML) is pixel-identical to before the change —
      confirmed by the unchanged byte-level test assertions plus a Stage 7.6 dogfooding pass

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only — this plan touches exactly one source file and one test
  file.
- No SRS semantics in TypeScript (ADR-001) — not applicable; this is presentation-layer deduplication.
- Verification Agent runs after each phase and before final sign-off.

## Assumptions

- The CSS file (`src/styles/components/image-paragraph.css`) is not touched; the shared table's values
  are chosen to match it exactly as it stands today, not the other way around.
- No change to any component prop, export signature, or WASM-facing type — `imageClasses` and
  `imageFigureHtml` keep their existing public signatures.
