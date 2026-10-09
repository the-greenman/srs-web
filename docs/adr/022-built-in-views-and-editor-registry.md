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

What #338 established, as the code stands today (`src/lib/editors/registry.ts`,
`src/App.svelte`):

- Every editor is one `EditorDefinition` entry in `EDITORS`: `id`, `label`,
  `description`, `entryTypeId`, `requires: PackageRequirement[]`, optional `create`,
  `seed` and `hostsAgentPanel`, and `component: Component<EditorShellProps>`. Adding
  an editor means adding one entry.
- `availableEditors(repo, types)` returns `OfferedEditor[]` (`{editor, unmet}`). An
  editor is **offered** when `types` contains its `entryTypeId` (a UUID, never a
  namespace or name), or when its missing packages can be installed from a pinned
  bundle. It is **usable** (`unmet === null`) when the core's RFC-044 check
  (`checkPackageRequirements`) satisfies every `requires` entry.
- `usableEditor(offered, mode)` is the one shell gate. It returns the
  `EditorDefinition` App renders for `mode`, or `null`.
- A document opens in the **Generic** explorer (`editorMode === "generic"`). Package
  editors are listed in the explorer's "Package editors" group and chosen from there.
- App keeps `editorMode` as a string (`type EditorMode = string`). The gating
  `$effect` drops an editor that stops being usable back to `"generic"`.
- While the document is read-only (ADR-021), App's `offeredEditors` is empty, so no
  package editor is offered.

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
- Built-in views are listed in one constant in `registry.ts`:
  `BUILT_IN_VIEWS = ["generic", "lenses"] as const`, with the guard
  `isBuiltInView(mode)`. Each value is a **reserved `editorMode`**. App's gating
  `$effect` exempts every value `isBuiltInView` accepts from the `usableEditor` gate.
  No `EDITORS` id may equal a built-in view; a unit test enforces it.
- A new built-in view is one more `BUILT_IN_VIEWS` entry plus its App branch.
- Lenses is reached from the explorer's **Explore** group ("Lenses"). It returns with
  **Go > Explorer**, as Essay does. App owns the one `popstate` listener that chooses
  the shell: an address with a `lens` key ([ADR-023](./023-one-hash-address.md))
  selects Lenses after a load, and an address without one leaves Lenses for Generic.
- A new built-in view's component annotates its `$props()` with `EditorShellProps`
  plus the read-only props Generic takes (`readOnly?: boolean`,
  `onSaveCopy?: () => void`) and its own props, so `svelte-check` holds it to the
  editor contract. Lenses does this. `GenericSrsShell` predates the rule and keeps its
  own `Props` interface; aligning it is not part of #547.

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
- App gains one branch per built-in view. The reserved values live in one place,
  `BUILT_IN_VIEWS`, so the gating `$effect` and the collision test read the same list.
- Making Lenses the default landing later is a one-line change (the initial
  `editorMode`). It still needs its own owner decision; this ADR does not grant it.
