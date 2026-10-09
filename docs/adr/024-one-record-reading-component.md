# ADR-024: One component for reading a record as prose

- **Status:** Accepted (2026-10-09, with [srs-web#553](https://github.com/the-greenman/srs-web/pull/553))
- **Date:** 2026-10-09
- **Issue:** [srs-web#547](https://github.com/the-greenman/srs-web/issues/547), [srs-web#137](https://github.com/the-greenman/srs-web/issues/137) (converge list and detail)
- **Builds on:** [ADR-001](./001-thin-client.md) (thin client), [ADR-006](./006-dynamic-dispatch-replaces-sections.md) and [ADR-007](./007-unified-type-registry.md) (typeId-keyed view dispatch), [ADR-013](./013-repo-context.md) (repo context)
- **Related:** [ADR-025](./025-lenses.md)

## Context

A record is read in several ways today:

- `RecordDispatch` picks a view from `TYPE_REGISTRY` and falls back to `RecordView`.
  `RecordView` renders a labelled field card (`Card`, `CardField`). It needs the
  `fieldMeta` context, which only GovernanceShell sets.
- `RecordReading` wraps `RecordDispatch` for the governance canvas.
- Generic's inspector shows a raw `name: value` list.
- The Lenses prototype added a fourth: prose with an unlabelled body, chips for short
  values and composites as tables.

Two fresh-eyes reviews found the prose reading is what fixes "you never know whether
you are reading or administering". Adding it as a fourth private copy inside a lens
component would be one more way to do one goal.

## Decision

`src/rendering/RecordProse.svelte` is **the one component for reading a record as
prose**:

- The title is the heading.
- The main body (the first long text field) is shown without a label.
- Short values show as one line of chips.
- Composite fields show as tables.
- It never shows `aiGuidance`, required markers or empty fields.
- It takes props only (record, fields, composites, heading). It depends on no shell
  context, so it renders in any shell.
- Field and type labels come from the one shared label module, `src/lib/labels.ts`
  (`fieldLabel`, `humanise`), which the editor forms and Lenses import too. A form and
  a reading never label the same field differently.

**Forms stay the editing component.** `SectionForm` edits; `RecordProse` reads.

**Type-registered views still win.** A type with a view in `TYPE_REGISTRY` (ADR-006,
ADR-007) renders through that view. `RecordProse` is the reader for every other type.

**Adoption:**
- Lenses uses it now, for Focus Read and every Document block ([ADR-025](./025-lenses.md)).
- `RecordDispatch`'s fallback and the Generic inspector adopt it under #137.

## Alternatives considered

- **Keep the prose reading inside the Lenses Focus pane; converge later.** Smallest
  diff, but a fourth reader no other shell can import. Rejected.
- **Render Lenses through `RecordDispatch` / `RecordView` now.** One path at once, but
  it brings back the labelled-form look the reviews rejected. It also needs
  `fieldMeta` context set inside Lenses. Rejected.

## Consequences

**Positive:**
- The reading component lives in the rendering layer, where #137 says record detail
  converges.
- No context dependency, so it avoids ADR-013's trap and works outside GovernanceShell.
- Governance and Generic are untouched in #547, so there is no regression risk there.

**Negative / trade-offs:**
- Until #137 lands there are still several readers: `RecordProse`, `RecordView` and
  Generic's inspector.
- Which field is "long" is a presentation heuristic over the type schema. It is marked
  `ponytail:` in the component.
