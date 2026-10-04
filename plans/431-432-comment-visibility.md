# Plan: One comment-thread visibility state (#431, #432)

## Summary

A thread was visible when any of `commentMode`, `zoomId === id` or `openThreads` was on, so it could not be hidden again (#431), and it ignored hidden paragraphs (#432). One set of opened paragraph ids replaces all three; the rules live in a pure module.

## Agent Assignments

| Role | Agent |
|---|---|
| Web App Worker | Sonnet |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | UI state only, no SRS semantics | accepted |

## Contracts

- WASM API: no change. TypeScript types: no change.

## Scope

- `src/lib/essay/thread-visibility.ts` (pure rules + unit tests), wired in `EssayShell.svelte` and `header-actions.ts`.
- e2e in `e2e/essay-comments.spec.ts`.

**Out of scope:** persisting thread state; the #423 menu.

## Phases

### Phase 1: One visibility state

**Goal:** One source of truth for thread visibility.

**Agent:** Web App Worker

#### Tasks

- [x] `thread-visibility.ts`: `isShown` (open and not hidden/inherited), `toggle`, `setOpen`, `summary`, `toggleAll`.
- [x] Header Comments = show all / hide all; `aria-pressed` true / false / "mixed".
- [x] Badge toggles one; zoom opens its thread; posting opens it; all stay closable.
- [x] Hidden paragraph: no thread, margin marks inert; unhide restores.
- [x] Unit and e2e tests.

#### Acceptance Criteria

- [x] The e2e cases listed in #431 and #432 pass; no regression in the other specs.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

#### Milestone gate

Gates green; commit referencing (#431, #432).

## Final Acceptance

- [x] typecheck, lint, tests, build pass

## Assumptions

- Header Comments is symmetric over the non-hidden paragraphs in view: show opens them, hide closes them; hidden and out-of-zoom state is untouched.
