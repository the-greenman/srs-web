# Plan: Blueprint↔View Discovery + GuidesShell Wiring (srs-web#43)

## Summary

`GuidesShell.svelte` currently hardcodes two UUID literals (`GUIDE_BLUEPRINT_ID`, `GUIDE_VIEW_ID`)
to identify which blueprint to author against and which document view to render. There is no
programmatic path to discover these at runtime. This plan adds `listDocumentViews` to
`srs-client.ts`, creates a reusable `src/lib/discovery.ts` module with two pure-TS helpers
(`findBlueprint`, `documentViewsForBlueprint`), wires GuidesShell to discover its blueprint and
view at runtime, and adds a presentational `ViewPicker.svelte` component for contexts where more
than one view exists. Hardcoded UUID literals are eliminated. ADR-004 records the convention join.

Phase A (WASM bindings: `list_blueprints`, `list_document_views`, `document_views_for_container`)
is already complete via srs-rust#125 and srs-rust#181. srs-web#52 added the srs-client.ts
wrappers for `listBlueprints`, `containersForInstance`, `typeSchema`, and
`documentViewsForContainer`. This plan adds only the missing `listDocumentViews` wrapper (Phase B)
and then implements the discovery layer and GuidesShell wiring (Phase C).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude (this pipeline) |
| Web App Worker | Phase B + C |
| Verification | Final acceptance |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-003](../docs/adr/003-blueprint-schema-driven-guides-editor.md) | Blueprint drives authoring; document views drive rendering — they are decoupled | accepted |
| [ADR-004](../docs/adr/004-blueprint-view-convention-join.md) | Blueprint↔view discovery uses string-convention join (namespace + name/containerType) | accepted |

**No new WASM binding required.** `list_document_views` exists in srs-rust (srs-rust#125 Phase 4,
`crates/srs-bindings/src/lib.rs:267`). Only the TypeScript interface declaration and wrapper
function are missing.

**`list_document_views` returns a bare JS array** (`Vec<DocumentViewSummary>` serialised via
`to_js`), NOT an envelope. This is consistent with `list_containers` and `document_views_for_container`,
and different from `list_blueprints` (which returns `{ summaries, diagnostics }`). The
`DocumentViewListResult` type is therefore just `DocumentViewSummary[]`.

**`WELL_KNOWN_BLUEPRINT` stays hardcoded in GuidesShell.** The Architecture Reviewer noted this
preserves coupling. Decision: keep it hardcoded. `GuidesShell` is an opinionated guide-specific
editor — it is not designed to be a generic parameterized editor. Reusability comes from
`discovery.ts` (the helpers can be called by any editor that knows its blueprint identity), not
from parameterizing GuidesShell's namespace/name. A follow-up issue will track making namespace/name
a prop if a second use case emerges. This mirrors the issue spec: "GuidesShell knows it is
`com.mudemocracy/guide` (a `{namespace,name}` constant)."

**ViewPicker Svelte component unit tests: not feasible with current vitest config.** The vitest
config only covers `tests/**/*.test.ts` and `@testing-library/svelte` is not installed. Adding a
new dependency is out of scope for this plan. ViewPicker behaviour is therefore covered by:
(1) `discovery.test.ts` unit tests for the filtering logic that feeds ViewPicker's `views` prop, and
(2) the e2e single-view test (confirms picker is hidden). Multi-view picker e2e is deferred as a
follow-up (consistent with the issue fallback note).

**Convention join rationale (ADR-004).** `BlueprintSummary` exposes `root_type_count: usize` but
not the actual `rootTypes: ExactTypeRef[]`. Without Blueprint rootTypes in the summary, a
UUID-based join (Blueprint.rootTypes ↔ DocumentView.rootTypeRefs) is not feasible from summaries
alone. The string join (`view.namespace === blueprint.namespace && view.containerType ===
blueprint.name`) is the only feasible option. This is ADR-003 compliant — it is a frontend
discovery convenience, not a model foreign key. When BlueprintSummary is extended to carry
rootTypes, the helper can be updated in isolation (one function in `discovery.ts`).

**BlueprintPicker deferred.** GuidesShell is the only blueprint editor; no picker needed until a
second one exists. Deferred per issue note and filed as a follow-up.

---

## Contracts

