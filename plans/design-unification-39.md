# Plan: Design Unification — Governance Reading View, Guides Shared Shell, HTML Preview

> Issue: [srs-web#39](https://github.com/the-greenman/srs-web/issues/39)
> Revised after review round 1 (2026-06-08)

## Summary

Three design problems identified in a design review are addressed in one feature branch. The governance
editor's wide centre column is near-empty (title-only cards) while field content is crammed into the
320px inspector — this is backwards. The guides editor uses a bespoke 2-pane shell with a blue accent and
inline CSS rather than the shared design-token system. And the guides editor has no live preview even
though `render_service` already supports HTML output with zero Rust changes. All three are fixed in
`srs-web/**` only — no spec change, no Rust change.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | — |
| Verification | — |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TypeScript; all mutations/renders through WASM | accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | Blueprint drives authoring; Document Views drive rendering. Preview is a render-surface concern, separate from the blueprint-driven editor. | accepted |

No new ADRs needed. Phase C (HTML preview) is explicitly called out as future work in ADR-003 ("a live
in-editor preview... is a render-surface concern... would be a new issue"). This plan is that new issue.

**On `RecordReading.svelte` and ADR-001:** `RecordReading` takes a `TypeFormDef` to look up display
labels for field IDs — this is _presentation_ metadata only. The component renders `record.fieldValues`
directly (as returned by WASM); the `TypeFormDef` provides human-readable labels. It does not construct
or validate records. This is the same pattern as the existing inspector; `TypeFormDef` is a static label
registry, not a re-implementation of SRS semantics.

---

## Contracts

### WASM API surface

**No new WASM methods required.** All calls use existing bindings:
- `renderDocumentView(repo, viewId, "html", containerId)` — already supported. The `format` parameter is
  typed `string` in `srs-client.ts` and passed through to the WASM unchanged.

**Verified (srs-client.ts lines 434–438):**
```typescript
export interface DocumentViewResult {
  rendered: string;        // present for all formats; contains HTML fragment for format="html"
  diagnostics: string[];
  projection: unknown | null;  // non-null only for format="json"
}
```
`result.rendered` is the correct field for the HTML fragment. `result.projection` is NOT used for HTML.

### TypeScript types

No changes to payload types. Update the docstring on `renderDocumentView` in `srs-client.ts` line 441
to document `"html"` as a supported format that returns the rendered HTML in `result.rendered`.

---

## Scope

- **Phase A:** New `RecordReading.svelte` component; `App.svelte` centre shows full reading view when
  record is selected; inspector stripped to meta/actions/lifecycle/validation only.
- **Phase B:** `GuidesShell.svelte` rewritten to use `AppShell`/`Nav`/`Main`/`Topbar`/`Workspace`/`Inspector`/`Card`/`Button`;
  bespoke CSS deleted; design tokens applied. `SectionForm.svelte` focus ring aligned to tokens.
- **Phase C:** New `PreviewPane.svelte` (`<iframe srcdoc>`); wired into `GuidesShell.svelte`; reactive
  HTML render via `renderDocumentView(..., "html", containerId)` (using the already-defined
  `GUIDE_VIEW_ID = "2aba4d85-317b-44e1-a600-d38a743b4cb4"` in `GuidesShell.svelte`); visible in
  `Inspector` slot on wide screens only (existing `@media (max-width: 1100px) .app__inspector { display: none }`
  in `layout.css` already hides `Inspector.svelte` — confirmed).

**Out of scope:**
- Drag-to-reorder sections (keep ▲▼ buttons).
- Markdown/PDF export (preview is HTML only).
- Theme/stylesheet selection for the preview iframe.
- Resizable rails.
- DecisionFlow visual enhancements.

---

## Phases

### Phase A: Governance — Reading View in the Centre Canvas

**Goal:** Selecting a record opens its full field content in the centre canvas; the inspector becomes
metadata/actions/lifecycle/validation only.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/RecordReading.svelte`:
  - Props:
    ```typescript
    schema: TypeFormDef      // from $lib/governance/form-schema.ts — provides field labels
    record: SrsRecord        // from $lib/srs-client.ts
    sectionLabel: string     // e.g. "Articles"
    onBack: () => void       // clears selectedId
    ```
  - Renders a back button: `<button data-testid="record-reading-back" class="reading__back" onclick={onBack}>← {sectionLabel}</button>`
  - Renders `<div data-testid="record-reading" class="reading">` with a `<Card>` (or plain heading) showing the record's title field, then below it one `<CardField>` per field from `record.fieldValues`:
    - For each `fv` in `record.fieldValues`: look up the label from `schema.fields.find(f => f.fieldId === fv.fieldId)?.label` — if no matching schema field, skip (unknown internal fields are not displayed)
    - If `typeof fv.value !== 'string' || fv.value === ''`, skip
    - Render `<CardField label={label}><span class="reading__text">{fv.value}</span></CardField>`
  - This renders the WASM-returned `fieldValues` in their natural order; the `schema` is used only for label lookup (presentation metadata, consistent with ADR-001)
  - Imports: `Card`, `CardField` from `$lib/components`; `TypeFormDef` from `$lib/governance/form-schema.js`; `SrsRecord` from `$lib/srs-client.js`
- [ ] Update `src/App.svelte` centre (`Workspace` slot):
  - Import `RecordReading` from `$lib/components/RecordReading.svelte`
  - In the workspace `{:else}` block (around line 489), add a branch at the top:
    ```svelte
    {#if selectedRecord && formMode === null}
      <RecordReading
        schema={GOVERNANCE_FORMS[activeSection]}
        record={selectedRecord}
        sectionLabel={activeSection_.label}
        onBack={() => { selectedId = null; }}
      />
    {:else}
      <!-- existing record list cards -->
      ...
    {/if}
    ```
  - The existing record list (Card rows) is shown when `!selectedRecord || formMode !== null`
  - The form is shown when `formMode !== null` (the form condition branch must remain at higher priority)
  - **Exact branching priority in the workspace (innermost to outermost):**
    1. `{#if formMode !== null && ...}` — form (unchanged, keep at top)
    2. `{:else if selectedRecord && formMode === null}` — reading view
    3. `{:else}` — record list + empty/add states
- [ ] Update `src/App.svelte` inspector (lines ~595–724):
  - Remove the per-section field blocks: the entire `{#if activeSection === "articles"}…{:else if activeSection === "decisions"}…{:else if activeSection === "roles"}…{:else}` chain inside the first `<InspectorSection>` (approximately lines 599–698)
  - Keep: `<InspectorSection title={...} aside={...}>` wrapper, the meta KV rows (ID, Created, approx. lines 699–708), the record actions div (Edit/Delete, lines 709–712), the lifecycle transitions block (lines 713–723)
  - Keep unchanged: `<InspectorSection title="Validation" ...>` and `<InspectorSection title="Repository" ...>`
- [ ] Update `e2e/gallery.spec.ts` — four tests need updating (lines 80–116):
  - **Article test (line 80–88):** Change `page.locator(".inspector__section").first()` to `page.locator('[data-testid="record-reading"]')` and assert it contains `"Article text"` (the field label)
  - **Decision test (line 92–98):** Same — assert `[data-testid="record-reading"]` contains `"Decision statement"`
  - **Role test (line 100–106):** Same — assert `[data-testid="record-reading"]` contains `"Role holder"`
  - **Deselect test (line 108–116):**
    - After first click: assert `[data-testid="record-reading"]` is visible (not inspector)
    - After deselect click: assert `[data-testid="record-reading"]` is NOT present (`not.toBeAttached()` or `not.toBeVisible()`)
    - Keep the existing final assertion that `.inspector__section.first()` (Validation section) remains — do NOT remove it; inspector Validation section is always visible

#### Acceptance Criteria

- [ ] Selecting an article shows `[data-testid="record-reading"]` in centre canvas containing "Article text", "Article Number", "Amendment Rule", "Rationale", "Protected status" labels (for non-empty fields)
- [ ] Selecting a decision shows `[data-testid="record-reading"]` containing "Decision statement", "Context", "Rationale" labels
- [ ] Selecting a role shows `[data-testid="record-reading"]` containing "Role holder", "Authority", "Boundary" labels
- [ ] Inspector does NOT contain the field body content (no "Article text" label in `.inspector__section`)
- [ ] Inspector still contains: ID, Created date, Edit/Delete buttons, lifecycle transitions, Validation section, Repository section
- [ ] Clicking `[data-testid="record-reading-back"]` clears selection and shows the record list again
- [ ] Edit still works: clicking Edit from the inspector opens the form
- [ ] Delete still works
- [ ] Lifecycle transitions still work
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Updated gallery e2e tests pass: `npx playwright test e2e/gallery.spec.ts`

#### Testing

```bash
cd srs-web
npm run typecheck
npm run lint
npm run build
npx playwright test e2e/gallery.spec.ts
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck`, `npm run lint`, and `npm run build` — all must pass.
3. Run `npx playwright test e2e/gallery.spec.ts` — must pass.
4. Mark completed task checkboxes `[x]`.
5. Commit with message `feat: governance reading view in centre canvas (#39)`.

---

### Phase B: Guides — Port to Shared Shell + Design Tokens

**Goal:** `GuidesShell.svelte` uses `AppShell`/`Nav`/`Main`/`Topbar`/`Workspace`/`Inspector`/shared
components and design tokens; bespoke `.guides-shell__*` CSS block is deleted; no blue accent.

**Agent:** Web App Worker

**Dependency:** Phase A must be merged before starting (inspector slot structure established).

**Pre-phase verification gate (do before any code changes):**
- Confirm `layout.css` line 110: `@media (max-width: 1100px) { .app__inspector { display: none } }` — already verified ✓
- Confirm `result.rendered` is typed `string` (not optional) in `DocumentViewResult` — already verified ✓

#### Tasks

- [ ] Rewrite `src/lib/guides/GuidesShell.svelte` template:
  - **Root element:** `<AppShell>` with `nav`, `main`, `inspector` snippet slots (same pattern as `App.svelte`)
  - **Imports to add:** `AppShell`, `Nav`, `NavItem`, `Main`, `Topbar`, `Workspace`, `Inspector`, `InspectorSection`, `Card`, `Button` from `$lib/components`
  - **Nav slot:**
    ```svelte
    {#snippet nav()}
      <Nav label="Guides">
        {#each guides as guide (guide.instanceId)}
          <NavItem
            label={guideLabel(guide)}
            active={guide.instanceId === selectedGuideId}
            data-testid="guides-guide-item"
            onclick={() => { selectedGuideId = guide.instanceId; cancelForm(); refreshSections(); }}
          />
        {/each}
        {#if guides.length === 0}
          <p class="guides-nav__empty" data-testid="guides-guide-list">No guides yet</p>
        {/if}
        <Button variant="ghost" data-testid="guides-new-guide" onclick={openNewGuide}>+ New guide</Button>
      </Nav>
    {/snippet}
    ```
    Note: wrap the entire `<Nav>` in `<div data-testid="guides-guide-list">` if NavItem doesn't expose data-testid passthrough — check `NavItem.svelte` props first.
  - **Main slot:**
    ```svelte
    {#snippet main()}
      <Main>
        <Topbar>
          <span class="guides-topbar__crumb">{repoName} › Guides</span>
          <Button variant="ghost" data-testid="guides-export-btn" onclick={handleExport}>Export .srsj</Button>
          <Button variant="ghost" onclick={onOpenAnother}>Open another file</Button>
        </Topbar>
        <Workspace>
          {#if formMode !== null && activeSectionDescriptor !== null}
            <div class="guides-form-panel">
              <SectionForm ... /> <!-- unchanged -->
            </div>
          {:else if formMode !== null && activeFormDef !== null}
            <div class="guides-form-panel">
              <RecordForm ... /> <!-- unchanged -->
            </div>
          {:else if selectedGuideId}
            <!-- Guide detail: title, export buttons, section list -->
            ...
          {:else}
            <p class="guides-placeholder">Select a guide or create a new one.</p>
          {/if}
        </Workspace>
      </Main>
    {/snippet}
    ```
  - **Guide detail section list:** preserve all `data-testid` attributes exactly:
    - `data-testid="guides-section-list"` on the `<ul>`
    - `data-testid="guides-section-item"` on each `<li>` row
    - `data-testid="guides-section-open"` on the clickable section title area
    - `data-testid="guides-section-up"` / `guides-section-down"` / `"guides-section-remove"` on controls
    - `data-testid="guides-add-section"` on the Add Section button
    - `data-testid="guides-section-type-{st.typeId}"` on section type picker buttons
    - `data-testid="guides-export-guide-json"` on the export guide JSON button
    - `data-testid="guides-edit-guide"` on the Edit guide button
    - **ADD:** `data-testid="guides-section-heading"` on the span that shows the section heading text
      (currently `.guides-shell__section-heading` — add testid alongside any new class)
  - **Inspector slot:**
    ```svelte
    {#snippet inspector()}
      <Inspector label="Guide">
        {#if selectedGuideId}
          <InspectorSection title="Guide">
            <!-- Phase C preview lands here; placeholder for now -->
            <p class="guides-inspector__placeholder">Select sections to edit. Preview will appear here.</p>
          </InspectorSection>
        {/if}
      </Inspector>
    {/snippet}
    ```
  - `data-testid="guides-shell"` must remain on a wrapper element (place on the `<AppShell>` or a wrapping `<div>`)
- [ ] **Delete the entire `.guides-shell__*` CSS block** (lines 629–899 in current file). No inline colour fallbacks. Replace with design tokens.
- [ ] Add minimal scoped styles using tokens:
    ```css
    .guides-nav__empty { padding: 0.5rem 1rem; font-size: 0.8rem; color: var(--color-muted); }
    .guides-form-panel { max-width: 640px; padding: 1rem; }
    .guides-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted); font-size: 0.9rem; padding: 2rem; }
    .guides-topbar__crumb { font-size: 0.85rem; opacity: 0.65; }
    .guides-inspector__placeholder { font-size: 0.8rem; color: var(--color-muted); padding: 0.5rem 0; }
    ```
- [ ] Update `src/lib/guides/SectionForm.svelte` (CSS only, line ~370):
  - Replace `.te-input:focus { outline: 2px solid var(--color-accent, #3b82f6); }` with `outline: 2px solid var(--color-focus-ring, var(--ink, #111)); `
- [ ] Update `e2e/guides-ordering.spec.ts` `sectionHeadings()` helper (line 30):
  - Change `rows.nth(i).locator(".guides-shell__section-heading")` to `rows.nth(i).getByTestId("guides-section-heading")`

#### Acceptance Criteria

- [ ] Guides shell renders using `AppShell` three-pane grid (nav | main | inspector)
- [ ] Nav shows guide list; active guide uses `NavItem`'s `active` prop (ink/black, no blue)
- [ ] `data-testid="guides-guide-list"`, `data-testid="guides-guide-item"`, `data-testid="guides-new-guide"` all present
- [ ] No `.guides-shell__*` CSS classes anywhere in `GuidesShell.svelte`
- [ ] No hardcoded `#3b82f6` colour in `GuidesShell.svelte` or `SectionForm.svelte`
- [ ] Export .srsj button (`guides-export-btn`) still works
- [ ] Section list with ▲▼✕ controls still works; all section-related `data-testid` attributes preserved
- [ ] `data-testid="guides-section-heading"` present on section heading spans
- [ ] `data-testid="guides-shell"` still present
- [ ] Inspector slot renders (may be minimal placeholder at this stage)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] All existing guides e2e tests pass: `npx playwright test e2e/guides-editor.spec.ts e2e/guides-json-export.spec.ts e2e/guides-ordering.spec.ts e2e/guides-table-editor.spec.ts e2e/musrs-fixture.spec.ts`

#### Testing

```bash
cd srs-web
npm run typecheck
npm run lint
npm run build
npx playwright test e2e/guides-editor.spec.ts e2e/guides-json-export.spec.ts e2e/guides-ordering.spec.ts e2e/guides-table-editor.spec.ts e2e/musrs-fixture.spec.ts
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck`, `npm run lint`, `npm run build` — all must pass.
3. Run all five guides suites — all must pass.
4. Mark completed task checkboxes `[x]`.
5. Commit with message `feat: port guides editor to shared shell and design tokens (#39)`.

---

### Phase C: Guides — Live HTML Preview in Inspector Slot

**Goal:** On wide screens (≥1100px), the inspector slot shows a live rendered HTML preview of the
selected guide, updating after each save/reorder/delete.

**Agent:** Web App Worker

**Dependency:** Phase B must be complete. The inspector slot (placeholder from Phase B) must exist.

**Pre-phase verification (already confirmed above):**
- `result.rendered: string` — confirmed in `DocumentViewResult` at srs-client.ts:435 ✓
- `format: "html"` passes through to WASM unchanged — confirmed ✓
- `GUIDE_VIEW_ID = "2aba4d85-317b-44e1-a600-d38a743b4cb4"` already defined in `GuidesShell.svelte` ✓
- `layout.css` `@media (max-width: 1100px) .app__inspector { display: none }` confirmed ✓

#### Tasks

- [ ] Update `src/lib/srs-client.ts` docstring (line 441): change `* format is "json" or "markdown"` to `* format is "json", "markdown", or "html". For "html", \`result.rendered\` contains the HTML fragment; \`result.projection\` is null.`
- [ ] Create `src/lib/components/PreviewPane.svelte`:
  - Props: `html: string | null`, `loading: boolean = false`
  - Derive `srcdoc` by wrapping the html fragment in a minimal HTML document:
    ```svelte
    const doc = html == null ? null : `<!doctype html><html><head><meta charset="utf-8">
    <style>body{font-family:sans-serif;padding:1.25rem;font-size:0.9rem;line-height:1.6;max-width:56rem;margin:0 auto}
    h1,h2,h3{font-weight:600;margin:1rem 0 0.4rem}p{margin:0.4rem 0}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ddd;padding:0.4rem 0.6rem;text-align:left}th{background:#f5f5f5}</style>
    </head><body>${html}</body></html>`;
    ```
  - Render:
    ```svelte
    {#if loading}
      <p class="preview__status">Rendering…</p>
    {:else if doc != null}
      <iframe
        data-testid="preview-pane"
        class="preview__iframe"
        srcdoc={doc}
        title="Guide preview"
        sandbox="allow-same-origin"
      ></iframe>
    {:else}
      <p class="preview__status">Select a guide to see a preview.</p>
    {/if}
    ```
  - Style:
    ```css
    .preview__iframe { width: 100%; height: 100%; border: none; display: block; }
    .preview__status { font-size: 0.8rem; color: var(--color-muted); padding: 0.5rem; }
    :global(.guides-preview) { height: 100%; display: flex; flex-direction: column; }
    ```
  - Use `$derived` for the `doc` string, not `$effect`
- [ ] Wire into `src/lib/guides/GuidesShell.svelte`:
  - Import `PreviewPane` from `$lib/components/PreviewPane.svelte`
  - Add state: `let previewHtml = $state<string | null>(null)` and `let previewLoading = $state(false)`
  - Create `refreshPreview()`:
    ```typescript
    function refreshPreview() {
      if (!selectedGuideId || !selectedContainerId) {
        previewHtml = null;
        return;
      }
      previewLoading = true;
      try {
        const result = renderDocumentView(repo, GUIDE_VIEW_ID, "html", selectedContainerId);
        previewHtml = (result.rendered && result.rendered.trim()) ? result.rendered : null;
      } catch {
        previewHtml = null;
      } finally {
        previewLoading = false;
      }
    }
    ```
  - Call `refreshPreview()` at the end of `reload()` (after `refreshSections()`)
  - Call `refreshPreview()` in the guide selection onclick (after `refreshSections()`)
  - Clear `previewHtml = null` in `cancelForm()` only if guide is deselected (not on form cancel — preview should persist while editing a section)
  - Replace the Phase B inspector placeholder with:
    ```svelte
    <InspectorSection title="Preview">
      <div class="guides-preview">
        <PreviewPane html={previewHtml} loading={previewLoading} />
      </div>
    </InspectorSection>
    ```
- [ ] Add `e2e/guides-html-preview.spec.ts`:
  ```typescript
  // Wide screen: preview iframe is visible and contains content
  test("preview pane is visible on wide screen and contains section heading", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    // load muSrs.srsj, select first guide
    await page.getByTestId("guides-guide-item").first().click();
    // preview pane should be present (in inspector, which is visible at 1400px)
    await expect(page.getByTestId("preview-pane")).toBeVisible({ timeout: 5000 });
    // confirm srcdoc contains a known section heading from the fixture
    const srcdoc = await page.getByTestId("preview-pane").getAttribute("srcdoc");
    expect(srcdoc).toContain("Things to watch out for");  // heading in muSrs.srsj first guide
  });

  // Narrow screen: inspector (and preview) is hidden by layout.css media query
  test("preview pane is not visible on narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.getByTestId("guides-guide-item").first().click();
    await expect(page.getByTestId("preview-pane")).not.toBeVisible();
  });
  ```
  Add the standard `beforeEach` loading muSrs.srsj (copy from `guides-editor.spec.ts`).

#### Acceptance Criteria

- [ ] On wide screen (≥1100px): `[data-testid="preview-pane"]` iframe is visible when guide selected
- [ ] The iframe `srcdoc` attribute contains "Things to watch out for" (section heading from muSrs.srsj first guide)
- [ ] Preview updates after saving a section (reload triggers refreshPreview)
- [ ] On narrow screen (<1100px): `[data-testid="preview-pane"]` is not visible (inspector hidden by CSS)
- [ ] When no guide selected: `previewHtml` is null; placeholder text shown
- [ ] Export guide JSON still works (unchanged renderDocumentView with "json")
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] New e2e tests pass: `npx playwright test e2e/guides-html-preview.spec.ts`

#### Testing

```bash
cd srs-web
npm run typecheck
npm run lint
npm run build
npx playwright test e2e/guides-html-preview.spec.ts
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck`, `npm run lint`, `npm run build` — all must pass.
3. Run `npx playwright test e2e/guides-html-preview.spec.ts` — must pass.
4. Mark completed task checkboxes `[x]`.
5. Commit with message `feat: live HTML preview in guides inspector (#39)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npx playwright test` — full suite (all 90+ tests) green
- [ ] Governance: select a record → `[data-testid="record-reading"]` in centre, inspector shows meta/actions only
- [ ] Guides: shell matches governance design (monochrome tokens, shared components, no blue)
- [ ] Guides: `[data-testid="preview-pane"]` visible on wide screen, contains "Things to watch out for"
- [ ] No hardcoded `#3b82f6` in `GuidesShell.svelte` or `SectionForm.svelte`
- [ ] All `.guides-shell__*` CSS deleted from `GuidesShell.svelte`
- [ ] `data-testid="guides-section-heading"` present in section rows

## Coordination Rules

- Web App Worker writes to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). `RecordReading` uses `TypeFormDef` for label lookup only;
  it renders `record.fieldValues` as returned by WASM.
- `renderDocumentView` with `"html"` uses existing WASM binding — no new bindings needed.
- Phases are sequential: A → B → C. Do not start a phase until the previous milestone gate passes.

## Assumptions

- `muSrs.srsj` fixture's first guide contains a section with heading "Things to watch out for"
  (verified from fixture data — confirmed ✓).
- All guides e2e test files (`guides-*.spec.ts`) reference `data-testid` attributes (not CSS classes)
  except `guides-ordering.spec.ts:30` which uses `.guides-shell__section-heading` — fixed in Phase B.
