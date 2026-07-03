# Plan: Decision Search + Sort-by-Time UI (srs-web#104)

## Summary

The Decision Log view in `GovernanceShell.svelte` currently applies search as a client-side text
match against governance-specific field names (`title`, `decision_statement`). This violates
ADR-001: the TypeScript layer must not embed SRS field-name knowledge. The WASM `find` binding
(srs-rust#218, closed 2026-07-03) provides a schema-agnostic full-text search via the text
projection service. This plan wires the existing search UI in `DecisionLogView.svelte` to
`find`, removes the client-side field-name matching, and confirms the sort-by-created_at feature
already works (createdAt is schema-agnostic). Delivering now unblocks issue #105 (tag-based
topic filter through `list_terms`) and closes the ADR-001 gap.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude (main session) |
| Web App Worker | Claude (main session) |
| Verification | Claude (main session) |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS — field-name matching must move to WASM `find` | accepted |

No new ADR needed: the existing ADR-001 already requires this change; this plan is closing a
gap, not introducing a new constraint.

**Architecture choice: pass `repo` to `DecisionLogView`.**
The `find` call is needed inside `DecisionLogView` to debounce and filter the records list it
already manages. The alternative (lifting search state to `GovernanceShell`) would scatter
search state across two components with no benefit. `DecisionLogView` is already governance-
specific; adding `repo: SrsRepository` as an optional prop is the minimal change.

**Search strategy: intersect WASM hits with records prop.**
When `searchQuery` is non-empty, call `find(repo, { contentMatch: q })` and filter `records`
to hit instance IDs. This avoids passing type metadata to `DecisionLogView`. When the query
is empty, use `records` directly (no WASM call). Sort (by `createdAt`), topic filter (by
`r.tags`), and status filter (by `getStringField(r, "status", fieldMeta)`) remain client-side
— `createdAt` and `tags` are schema-agnostic; the status filter is a deferred ADR-001 concern
tracked separately (see Out of scope).

---

## Contracts

### WASM API surface

