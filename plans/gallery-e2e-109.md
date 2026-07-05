# Plan: Update gallery e2e for decision-log-only editor (#109)

## Summary

After PR #108 removed `ArticleView`, `RoleView`, and `ExerciseView` from the render dispatch (release 1 is a decision-log-only editor), `e2e/gallery.spec.ts` still references those deleted components by name. One test is named "selecting an exercise shows ExerciseView fields in the reading view" — a view that no longer exists. The file-header comment also omits exercises from the fixture summary. The assertions themselves remain valid because RecordView derives field labels from the WASM `typeSchema()` output, which maps each field's `displayLabel` → JSON Schema `title`; the same labels ("Article Text", "Role Holder", "Thinking Reached") therefore appear in RecordView as they did in the dedicated views. This plan renames the stale test, updates the file-header comment, and annotates the describe block to document the RecordView fallback behaviour. No production source changes.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | — |
| Verification | Verification Agent (srs-web) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | RecordDispatch routes by typeId; falls back to RecordView for unregistered types | accepted |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | TYPE_REGISTRY in type-registry.ts is the single registration point; `view` field optional — absent entries fall back to RecordView | accepted |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Sidebar nav is container-driven (repository_navigation / listContainers fallback); exercises appear in nav because the gallery fixture has an exercises container, not because of TYPE_REGISTRY | accepted |

No new ADRs required. The RecordView fallback for article/role/exercise is the intended behaviour per ADR-007 (TYPE_REGISTRY `view` field absent → RecordView) and the release 1 scope decision (issue #108). Nav entries (including Exercises) are container-driven per ADR-009.

---

## Contracts

### WASM API surface

**No.** This plan touches only `e2e/gallery.spec.ts`. No new or changed WASM methods are required.

### TypeScript types

No TypeScript source changes.

---

## Scope

- `e2e/gallery.spec.ts` only: rename stale test, update file-level comment, add inline comments documenting fallback behaviour.

**Out of scope:**

- Any production source file (`src/**`).
- Any other e2e spec file.
- Re-adding dedicated views for article/role/exercise — that is a separate future issue.

---

## Phases

### Phase 1: Update gallery.spec.ts

**Goal:** All references to deleted view components are removed; tests accurately describe RecordView fallback behaviour; file compiles and passes `npm run typecheck`.

**Agent:** Web App Worker

#### Tasks

- [ ] Update the file-header JSDoc comment (lines 5–12) to:
  - State that the gallery fixture contains 6 articles, 9 decisions, 3 roles, and 2 exercises.
  - Note that article/role/exercise types fall back to RecordView (RecordDispatch) since release 1 is decision-log-only.
- [ ] Rename test `"selecting an exercise shows ExerciseView fields in the reading view"` to `"selecting an exercise shows its fields in the reading view (RecordView fallback)"`.
- [ ] Update the inline comment inside that test from `// exercise-specific field label` to something accurate (e.g., `// RecordView derives label from type schema displayLabel → JSON Schema title`).
- [ ] Verify no other test name or comment still references the deleted `ArticleView`, `RoleView`, or `ExerciseView` component names.

#### Acceptance Criteria

- [ ] Test file contains no reference to `ArticleView`, `RoleView`, or `ExerciseView` by name.
- [ ] File-header comment accurately describes the gallery fixture (articles, decisions, roles, exercises counts).
- [ ] Test name for the exercise reading-view test does not claim "ExerciseView" as the rendering component.
- [ ] `npm run typecheck` passes (e2e files are checked by Playwright's tsconfig).
- [ ] `npm run lint` passes.

#### Testing

```bash
npm run typecheck
npm run lint
```

#### Milestone gate

1. Confirm all acceptance criteria above.
2. Run `npm run typecheck` and `npm run lint` — both must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `test(e2e): update gallery spec for decision-log-only editor (RecordView fallback) (#109)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] No reference to `ArticleView`, `RoleView`, or `ExerciseView` in `e2e/gallery.spec.ts`
- [ ] The exercise reading-view test name accurately describes RecordView fallback behaviour

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). This plan contains no TS semantics changes.
- Verification Agent runs `npm run typecheck` and `npm run lint` before final sign-off.

## Assumptions

- RecordView correctly shows type-schema-derived field labels for article, role, and exercise types because `type_schema_service.rs` maps each field's `displayLabel` → JSON Schema `title`, which `propertyToField` in `blueprint-utils.ts` uses as the label. The field-value assertions ("Article Text", "Role Holder", "Thinking Reached") remain valid without any production source changes.
- The gallery fixture (`e2e/fixtures/gallery.srsj`) is not modified. All counts (6 articles, 9 decisions, 3 roles, 2 exercises) are still correct.
