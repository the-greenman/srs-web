# ADR-003: Blueprint schema drives the composite editor; document views drive rendered output

**Status:** Accepted
**Date:** 2026-06-08
**Issue:** [srs-web#26](https://github.com/the-greenman/srs-web/issues/26)

## Context

The guides editor (Track C) must let a user author a muDemocracy guide — a guide record plus an
ordered set of section records of several types — in one coherent surface, and separately produce
the rendered/exported output that downstream tooling consumes.

The SRS spec provides two distinct entities that could each plausibly drive a "guides editor",
and they are easy to conflate:

- **Blueprint** (`ext:schema`) — defines *what a document type is*: its root Types, the expected
  Relations between extracted Records (`structure: RelationSpec[]`), and what "complete" means.
  Projecting a Blueprint yields a nested JSON Schema (`properties.root` + child-arrays per
  relation + per-type `definitions`).
- **Document View** (`ext:views-l2`) — defines *how existing Records are assembled into readable
  output*. Projecting one yields a `DocumentViewProjection` (sections, records, ordered field
  values, field groups).

The spec is explicit that these are complementary but not interchangeable
(`srs/srs` design-notes [026](../../../srs/srs/records/design-notes/026-schema-vs-view-the-extraction-gap.json)
"schema-vs-view-the-extraction-gap" and
[007](../../../srs/srs/records/design-notes/007-why-schema-is-a-new-concept.json)
"why-schema-is-a-new-concept", and the `ext:schema` subsection 07-4):

> A View answers: given a Record that already exists, how do I render it for a specific audience?
> A Blueprint answers: given source material, what Records should I extract, and how do they relate?
> A Document View cannot serve as an extraction blueprint because it assumes Records already
> exist. A Blueprint cannot serve as a Document View because it does not specify how to render
> field values for an audience.

The canonical pipeline is **Blueprint → Records → Document View.**

## Decision

The guides editor is split along the same seam the spec draws:

1. **The composite *authoring* surface is driven by the blueprint schema.** The guides editor
   reads the guide blueprint's nested JSON Schema and generates a composite, multi-record form —
   the root guide form plus an ordered list of section forms, with an "add section" picker over
   the section `oneOf`. Per-type fields and field groups are rendered with the existing B9
   type-schema form components. The editor creates and updates the guide and its section records
   directly (`createRecord` / `updateRecord`).

2. **The *render* surface is driven by document views.** Producing rendered or exported output
   (the JSON `DocumentViewProjection`, and any future preview pane) calls
   `render_document_view`. This is a separate concern owned by C10 (export) — **not** the editor.

3. **Neither substitutes for the other.** The editor never calls `render_document_view`; the
   render/export path never reconstructs editable forms from a projection. They are linked only
   through the underlying records.

## Consequences

- **C8 (#26)** depends on the C2 `blueprintSchema` binding and the B9 components only. It does
  **not** depend on or import `renderDocumentView`. Round-tripping an edit in tests uses
  `exportSrsj` (B10), not the document view.
- **C10 (#28)** owns the `renderDocumentView` client wrapper and the JSON-view export action.
- A live in-editor *preview* (render the guide while editing) is a legitimate future feature but
  is a render-surface concern: it consumes a document view and would be a new issue, never folded
  into the blueprint-driven editor.
- The vocabulary is fixed: the blueprint-driven surface is an **editor**, not a "renderer".
  Calling it a renderer inverts the spec's terminology and is avoided in code and docs.
- If a guide's authorable structure changes, the change is made in the **blueprint** (muSrs) and
  flows into the editor automatically via the schema — no hardcoded guide forms in TypeScript
  (consistent with [ADR-001](001-thin-client.md): zero SRS semantics in TypeScript).
