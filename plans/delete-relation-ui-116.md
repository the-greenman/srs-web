# Plan: Delete relation via UI in decision inspector (#116)

## Summary

Decision link picker (#106) added the ability to create relations between decisions in the governance editor. Deleting a relation was explicitly deferred. This plan adds a ✕ delete button to each `relation-item` row in the "Decision Links" inspector section in `GovernanceShell.svelte`. On click, it calls the existing `deleteRelation(repo, rel.relationId)` WASM wrapper from `srs-client.ts`, then reloads relations with `loadDecisionRelations()`. The `deleteRelation` TS wrapper already exists, is tested, and the WASM binding is live — only the UI surface is missing.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | primary session agent |
| Web App Worker | primary session agent |
| Verification | primary session agent |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Relation deletion goes through `deleteRelation()` WASM wrapper; no SRS semantics in TS | accepted |

No new ADR required. The deletion pattern is identical to `handleAddRelation` — one WASM call, then a reactive reload. No new architectural constraint is introduced.

---

## Contracts

### WASM API surface

No new WASM methods. The existing `deleteRelation(repo, relationId)` wrapper in `srs-client.ts` (line 425) calls `repo.delete_relation(relationId)`. The binding is already present and unit-tested (tests/srs-client.test.ts lines 596–609).

### TypeScript types

No new TS types. `rel.relationId` (type `string`) is already available on each `SrsRelation` object in the `decisionRelations` array.

---

## Scope

- `src/lib/governance/GovernanceShell.svelte`: add `deleteRelation` import, `handleDeleteRelation` function, ✕ button in each `relation-item` row, CSS for the button
- `e2e/decision-link.spec.ts`: add Test 4 — deleting a relation removes it from the list

**Out of scope:**

- Confirmation dialog before delete (the action is immediately reversible by re-adding the link; consistent with the existing record-delete pattern which also has no confirm step)
- Relation details beyond type + peer label
- Relation deletion for non-decision record types

---

## Phases

### Phase 1: UI — add ✕ delete button to relation-item rows

**Goal:** Each relation row in the "Decision Links" inspector section has a ✕ button; clicking it calls `deleteRelation` and reloads the list.

**Agent:** Web App Worker

#### Tasks

- [ ] In `src/lib/governance/GovernanceShell.svelte`, add `deleteRelation` to the existing import from `$lib/srs-client.js` (line 7–20):
  ```ts
  import {
    // … existing imports …
    deleteRelation,
  } from "$lib/srs-client.js";
  ```

- [ ] Add `handleDeleteRelation` function after `handleAddRelation` (around line 501):
  ```ts
  function handleDeleteRelation(relationId: string): void {
    if (!selectedRecord) return;
    try {
      deleteRelation(repo, relationId);
      loadDecisionRelations(selectedRecord.instanceId);
      refreshValidation();
    } catch (e: unknown) {
      console.error("deleteRelation failed:", e);
    }
  }
  ```

- [ ] In the `{#each decisionRelations as rel (rel.relationId)}` block (line 713–721), add a ✕ button as the last child of each `<li>`:
  ```svelte
  <li class="inspector__relation-item" data-testid="relation-item">
    <span class="inspector__relation-type">{rel.relationType}</span>
    <span class="inspector__relation-dir">{direction}</span>
    <span class="inspector__relation-peer">{peerLabel}</span>
    <button
      class="inspector__relation-delete"
      data-testid="delete-relation-btn"
      aria-label="Delete relation"
      onclick={() => handleDeleteRelation(rel.relationId)}
    >✕</button>
  </li>
  ```

- [ ] Add CSS for `.inspector__relation-delete` in the `<style>` block after `.inspector__relation-peer` (around line 983):
  ```css
  .inspector__relation-delete {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.7rem;
    opacity: 0.4;
    padding: 0 0.15rem;
    line-height: 1;
    color: #c00;
    flex-shrink: 0;
  }
  .inspector__relation-delete:hover { opacity: 1; }
  ```

#### Acceptance Criteria

- [ ] Each relation row shows a ✕ button (`data-testid="delete-relation-btn"`)
- [ ] Clicking ✕ calls `deleteRelation(repo, rel.relationId)` and the row disappears from the list
- [ ] If deletion fails, a console error is logged; no crash
- [ ] The ✕ button is not shown for any other section (e.g. Tags)
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat: add delete button to decision relation rows (#116)`

---

### Phase 2: E2E test — delete relation

**Goal:** `e2e/decision-link.spec.ts` covers deleting a relation.

**Agent:** Web App Worker

#### Tasks

- [ ] In `e2e/decision-link.spec.ts`, add Test 4 to the existing `describe` block:
  ```ts
  test("Deleting a relation removes it from the relations list", async ({ page }) => {
    // Snapshot existing relation count before adding one
    const initialCount = await page.getByTestId("relation-item").count();

    // Create a relation (same as Test 3 setup)
    await page.getByTestId("add-relation-btn").click();
    await expect(page.getByRole("heading", { name: "Link to another decision" })).toBeVisible({ timeout: 3000 });
    await page.getByTestId("link-decision-item").first().click();
    await page.getByTestId("link-confirm").click();
    await expect(page.locator(".modal-overlay")).not.toBeVisible({ timeout: 3000 });

    // Confirm the new relation appeared (count went up by 1)
    await expect(page.getByTestId("relation-item")).toHaveCount(initialCount + 1, { timeout: 3000 });

    // Delete the last relation in the list (the one just created ends up last)
    await page.getByTestId("delete-relation-btn").last().click();

    // Count should be back to the initial value
    await expect(page.getByTestId("relation-item")).toHaveCount(initialCount, { timeout: 3000 });
  });
  ```

#### Acceptance Criteria

- [ ] Test 4 passes when run against the dev server
- [ ] Follows the same `beforeEach` setup pattern as the existing tests

#### Testing

```bash
npm run e2e
```

(Note: e2e is not in CI — typecheck, lint, and build gate this phase; run e2e in the dogfooding stage.)

#### Milestone gate

1. Test is written and `npm run typecheck` passes.
2. Commit: `test(e2e): delete relation (#116)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] WASM loads against gallery.srsj without JS errors
- [ ] Each decision-relation row shows a ✕ button
- [ ] Clicking ✕ removes the relation from the list immediately
- [ ] No regression in decision creation, editing, lifecycle transitions, link creation, tags, or validation

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). All relation mutations go through `deleteRelation()`.
- `npm run typecheck` must pass after every change.

## Assumptions

- `deleteRelation` TS wrapper and its WASM binding are already in `srs-client.ts` (line 425) and tested (lines 596–609 of `tests/srs-client.test.ts`).
- `rel.relationId` is always populated on `SrsRelation` objects (confirmed: it is the primary identifier).
- No confirmation dialog is needed — consistent with the existing Delete record button pattern.
- The gallery.srsj fixture has ≥ 2 decision records so a relation can always be created for the delete test.