**No new WASM methods required.** The `find` and `list_terms` bindings already exist in
`srs-rust/crates/srs-bindings/src/lib.rs` (srs-rust#218 and srs-rust#303). What is missing
is the TypeScript facade.

**`to_js()` return contract:** Both `find` and `list_terms` use the `to_js()` helper, which
serializes via `serde_json::to_string` then re-parses as a JS object. WASM therefore returns
a real JS object (not a JSON string). TypeScript casts are valid without `JSON.parse`.

**`find` and `list_terms` are WASM-only** — they are not CLI subcommands and are not covered
by `srs-rust/crates/srs-cli/schemas/payload/` JSON schemas. TS types are derived directly
from the Rust struct definitions in `discovery_service.rs` and `srs-core/types/term.rs`.

**`DiscoveryHit` field normalisation required.** serde_wasm_bindgen does not always honour
`#[serde(rename_all = "camelCase")]`. `DiscoveryHit` has multi-word fields (`instanceId`,
`typeNamespace`, `typeName`, `matchedFields`) that may arrive as snake_case. A
`normalizeDiscoveryHit` function with dual-key lookup is required, mirroring `normalizeRecord`.

### TypeScript types

New types to add to `srs-client.ts`:

```typescript
/** Input to the WASM `find` binding (maps to srs-repository DiscoveryQuery). */
export interface DiscoveryQuery {
  typeId?: string;
  typeNamespace?: string;
  typeName?: string;
  containerId?: string;
  tag?: string[];
  lifecycleState?: string;
  excludeLifecycleStates?: string[];
  tier?: number;
  contentMatch?: string;
}

/** A single hit returned by `find`. */
export interface DiscoveryHit {
  instanceId: string;
  label: string;
  typeNamespace: string;
  typeName: string;
  lifecycleState?: string;
  score?: number;
  snippet?: string;
  matchedFields: string[];
}

/** Full result from the `find` binding. */
export interface DiscoveryResult {
  hits: DiscoveryHit[];
  total: number;
  diagnostics: string[];
}

/** RFC-006 vocabulary Term returned by `list_terms`. */
export interface Term {
  id: string;
  label: string;
  definition?: string;
  tags?: string[];
}
```

New wrapper functions:

```typescript
// Add `find(query_json: string): any` to SrsRepository interface.
export function find(repo: SrsRepository, query: DiscoveryQuery): DiscoveryResult;

// Add `list_terms(): any` to SrsRepository interface.
export function listTerms(repo: SrsRepository): Term[];
```

---

## Scope

**In scope:**

- Add `find` and `list_terms` to `SrsRepository` interface in `srs-client.ts`.
- Add `DiscoveryQuery`, `DiscoveryResult`, `DiscoveryHit`, `Term` TypeScript types.
- Add `find()` and `listTerms()` wrapper functions in `srs-client.ts`.
- Wire `DecisionLogView.svelte` search through `find` (pass `repo` prop, call on non-empty query).
- Remove client-side field-name text matching (`title.includes(q)`, `statement.includes(q)`).
- Confirm sort-by-createdAt already works correctly (schema-agnostic, no change needed).
- Unit tests for `find` and `listTerms` wrappers in `tests/srs-client.test.ts`.
- Unit tests for `DecisionLogView` search/sort/filter behaviour.

**Out of scope:**

- Wiring the status filter (`getStringField(r, "status", fieldMeta)`) through WASM — requires
  a field-agnostic status query in `find` (tracking issue to be filed).
- Wiring the topic filter through `list_terms` (srs-web#105).
- Any changes to `srs-rust/`.
- Pagination or infinite scroll.
- Debouncing the search input (the WASM call is synchronous; defer unless perf issue observed).

---

## Phases

### Phase 1: TypeScript wrappers for `find` and `list_terms`

**Goal:** `srs-client.ts` exposes `find()` and `listTerms()` with full types; unit tests pass.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `find(query_json: string): any` method to `SrsRepository` interface with biome-ignore comment.
- [ ] Add `list_terms(): any` method to `SrsRepository` interface with biome-ignore comment.
- [ ] Add `DiscoveryQuery`, `DiscoveryHit`, `DiscoveryResult`, `Term` types to `srs-client.ts`.
- [ ] Add `normalizeDiscoveryHit(raw: any): DiscoveryHit` with dual-key lookup:
  `instanceId: raw.instanceId ?? raw.instance_id`,
  `label: raw.label`,
  `typeNamespace: raw.typeNamespace ?? raw.type_namespace`,
  `typeName: raw.typeName ?? raw.type_name`,
  `lifecycleState: raw.lifecycleState ?? raw.lifecycle_state`,
  `score: raw.score`,
  `snippet: raw.snippet`,
  `matchedFields: raw.matchedFields ?? raw.matched_fields ?? []`.
- [ ] Add `find(repo, query)` wrapper: call `repo.find(JSON.stringify(query))`, normalise
  result: `{ hits: raw.hits.map(normalizeDiscoveryHit), total: raw.total, diagnostics: raw.diagnostics ?? [] }`.
- [ ] Add `listTerms(repo)` wrapper: raw Term fields (`id`, `label`, `definition`, `tags`) are
  single-word — no snake_case ambiguity. Map directly:
  `{ id: r.id, label: r.label, definition: r.definition, tags: r.tags }`. Handle undefined optionals.
- [ ] Add `find` mock entry to `mockRepo()` base in `tests/srs-client.test.ts` (throws by default).
- [ ] Add `list_terms` mock entry to `mockRepo()` base.
- [ ] Write test: `find()` serialises query correctly and returns `DiscoveryResult`.
- [ ] Write test: `listTerms()` returns normalised `Term[]`.

#### Acceptance Criteria

- [ ] `npm run typecheck` passes with no new errors.
- [ ] `npm run lint` passes (biome-ignore comments added for `any` types at WASM boundary).
- [ ] Unit tests for `find` and `listTerms` pass (`npm test -- srs-client`).

#### Testing

```bash
npm run typecheck
npm run lint
npm test -- srs-client
```

#### Milestone gate

1. All acceptance criteria above are met.
2. `npm run typecheck` and `npm run build` both pass.
3. `npm test -- srs-client` passes.
4. Mark completed task checkboxes `[x]`.
5. Commit: `feat: add find and listTerms WASM wrappers to srs-client (#104)`.

Do not start Phase 2 until this milestone gate passes.

---

### Phase 2: Wire search through WASM `find` in `DecisionLogView`

**Goal:** Search box calls WASM `find` (not client-side field matching); sort and topic filter unchanged.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `repo: SrsRepository` optional prop to `DecisionLogView.svelte` (typed, not `any`).
- [ ] In `displayedRecords` derived: when `searchQuery.trim() !== ""` and `repo` is provided,
  call `find(repo, { contentMatch: searchQuery.trim() })`, collect hit instance IDs into a `Set`,
  and filter `records` to those IDs before other filters apply.
- [ ] When `searchQuery` is empty or `repo` is absent, skip the `find` call (use `records` directly).
- [ ] Remove the two client-side field-name text matching lines:
  `const title = (getStringField(r, "title", fieldMeta) ?? "").toLowerCase();`
  `const statement = (getStringField(r, "decision_statement", fieldMeta) ?? "").toLowerCase();`
  `return title.includes(q) || statement.includes(q);`
- [ ] Remove the now-unused `searchQuery` / `q` client-side branch inside the `filter` callback
  (keep the filter callback only for the topic filter).
- [ ] Update `GovernanceShell.svelte`: pass `repo={repo}` to `<DecisionLogView>`.
- [ ] Remove unused imports from `DecisionLogView` if `getStringField` / `getFieldMeta` are no
  longer needed (check: `getStringField` is still used for the status filter; keep if so).
- [ ] File a tracking issue for the residual ADR-001 gap: `getStringField(r, "status", fieldMeta)`
  uses governance field name "status" and values "superseded"/"abandoned". Record the issue number
  in this plan under Assumptions.
- [ ] Add **Vitest unit tests** (not Playwright) in `tests/decision-log-view.test.ts`:
  - Test: `find` spy called with `{ contentMatch: "foo" }` when searchQuery is "foo".
    Use `vi.fn()` mock for `find` wrapper; verify `find` was called and only matching
    instanceIds appear in `displayedRecords`.
  - Test: empty search — `find` is NOT called; all records returned.
  - Test: sort toggle changes order of records by `createdAt` (no WASM call needed).

#### Acceptance Criteria

- [ ] Typing in the search box triggers `find` via WASM (no client-side field-name logic).
- [ ] Empty search shows all decisions (no WASM call on empty).
- [ ] Sort toggle orders records newest-first / oldest-first by `createdAt`.
- [ ] Topic filter still works (client-side, unchanged).
- [ ] Show-all toggle still works (client-side, unchanged).
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria above are met.
2. `npm run typecheck` and `npm run build` both pass.
3. `npm test` passes.
4. Tracking issue for status-filter ADR-001 gap is filed and number recorded.
5. Mark completed task checkboxes `[x]`.
6. Commit: `feat: wire decision search through WASM find binding (#104)`.

Do not proceed to Final Acceptance until this milestone gate passes.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all unit tests)
- [ ] WASM loads and `loadRepo(srsj)` succeeds against `gallery.srsj`
- [ ] Search box in Decision Log view calls WASM `find` (verified via Playwright or dev-server run)
- [ ] Empty search shows all records; non-empty search returns matching records only
- [ ] Sort toggle (newest/oldest) reorders the displayed records by `createdAt`
- [ ] No client-side field-name knowledge (no `"title"` or `"decision_statement"` string literals in
  the search path)
- [ ] No regressions in other governance views (risk log, etc.)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The `find` call is schema-agnostic (passes
  `contentMatch` only); no field names are referenced in the search path.
- Verification Agent runs `npm run typecheck && npm run build && npm test` after each phase.

## Assumptions

- The `find` WASM binding is already present in `srs-rust/crates/srs-bindings/src/lib.rs`
  (srs-rust#218, confirmed closed). No srs-rust changes needed.
- The `list_terms` WASM binding is already present (srs-rust#303, confirmed closed). Its
  wrapper is added here for completeness (used by #105). Not wired to the UI in this plan.
- The `gallery.srsj` fixture contains at least one decision record for search testing.
- `DecisionLogView.svelte` receives the `repo` prop as optional to avoid a breaking change in
  tests that render the component without a real WASM repo.
- Residual ADR-001 gap (status filter via `getStringField`) tracked in srs-web#118.
