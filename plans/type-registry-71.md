# Plan: Unified TYPE_REGISTRY — consolidate KNOWN_TYPE_CONFIG and VIEW_REGISTRY

> **Issue:** [srs-web#71](https://github.com/the-greenman/srs-web/issues/71)

## Summary

Adding a new governance type currently requires editing two files: `KNOWN_TYPE_CONFIG` in `sections.ts` (display hints) and `VIEW_REGISTRY` in `RecordDispatch.svelte` (view component). This plan merges both into a single `TYPE_REGISTRY` in a new `src/lib/governance/type-registry.ts`. Epic #30's architectural commitment — "a new decision type ships as a package with **zero TS change**" — requires that any *known* type (with a custom view) is registered in exactly one place.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | — |
| Verification | — |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | typeId-keyed section discovery + view dispatch | accepted — consequence updated by ADR-007 |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | `TYPE_REGISTRY` is the single source for display hints + view components | proposed |

---

## Contracts

### WASM API surface

**No new WASM bindings required.** This is a pure TypeScript/Svelte refactor. No new SRS operations are called; no payload shapes change. The existing `typeSchema(repo, typeId, typeVersion)` and `listRecords(repo, {})` bindings already cover all data needs.

### TypeScript types

`TypeRegistryEntry` is a new internal TS interface in `type-registry.ts`. It is not exposed at the WASM boundary.

**ADR-001 note on `typeVersion`:** `typeVersion` is structural metadata — an opaque integer passed verbatim to the `typeSchema()` WASM call. srs-web does not interpret or validate it; it routes it to WASM unchanged. This is the same pattern as `typeId` (a UUID passed to WASM without TS-side interpretation) and is ADR-001 compliant. `KNOWN_TYPE_CONFIG` already carries this field for the same reason.

The `view` field uses `typeof RecordView` (consistent with the existing `as unknown as typeof RecordView` cast already present in `VIEW_REGISTRY`) to avoid introducing a new Svelte `Component<>` import.

`buildDynamicSections()` destructures only the display-hint fields (`label`, `icon`, `typeName`, `typeNamespace`, `typeVersion`) from each `TypeRegistryEntry` — the `view` field is not included in the `SectionConfig` shape.

---

## Scope

- Create `src/lib/governance/type-registry.ts` with `TypeRegistryEntry`, `TYPE_REGISTRY`, and export of `DECISION_TYPE_ID`.
- Refactor `src/lib/governance/sections.ts`: remove `KNOWN_TYPE_CONFIG` and `DECISION_TYPE_ID` export; update `buildDynamicSections()` to iterate `Object.entries(TYPE_REGISTRY)` (destructuring only display-hint fields, not `view`); fix stale JSDoc comment referencing `KNOWN_TYPE_CONFIG`.
- Refactor `src/rendering/RecordDispatch.svelte`: remove `VIEW_REGISTRY` constant and `DECISION_TYPE_ID` import; update file-header comment; derive view component from `TYPE_REGISTRY[record.typeId]?.view ?? RecordView`.
- Update `src/App.svelte`: change `DECISION_TYPE_ID` import to `$lib/governance/type-registry.js`; fix stale comment on the `dynamicSections` state declaration (line ~80).
- Update `tests/sections.test.ts`: fix stale comments referencing `KNOWN_TYPE_CONFIG` (lines ~5, ~64, ~104).
- Update `docs/adr/006-dynamic-dispatch-replaces-sections.md`: amend the stale consequence sentence about `VIEW_REGISTRY`.
- Finalise `docs/adr/007-unified-type-registry.md`.

**Out of scope:**

- Adding new governance types (exercise, etc.) — tracked in srs-rust#210.
- Blueprint-based type discovery (ADR-004 pattern) — future work.
- Changing `SectionConfig`, `SectionKey`, or `buildDynamicSections` public signatures.

---

## Phases

### Phase 1: Create type-registry.ts and refactor consumers

**Goal:** `TYPE_REGISTRY` exists; `KNOWN_TYPE_CONFIG` and `VIEW_REGISTRY` are removed; all existing tests pass.

**Agent:** Web App Worker

#### Tasks

- [ ] Verify no other consumer of `DECISION_TYPE_ID` exists outside `src/App.svelte` and `src/rendering/RecordDispatch.svelte`:
  `grep -rn "DECISION_TYPE_ID" src/ tests/` — expected: `App.svelte` (2 uses), `RecordDispatch.svelte` (1 use), `tests/sections.test.ts` (local constant only).
- [ ] Create `src/lib/governance/type-registry.ts`:
  - Export `TypeRegistryEntry` interface: `{ label, icon, typeName, typeNamespace, typeVersion, view?: typeof RecordView }`
  - Export `TYPE_REGISTRY: Record<string, TypeRegistryEntry>` with the 3 known types (article, decision, role)
  - Export `DECISION_TYPE_ID = "1fcad6a2-9f78-5e41-94ba-d82e88b822f3"`
- [ ] Update `src/lib/governance/sections.ts`:
  - Remove `KNOWN_TYPE_CONFIG` constant
  - Remove `DECISION_TYPE_ID` export
  - Import `TYPE_REGISTRY` from `./type-registry.js`
  - Update `buildDynamicSections()` to iterate `Object.entries(TYPE_REGISTRY)`, destructuring `label, icon, typeName, typeNamespace, typeVersion` (not `view`)
  - Fix JSDoc comment on `buildDynamicSections` to reference `TYPE_REGISTRY` instead of `KNOWN_TYPE_CONFIG`
- [ ] Update `src/rendering/RecordDispatch.svelte`:
  - Remove `VIEW_REGISTRY` constant
  - Remove `DECISION_TYPE_ID` import
  - Import `TYPE_REGISTRY` from `$lib/governance/type-registry.js`
  - Derive `ViewComponent` as `TYPE_REGISTRY[record.typeId]?.view ?? RecordView`
  - Update file-header comment to say "TYPE_REGISTRY maps typeId → view component; falls back to RecordView. See type-registry.ts to add a new type. ADR-006, ADR-007."
- [ ] Update `src/App.svelte`:
  - Change `DECISION_TYPE_ID` import from `sections.js` to `type-registry.js` (keep `buildDynamicSections` importing from `sections.js`)
  - Fix stale comment on the `dynamicSections` state declaration (update "KNOWN_TYPE_CONFIG" → "TYPE_REGISTRY")
- [ ] Update `tests/sections.test.ts`:
  - Fix stale JSDoc comments referencing `KNOWN_TYPE_CONFIG` (the local constant for `DECISION_TYPE_ID` is intentional — test independence — no import change needed)
- [ ] Update `docs/adr/006-dynamic-dispatch-replaces-sections.md`:
  - Amend the consequence: "Registering a custom view requires only adding one entry to `VIEW_REGISTRY` in `RecordDispatch.svelte`" → "Registering a known type or custom view requires one entry in `TYPE_REGISTRY` in `type-registry.ts`. See ADR-007."

#### Acceptance Criteria

- [ ] `grep -rn "KNOWN_TYPE_CONFIG" src/` returns empty
- [ ] `grep -rn "VIEW_REGISTRY" src/` returns empty
- [ ] `grep -rn "DECISION_TYPE_ID.*sections" src/` returns empty (no import from sections.js)
- [ ] `buildDynamicSections([])` still returns 3 sections in article/decision/role order (existing `sections.test.ts` tests pass)
- [ ] `buildDynamicSections([unknownRecord])` returns 4 sections with auto-derived label (existing `sections.test.ts` tests pass)
- [ ] `RecordDispatch` fallback: verified by `npm run typecheck` and `npm run build` (the `?.view ?? RecordView` pattern is type-safe; manual smoke test via `npm run e2e` confirms routing)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes (sections.test.ts all green)

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria above are met.
2. `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
3. Mark task checkboxes `[x]`.
4. Commit: `refactor: consolidate KNOWN_TYPE_CONFIG and VIEW_REGISTRY into TYPE_REGISTRY (#71)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (all sections.test.ts tests green)
- [ ] `grep -rn "KNOWN_TYPE_CONFIG\|VIEW_REGISTRY" src/` returns empty
- [ ] `grep -rn "DECISION_TYPE_ID.*sections" src/` returns empty
- [ ] Single file to edit when registering a new governance type with a custom view: `src/lib/governance/type-registry.ts`

## Coordination Rules

- Web App Worker stays within `srs-web/**`.
- No SRS semantics added to TypeScript (ADR-001). `typeVersion` is structural metadata passed opaquely to WASM.
- `buildDynamicSections` public signature is unchanged — tests must stay green without modification.
- `SectionConfig` shape is unchanged — only `type-registry.ts`, `sections.ts`, `RecordDispatch.svelte`, `App.svelte` change.
