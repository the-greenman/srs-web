# ADR-002: Explicit editor-mode selection

**Status:** Accepted  
**Date:** 2026-06-08  
**Issue:** [srs-web#25](https://github.com/the-greenman/srs-web/issues/25)

## Context

`srs-web` began as a single-purpose governance viewer (Track B). Track C adds a second editor for
muDemocracy guides. These two editors serve different SRS repositories with different type
hierarchies — a governance `.srsj` is structurally different from a muSrs guides `.srsj`. There
are three possible approaches to routing between them:

1. **Auto-detect from file contents** — inspect the loaded `.srsj`'s namespace or types to infer
   which editor to show.
2. **Explicit mode selection** — present a mode picker before the file upload step.
3. **URL routing** — separate routes (e.g. `/governance`, `/guides`) with a redirect at root.

## Decision

Use **explicit mode selection (option 2)**. On reaching the idle state, the app shows a mode
picker that requires the user to choose `Governance Editor` or `Guides Editor` before the file
picker is presented.

## Rationale

- **Simple.** No heuristics, no ambiguity. The user knows which editor they want.
- **Avoids false positives.** Auto-detection would need to inspect type namespaces and could
  misclassify a muSrs governance sub-repo as a guides repo (or vice versa) if namespaces overlap
  in future.
- **URL routing is over-engineered** for the current use case — both editors load `.srsj` files
  from the local filesystem; there is no need for shareable deep links at this stage.
- The governance editor path is completely unchanged after mode selection — the same file input,
  the same three-pane UI. No regression risk.

## Consequences

- All existing e2e tests that relied on "SRS Governance Viewer" being visible immediately on
  idle must add a `mode-governance` click step in their `beforeEach`. This was done as part of
  this ADR's implementation.
- Future editors can be added to the mode picker without changing the loaded-state routing
  logic — just add a new button and branch in the loaded state.
- If auto-detection is needed later, it can be added as a convenience that pre-selects the
  relevant mode button, bypassing the need for the user to click.
