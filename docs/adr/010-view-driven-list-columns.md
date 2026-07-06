# ADR-010: List-pane columns are driven by the resolved DocumentView column spec

- **Status:** accepted
- **Date:** 2026-07-06
- **Issue:** [srs-web#94](https://github.com/the-greenman/srs-web/issues/94)
- **Builds on:** [ADR-001](./001-thin-client.md) (thin client), [ADR-009](./009-container-driven-nav.md) (container-keyed nav)

## Context

ADR-009 made the sidebar container-driven: each nav entry is a container, and the
active container's members are the list rows. But *which fields those rows display*
was still decided in TypeScript. The generic governance list rendered each member
through `Card` with two hardcoded, name-based field lookups:

```ts
{@const articleNumber = getStringField(record, "article_number", fieldMetaMap)}
{@const status        = getStringField(record, "status", fieldMetaMap)}
```

`getStringField(record, "<name>", …)` resolves a field by **name** and is the same
class of leaf-client semantics ADR-001 exists to remove: the client, not the core,
decides which fields matter and matches them by a governance-specific field name. It
is also per-type hardcoding — the columns for an Articles list and a Roles list are
identical because the TypeScript, not the data, chose them.

The core already resolves this. `resolve_container_view(containerId)`
(srs-rust#254, wrapped as `resolveContainerView()` in `srs-client.ts`) returns a
`ContainerView` whose `columns: ColumnSpec[]` is derived from the container's
governing DocumentView's L1 field-view — the field **UUIDs**, order, and display
labels the view author selected. Each `ColumnSpec` carries `{ fieldId, fieldName,
displayLabel, order, required }`.

## Decision

The generic governance list pane renders its columns from
`resolveContainerView(containerId).columns`, not from name-based `getStringField`
lookups.

- **Which fields show, and in what order** comes from `ColumnSpec[]` (the DocumentView
  field selection), resolved by the core.
- **A cell's value** is read positionally by the core-provided opaque UUID:
  `record.fieldValues.find(fv => fv.fieldId === col.fieldId)?.value`. Selecting a value
  at a UUID the core told us to display is presentation, not semantics — no field-name
  logic remains in the list.
- **The row title** is the core-resolved `displayLabel` (already established by
  srs-web#91). Titles are never re-derived from `fieldValues`.
- **Row identity/order** is unchanged from ADR-009: the list rows are the active
  container's members (`containerRecords`, built from `getContainer().memberInstanceIds`).
  This change touches only *which columns* each row shows — not the row set. Unifying the
  row source onto `ContainerView.members` (as `GuidesShell` already does) is left to the
  #137 convergence; in the gallery the two membership resolutions coincide. Either way
  there is no client-side `records.filter(typeId)` bucketing.
- When the governing DocumentView selects no fields (`columns` empty), rows render
  **title-only** — a legitimate, view-authored outcome, not a fallback to hardcoded fields.
- `TYPE_REGISTRY` remains **presentation hints only** (icon, optional custom detail
  component — e.g. `DecisionLogView`). Removing a type from `TYPE_REGISTRY` does not
  change *what* the list shows.
- The list card no longer renders the old header **article-number id** slot or the
  **coloured status `Tag`** badge: those were driven by name-based `getStringField`
  lookups. Status now appears (as plain text) only if the view selects it as a column.
  Re-introducing a coloured status badge would require the client to special-case "the
  status field" — exactly the name-based semantics `ColumnSpec` withholds — so it is not
  reinstated here.

`getStringField` / `getFieldValue` are **not** deleted — they are still used for
non-list concerns (inspector `status`/lifecycle, the decision path). This ADR governs
the **list pane** only.

## Rationale

- **ADR-001 compliant.** The column selection and label resolution live in the core.
  The TypeScript reads values at core-provided UUIDs and renders them — no SRS semantics.
- **View-authored, not type-hardcoded.** Two containers of the same root type could
  show different columns if their DocumentViews differ; a container's columns change by
  editing its view, with zero TypeScript change.
- **Consistent with the Guides path.** `GuidesShell` already consumes
  `resolveContainerView()`. Driving the governance list from the same call is the step
  that makes the #137 convergence (a shared container-view list component) a
  presentation refactor rather than a semantics change.

## Consequences

**Positive:**
- The list's columns are data, not code. A new governance type with a DocumentView
  surfaces correct columns with no TypeScript change.
- One less name-based field lookup path in the client; `getStringField` is confined to
  the inspector and decision path, both tracked for further reduction.

**Negative / trade-offs:**
- A container whose DocumentView has no `rootTypeRefs` (so no view resolves) or no
  `renderViewId` (so no L1 field selection) shows **title-only** rows. In the gallery
  the Articles/Roles DocumentView had neither, so this ADR ships alongside a **data
  enrichment** of `gallery.srsj` (add `rootTypeRefs` + per-section `renderViewId` + two
  L1 views) so the mechanism is demonstrable. The canonical `srs` gallery is enriched
  via a follow-up.
- Member ordering is the core's current member order. Applying the DocumentView's
  authored `ordering` (e.g. Articles by `article_number`) is **not** in scope here and
  is tracked as a follow-up — the same class of core-ordering debt as srs-web#122
  (precedes ordering).
- `resolve_container_view` (no explicit `view_id`) selects the governing DocumentView via
  `document_views_for_container(...).next()` — the **first** view whose `rootTypeRefs`
  match the container root's type. This is not triggered here (each section's
  `source.containerId` targets the correct container, so `select_governing_section`
  resolves the right columns even though one DocumentView covers both Articles and Roles),
  but the first-match tie-break is a latent core ambiguity when multiple views match one
  root type. Tracked as an `srs-rust` follow-up rather than worked around in the client.

## Alternatives considered

- **Keep hardcoded `article_number`/`status` as a fallback when `columns` is empty.**
  Rejected — that re-introduces the exact name-based semantics this change removes; the
  empty-columns case is handled by title-only rows plus data enrichment.
- **Extract a reusable `ContainerMemberList` component now.** Deferred to #137, where
  `GuidesShell` is refactored onto the same component; guessing the shared API before
  both consumers' needs are folded in risks churn.
