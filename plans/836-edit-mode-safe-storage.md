# Plan: edit-mode.ts uses the shared safeStorage() helper

## Summary

`src/lib/essay/edit-mode.ts` (added 2026-11-24, #752) duplicates the ad hoc `try/catch`-around-`localStorage` pattern that `src/lib/safe-storage.ts` (added the same day, #828) was written to replace. This plan routes `edit-mode.ts` through `safeStorage()`. Pure internal DRY cleanup — no behavior change, no new surface.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | self (no sub-agents needed — single-file, behavior-preserving change) |
| Web App Worker | self |
| Verification | self (milestone gate) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS — unaffected, no SRS semantics touched | accepted |
| [ADR-027](../docs/adr/027-editor-layers.md) | Layer: headless (`edit-mode.ts` has no markup, no `document`, no `.svelte` import) — change stays inside its existing layer | accepted |

No new ADR needed: this doesn't establish a new constraint, it applies an existing one (`safeStorage()`, #828) that was simply missed.

---

## Contracts

### WASM API surface

No. Purely a browser-storage access helper; no SRS semantics, no WASM call.

### TypeScript types

No new types. `EditMode` is unchanged.

---

## Scope

- Rewrite `src/lib/essay/edit-mode.ts` to import and use `safeStorage()` from `../safe-storage.js`.

**Out of scope:**

- Every other `localStorage` call site in the codebase that duplicates this same ad hoc try/catch pattern instead of using `safeStorage()` (`Panel.svelte`, `EssayShell.svelte`, `wide.ts`, `read/read-model.ts`, `columns.ts`, `help/help.ts`, `Styleguide.svelte`, `browser-cache.ts`, `actor.ts`'s fallback, and any others review turns up) — none of these crash today (each already has its own try/catch), so there is no bug to fix, only a consistency cleanup. One rule for all of them: route every direct `localStorage` reference through `safeStorage()`. That is a single mechanical, multi-file, low-risk PR — tracked as a follow-up issue rather than folded into this one-file fix, so this plan's diff stays reviewable as one thing.
- `relay-host.ts` / `agent-connections.ts` — these inject `storage` as a parameter for testability (dependency injection), a different and intentional pattern; not a blocked-storage bug.

---

## Phases

### Phase 1: Migrate edit-mode.ts

**Task 1.1** — `src/lib/essay/edit-mode.ts`: replace direct `localStorage` references with `safeStorage()`:

```ts
import { safeStorage } from "../safe-storage.js";

export function editMode(): EditMode {
  try {
    return safeStorage()?.getItem(KEY) === "source" ? "source" : "visual";
  } catch {
    return "visual";
  }
}

export function setEditMode(mode: EditMode): void {
  try {
    safeStorage()?.setItem(KEY, mode);
  } catch {}
}
```

`safeStorage()` only guards *access* to the `localStorage` global (the `SecurityError` on the property getter itself); it does not guard a throw from a method call on the object it returns. `tests/edit-mode.test.ts` stubs `getItem`/`setItem` to throw directly, and `nav-tree.ts`'s `loadExpanded`/`saveExpanded` establish the precedent of keeping a try/catch around the method call in addition to `safeStorage()` — so `editMode()` keeps its try/catch around the read, matching `setEditMode()`'s write-side try/catch (caught in review by both the Architecture Reviewer and the Plan Reviewer; fixed before implementation).

Layer: headless (`src/lib/essay/`). No markup/`document`/`.svelte` import — unchanged.

**Milestone gate:** `npm run typecheck && npm run lint && npm run build && npm test && npm run e2e` green.

---

## Final Acceptance

- [ ] `edit-mode.ts` uses `safeStorage()`; no code path references `localStorage` directly (the file's leading doc comment may still say "localStorage" in prose).
- [ ] Existing `edit-mode` tests pass unmodified (behavior identical: `undefined` storage ⇒ same fallback as a throw did before).
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run e2e` all green.
