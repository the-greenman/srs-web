# ADR-013: SrsRepository exposed to rendering layer via Svelte context

- **Status:** proposed
- **Date:** 2026-07-17
- **Issue:** [srs-web#217](https://github.com/the-greenman/srs-web/issues/217)
- **Supersedes:** —
- **Superseded by:** —

## Context

Rendering-layer view components (`src/rendering/`) are registered in `TYPE_REGISTRY`
(ADR-007). The registry interface is `view?: typeof RecordView`, where `RecordView`
accepts only `{ record: SrsRecord; title?: string }`. `RecordDispatch` calls view
components with only `{ record }`, following this contract.

`rendering/DecisionView.svelte` and `rendering/DecisionSummaryCard.svelte` need access
to `SrsRepository` to call `repo.get_field_value_by_name(instanceId, fieldName)` (the
WASM binding, ADR-001). Adding `repo` as a prop would require changing the TYPE_REGISTRY
interface and updating every registered view, breaking ADR-007's single-edit-point
guarantee.

The existing `fieldMeta` context (`src/lib/governance/field-meta.ts`) demonstrates the
established pattern for sharing data that is stable across a rendered repository session
without prop-drilling through the dispatch chain.

## Decision

`SrsRepository` is exposed to the rendering layer via a Svelte context, following the
`fieldMeta` pattern exactly. A new module `src/lib/governance/repo-context.ts` exports:

- `REPO_CONTEXT_KEY: Symbol`
- `RepoContext: { readonly repo: SrsRepository }`
- `setRepoContext(getRepo: () => SrsRepository): void` — called once during
  `GovernanceShell.svelte` synchronous init.
- `getRepoContext(): RepoContext` — called once during rendering component init;
  access `.repo` inside `$derived` to track reactive changes.

`GovernanceShell` is the single setter. Rendering components call `getRepoContext()` at
init, then access `.repo` reactively. The TYPE_REGISTRY interface (`{ record: SrsRecord }`)
is unchanged.

## Consequences

**Positive:**
- Rendering-layer components can call WASM methods (e.g. `get_field_value_by_name`)
  without any prop-drilling through `RecordReading` → `RecordDispatch` → view component.
- ADR-007 single-edit-point contract is preserved — adding a new registered view does not
  require passing `repo` as a prop.
- The context getter pattern is identical to `getFieldMetaContext()` — consistent API
  for rendering-layer init code.

**Negative / trade-offs:**
- Rendering components that call `getRepoContext()` will throw (or return undefined) if
  rendered outside a `GovernanceShell` subtree. This is currently not a risk (all
  rendering is under `GovernanceShell`), but future usage outside that tree would need to
  ensure the context is set.

**Neutral:**
- The context is reactive: `getRepo` is a getter function, so `.repo` in the context
  reflects the current `repo` `$state` value in `GovernanceShell`. Components using
  `.repo` inside `$derived` will re-render when `repo` changes (e.g., on document reload).

## Relationship to other ADRs

- **ADR-001:** Rendering components use this context to call `repo.get_field_value_by_name`,
  which replaces the ADR-001-violating TS-side field scan in `field-helpers.ts`.
- **ADR-007:** Context is chosen over prop injection precisely to preserve the TYPE_REGISTRY
  view interface established by ADR-007.
