# ADR-022: Built-in engine views sit outside the editor registry

- **Status:** proposed
- **Date:** 2026-10-09
- **Issue:** [srs-web#547](https://github.com/the-greenman/srs-web/issues/547) (Lenses); records [srs-web#338](https://github.com/the-greenman/srs-web/issues/338) (editor registry)
- **Supersedes:** [ADR-002](./002-editor-mode-selection.md)
- **Builds on:** [ADR-001](./001-thin-client.md) (thin client), [ADR-021](./021-open-from-url.md) (read-only is a document state)
- **Related:** [ADR-023](./023-one-hash-address.md), [ADR-024](./024-one-record-reading-component.md), [ADR-025](./025-lenses.md)

## Context

ADR-002 chose an explicit mode picker shown before the file picker, with two fixed
editors (Governance, Guides). That picker is gone. srs-web#338 replaced it with one
editor registry, `src/lib/editors/registry.ts`, and no ADR recorded the change.

What #338 established, as the code stands today:

- Every editor is one `EditorDefinition` entry in `EDITORS`: `id`, `label`,
  `entryTypeId`, `requires` (package requirements), optional `create`, and a
  `component` type-checked against `EditorShellProps`. Adding an editor means adding
  one entry.
- An editor is **offered** only when the repository's resolved types contain its
  `entryTypeId` (a UUID, never a namespace or name). It is **usable** when its
  `requires` are met by the core's RFC-044 check (`availableEditors`, `usableEditor`).
- A document opens in the **Generic** explorer (`editorMode === "generic"`). Package
  editors are listed in the explorer's "Package editors" group and chosen from there.
- App keeps `editorMode` as a string. An editor that stops being usable drops back to
  `"generic"` and stays there.
- While the document is read-only (ADR-021), `offeredEditors` is empty, so no package
  editor is offered.

srs-web#547 adds Lenses, a view that reads engine structures only (navigation,
containers, compositions, types, relations). It needs no package and no entry type.
It must also work on read-only links. A registry entry cannot express that: the
registry's invariant is "offered because an entry type UUID is present", and the
read-only rule empties the registry.

## Decision

The editor registry keeps one meaning: **package editors**, offered when the
repository contains their entry type UUID and usable when their requirements are met.
Generic is the default view. Read-only documents offer no package editors. This is
the rule #338 put in place, now recorded.

**Built-in engine views** are a second, separate kind:

- A built-in engine view works on any repository. It reads engine structures only, so
  it needs no entry type and no package.
- Built-in views are **not** registry entries. They do not appear in "Package editors".
- They work on read-only documents. Editing controls inside them follow the document's
  read-only state, as Generic's do (ADR-021).
- There are two today: the Generic explorer and Lenses ([ADR-025](./025-lenses.md)).
- Each one has a **reserved `editorMode` value**: `"generic"` and `"lenses"`. These
  values are exempt from the `usableEditor` gate. No registry entry may use a reserved
  id.
- Lenses is reached from the explorer's **Explore** group ("Lenses"). It returns with
  **Go > Explorer**, as Essay does. A Lenses address in the hash
  ([ADR-023](./023-one-hash-address.md)) also selects it after a load.
- A built-in view's component takes `EditorShellProps` (plus the read-only props
  Generic takes), so it is checked against the same contract as every editor.

## Alternatives considered

- **A registry entry with an optional `entryTypeId`, "always available".** One list of
  shells, but it breaks the registry's stated invariant. It vanishes on read-only links
  unless the read-only rule gets a special case. The picker would list an engine view
  as a package editor. Rejected.
- **Lenses as the default landing, replacing Generic.** It would answer SP-48 fully,
  but #547 scopes it out ("No current shell is replaced"). It needs its own owner
  decision after use. Deferred, not rejected.

## Consequences

**Positive:**
- The registry stays honest: every entry is a package editor keyed on a type UUID.
- Lenses works on every repository, read-only links included.
- ADR-001 holds: a built-in view adds presentation over existing engine bindings only.

**Negative / trade-offs:**
- App gains one branch per built-in view, and the gating `$effect` must know the
  reserved values. A third built-in view needs this ADR amended.
- Making Lenses the default landing later is a one-line change (the initial
  `editorMode`). It still needs its own owner decision; this ADR does not grant it.