### WASM API surface

No new WASM method is required. `list_document_views(filter_json: string): any` exists in
`srs-rust` (srs-rust#125 Phase 4). Only the TS interface declaration and a wrapper function need
to be added to `srs-client.ts`.

### TypeScript types

`DocumentViewSummary` is derived from `srs-rust/crates/srs-repository/src/view_service.rs`
`DocumentViewSummary` struct (srs-rust#125). Fields (camelCase in JSON):
`id`, `namespace`, `name`, `version`, `description`, `containerType?`, `rootTypeRefs?`,
`sourcePackage?`.

`BlueprintSummary` is already typed in `srs-client.ts` lines 569–578.

---

## Scope

**In scope:**

- Add `list_document_views(filter_json: string): any` to `SrsRepository` interface
- Add `DocumentViewSummary` type and `listDocumentViews()` wrapper to `srs-client.ts`
- Create `src/lib/discovery.ts`: `findBlueprint`, `documentViewsForBlueprint` helpers + vitest unit tests
- Create `src/lib/components/ViewPicker.svelte` (presentational: hidden when ≤1 view, labelled Select when >1)
- Update `GuidesShell.svelte`: replace hardcoded `GUIDE_BLUEPRINT_ID` / `GUIDE_VIEW_ID` with runtime discovery via `findBlueprint` + `documentViewsForBlueprint`; wire `ViewPicker`
- Author `docs/adr/004-blueprint-view-convention-join.md`
- e2e test for single-view discovery path (muSrs fixture)
- Multi-view picker: unit tests only (ViewPicker component test + discovery unit test); e2e deferred per issue note

**Out of scope:**

- `BlueprintPicker` (no second blueprint editor yet) — filed as follow-up
- UUID-based join (requires BlueprintSummary to carry rootTypes) — filed as follow-up
- Generic `BlueprintEditor` mega-component
- Any srs-rust changes

---

## Phases

### Phase B: `listDocumentViews` wrapper + `discovery.ts`

**Goal:** `srs-client.ts` exposes `listDocumentViews`; `discovery.ts` provides pure-TS helpers
and is unit-tested; typecheck and tests pass.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/srs-client.ts`, add to the `SrsRepository` interface after the
  `document_views_for_container` entry (inside the interface closing brace, before line 57):
  ```ts
  // biome-ignore lint/suspicious/noExplicitAny: WASM returns `any`; wrapped in listDocumentViews()
  list_document_views(filter_json: string): any;
  ```
  Note: `list_document_views` returns a **bare JS array** (not an envelope), consistent with
  `list_containers`/`document_views_for_container` and unlike `list_blueprints`.
- [ ] Also add `list_document_views: () => { throw new Error("not mocked"); }` to the base mock
  object in `tests/srs-client.test.ts`.
- [ ] In `src/lib/srs-client.ts`, add `DocumentViewSummary` interface and `listDocumentViews`
  wrapper after the `listBlueprints` function (around line 592, before the
  `// --- documentViewsForContainer` comment):
  ```ts
  ```ts
  export interface DocumentViewSummary {
    id: string;
    namespace: string;
    name: string;
    version: number;
    description: string;
    containerType?: string;
    rootTypeRefs?: ExactTypeRef[];   // ExactTypeRef is already exported (line 599)
    sourcePackage?: string;
  }
  // Returns a bare array (not an envelope) — see Rust doc at crates/srs-bindings/src/lib.rs:262
  export function listDocumentViews(repo: SrsRepository): DocumentViewSummary[] {
    return repo.list_document_views("{}") as DocumentViewSummary[];
  }
  ```
- [ ] Create `src/lib/discovery.ts`:
  ```ts
  import type { BlueprintSummary, DocumentViewSummary } from "./srs-client.js";

  /**
   * ADR-004 convention join: a DocumentView belongs to a Blueprint when their
   * namespaces match AND view.containerType === blueprint.name.
   * Frontend discovery over WASM metadata — not a model foreign key.
   */
  export function documentViewsForBlueprint(
    blueprint: BlueprintSummary,
    views: DocumentViewSummary[]
  ): DocumentViewSummary[] {
    return views.filter(
      (v) => v.namespace === blueprint.namespace && v.containerType === blueprint.name
    );
  }

  export function findBlueprint(
    blueprints: BlueprintSummary[],
    namespace: string,
    name: string
  ): BlueprintSummary | null {
    return blueprints.find((b) => b.namespace === namespace && b.name === name) ?? null;
  }
  ```
- [ ] Create `tests/discovery.test.ts` (in `tests/` to match vitest config `include: ["tests/**/*.test.ts"]`) with vitest tests covering:
  - `documentViewsForBlueprint` matches on namespace + containerType
  - `documentViewsForBlueprint` excludes namespace mismatch
  - `documentViewsForBlueprint` excludes containerType mismatch
  - `documentViewsForBlueprint` excludes views where `containerType` is undefined
  - `documentViewsForBlueprint` with multiple views returns only matching ones (proves filtering logic for ViewPicker feed)
  - `findBlueprint` returns matching blueprint
  - `findBlueprint` returns null on miss
- [ ] Add a `listDocumentViews` wrapper test to `tests/srs-client.test.ts`: verify it calls `repo.list_document_views("{}")` and casts the bare array result.

#### Acceptance Criteria

- [ ] `listDocumentViews(repo)` calls `repo.list_document_views("{}")` and returns typed array (tested in `tests/srs-client.test.ts`)
- [ ] `findBlueprint` and `documentViewsForBlueprint` pass all unit tests
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm test` passes (all vitest tests green)

#### Testing

```bash
npm run typecheck
npm test
```

#### Milestone gate

1. All acceptance criteria checked.
2. `npm run typecheck` and `npm test` both pass.
3. Commit: `feat(srs-client): add listDocumentViews + discovery.ts helpers (#43)`

---

### Phase C: ViewPicker + GuidesShell wiring + ADR-004 + e2e

**Goal:** `GuidesShell.svelte` contains no hardcoded UUID literals; it resolves its blueprint by
`{namespace: "com.mudemocracy", name: "guide"}` at runtime and discovers its views via the
convention join; `ViewPicker` is wired but hidden in the single-view muSrs path; ADR-004 is
authored; e2e test passes.

**Agent:** Web App Worker

#### Tasks

- [ ] **Pre-task check:** run `grep -rn "7bfa600b\|2aba4d85" src/` to confirm these UUIDs appear only in `GuidesShell.svelte` (and no other source file). If they appear elsewhere, stop and report — do not remove UUIDs used by other components.
- [ ] Create `src/lib/components/ViewPicker.svelte`:
  - Props: `views: DocumentViewSummary[]`, `selectedViewId: string | null`,
    `onSelect: (viewId: string) => void`, `label?: string`
  - Renders nothing (no DOM output) when `views.length <= 1`
  - Renders a labelled `<select data-testid="view-picker">` when `views.length > 1`
  - Selected option highlights `selectedViewId`
  - Calls `onSelect(event.target.value)` on change
- [ ] Export `ViewPicker` from `src/lib/components/index.ts` (add to existing exports).
- [ ] Update `src/lib/guides/GuidesShell.svelte`:
  - Remove `const GUIDE_BLUEPRINT_ID = "7bfa600b-..."` and `const GUIDE_VIEW_ID = "2aba4d85-..."`
  - Add import: `import { findBlueprint, documentViewsForBlueprint } from "../discovery.js";`
  - Add import: `import { listBlueprints, listDocumentViews } from "../srs-client.js";`
  - Add import: `import ViewPicker from "../components/ViewPicker.svelte";`
  - Add constant (keep near top of script, replacing the removed UUID constants):
    `const WELL_KNOWN_BLUEPRINT = { namespace: "com.mudemocracy", name: "guide" } as const;`
    Note: this is an opinionated constant for the guide-specific editor — GuidesShell is not a
    generic editor. See Architecture Decisions above.
  - Add state: `let guideBlueprintId: string | null = $state(null);`
  - Add state: `let availableViews: DocumentViewSummary[] = $state([]);`
  - Add state: `let selectedViewId: string | null = $state(null);`
  - In `onMount` / repo-load flow (where `blueprintSchema` is called), resolve:
    ```ts
    const WELL_KNOWN_BLUEPRINT = { namespace: "com.mudemocracy", name: "guide" } as const;
    const blueprintResult = listBlueprints(repo);
    const bp = findBlueprint(blueprintResult.summaries, WELL_KNOWN_BLUEPRINT.namespace, WELL_KNOWN_BLUEPRINT.name);
    if (!bp) { schemaError = "Guide blueprint not found in repository"; return; }
    guideBlueprintId = bp.id;
    availableViews = documentViewsForBlueprint(bp, listDocumentViews(repo));
    selectedViewId = availableViews[0]?.id ?? null;
    ```
  - Replace `blueprintSchema(repo, GUIDE_BLUEPRINT_ID)` → `blueprintSchema(repo, guideBlueprintId)`
    (guard with `if (!guideBlueprintId) return`)
  - Replace all uses of `GUIDE_VIEW_ID` with `selectedViewId` (guard: if null, set exportError and return)
  - Add `<ViewPicker views={availableViews} selectedViewId={selectedViewId} onSelect={(id) => { selectedViewId = id; refreshPreview(); }} />` in the toolbar area.
    Note: `selectedViewId = id; refreshPreview()` is safe in Svelte 5 runes — `$state` mutations
    are synchronous within a handler, so `selectedViewId` is updated before `refreshPreview()`
    reads it. Do NOT restructure this into a reactive `$effect` without verifying read ordering.
- [ ] Write `docs/adr/004-blueprint-view-convention-join.md` (status: `accepted`)
- [ ] Write `e2e/guides-view-discovery.spec.ts`:
  - Load `muSrs.srsj` (single guide view path)
  - Select a guide → assert preview renders (no UUID literal in assertion)
  - Assert `[data-testid="view-picker"]` is not visible (single-view path)
  - Assert export guide JSON's `documentViewId` field equals `2aba4d85-317b-44e1-a600-d38a743b4cb4`
    — this is the only guide view in muSrs. The UUID here is a **fixture assertion** proving
    discovery returned the correct view for the muSrs fixture, not a hardcoded application value.
    The application code must contain no UUID literals; the test file asserting the discovered
    value is acceptable (consistent with existing `guides-json-export.spec.ts` which already
    asserts `GUIDE_VIEW_ID = "2aba4d85-..."`). Document this in a comment in the test file.

#### Acceptance Criteria

- [ ] `GuidesShell.svelte` contains no UUID literals (verify with `grep -r "7bfa600b\|2aba4d85" src/lib/guides/`)
- [ ] Single-view path: guide selector works, preview renders, export succeeds, picker hidden
- [ ] `ViewPicker` renders a `<select>` when `views.length > 1` (covered by multi-view scenario in `tests/discovery.test.ts` via `documentViewsForBlueprint` test proving multiple views are returned; Svelte component unit tests not feasible without `@testing-library/svelte`)
- [ ] `npm run typecheck` passes with 0 errors
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] e2e: `guides-view-discovery.spec.ts` passes against the dev server

#### Testing

```bash
npm run typecheck
npm run build
npm test
npx playwright test e2e/guides-view-discovery.spec.ts
```

#### Milestone gate

1. All acceptance criteria checked.
2. All test commands pass.
3. Commit: `feat(guides): blueprint discovery + ViewPicker wiring, remove UUID literals (#43)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes — 0 errors
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all vitest tests including new discovery tests)
- [ ] `grep -r "7bfa600b\|GUIDE_BLUEPRINT_ID\|GUIDE_VIEW_ID" src/lib/guides/` returns empty
- [ ] e2e `guides-view-discovery.spec.ts` passes
- [ ] Existing e2e suite (all specs) passes — no regressions

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001): `findBlueprint` and `documentViewsForBlueprint` filter metadata; they do not interpret SRS model semantics.
- Discovery helpers live in `discovery.ts`, not in GuidesShell or srs-client.
- Lead Integrator reviews the join logic and ADR-004 wording before Phase C commit.

## Assumptions

- The muSrs fixture has exactly one guide-type document view (`containerType: "guide"`, namespace `com.mudemocracy`) — confirmed from e2e fixtures.
- `BlueprintSummary.namespace` and `BlueprintSummary.name` are stable fields (srs-rust blueprint_service.rs line 67–68).
- `DocumentViewSummary.containerType` is optional and present on views that were authored with a `containerType` value.
- `GuidesShell.svelte` is the only consumer of the hardcoded blueprint/view UUIDs (confirmed by grep).
