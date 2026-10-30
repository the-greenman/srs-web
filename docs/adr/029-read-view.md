# ADR-029: The Read view, a repository as a document a person can follow

- **Status:** proposed
- **Date:** 2026-10-30
- **Issue:** [srs-web#670](https://github.com/the-greenman/srs-web/issues/670)
- **Builds on:** [ADR-001](001-thin-client.md) (thin client), [ADR-022](022-built-in-views-and-editor-registry.md) (built-in views), [ADR-023](023-one-hash-address.md) (address), [ADR-024](024-one-record-reading-component.md) (reading), [ADR-025](025-lenses.md) (presentation grouping), [ADR-027](027-editor-layers.md) (layers)
- **Evidence:** srs-lab Readers (srs-lab#32, #33); srs-programme findings `5e9735b5` and `dad2d51a`

## Context

A person opening one of our repositories meets an engine view: Generic's three columns, or Lenses' panes. The owner, 2026-10-30: "I cannot understand them at all. It may just be that the three column layout is not the right starting point." The guides, section overviews and reading order the authors wrote are in the data, but no view reads them in order. Lenses' "reader" layout is still panes: an outline beside the focus.

The srs-lab Readers prototype read the same five repositories in one column and made them followable page by page, with no change to their data.

## Decision

A built-in engine view, `read` (one more `BUILT_IN_VIEWS` entry, ADR-022), reached from the explorer's Explore group. It is one column, with no nav pane and no inspector.

**A page** is one instance read inside one container. It shows:
- the instance's text: a record through `RecordProse`, a note through its sections;
- then the entries the container's outline nests directly under it, in arranged order. Each entry shows its label, its kind, whether it opens onto more, and its first line.

**Structure is the engine's** (ADR-001):
- the front door is `repositoryNavigation`'s root container, opened on its identity record;
- an entry's children are the core outline's body entries whose `parentInstanceId` is that entry. When the page is the container's identity or anchor, they are the entries whose parent is null;
- labels, records and `sectionContainerId` come from the resolved container view;
- an entry that roots a section container opens in that container. The section container wins: if the current outline also nests entries under that entry, they are not shown. That is a data fix, reported by the readability audit.

The client derives no nesting, membership or label of its own.

**First lines** come from the same body choice `RecordProse` makes, moved to the pure `proseView` (`src/lib/prose.ts`), so a page and its listing never pick different text.

**A wall** is more than `WALL` (15) entries under one page. It is grouped by ADR-025's presentation grouping (`splittingBy` over `collectionOptions`, then `groupItems`). Each group is a closed `<details>`, so a reader picks a group before an item. When no distinction splits the wall (every item the same kind, with no state or creator), it stays one list. A note is named "Note", so its kind, its group and its label agree.

**Address** (ADR-023): `read=<containerId>` selects the view and names the outline being read, and the shell-neutral `id` names the page. App chooses Read for a `read` key, as it chooses Lenses for `lens`. Opening an entry pushes the address with the link trail; Back and the breadcrumb are `history.go(-n)`. Entering with no `read` key (from the explorer) pushes the front door's address, once: Read always enters at the front door. Lenses instead returns to its last visit; Read's place is its address. A hash with both `lens` and `read` opens Lenses.

**Default landing: an experiment** (the owner, 2026-10-30, srs-programme vignette `33e22c92`: "lets try the default to read view. It is a worthwhile experiment. We need to see if it makes reading these repos easier by default.").
- A repository that has an identity record and at least one navigation section opens on Read, unless the address names another view (`lens`, an essay).
- Any other repository opens in the explorer, as before.
- The viewer can turn the default off with View > Open repositories in Read. The setting is stored per viewer (`localStorage` `srs-web.open-on-read`). Explore > Read always works.
- The end-to-end suite stores that setting as off, so specs written for the explorer keep their landing; `e2e/read.spec.ts` tests the default.
- What a repository itself declares as its default view (the owner: "A repo should probably be able to specify a default way to be seen. Packages will define what editors/ renderers are available.") is not decided here. It needs the spec and is an open exercise.

**Read-only by design.** The view never writes. Edits stay in Generic, Lenses and the package editors.

**Layers** (ADR-027):
- headless: `src/lib/prose.ts`, `src/lib/read/read-model.ts`;
- component: `ReadPage.svelte`, specimen on `/styleguide`;
- screen: `ReadShell.svelte`.

**Help** (the `data-feature` contract) is not given yet; Lenses has none either. It is srs-web#672.

## Alternatives considered

- **A fifth Lenses layout.** It would add no new address key, but Lenses' layouts arrange the same three panes, and the evidence is that one column without panes is what reads. It would also carry Lenses' selection, set and distinction state into a view that needs none of it. Rejected.
- **Leave the explorer as the landing, with Read one click away.** This was the status quo, which ADR-022 left to its own owner decision. The owner chose the default-Read experiment instead (PR #673, ask A1).
- **Group walls by linked record (for example a finding's component) or walk relations by category.** The Readers measurements show link grouping reads best where it exists. But it needs per-item relation reads or an engine group-by, and the reach rule is a spec question (srs#726). Deferred.

## Consequences

**Positive:**
- Every repository opens as a document with no package, using the structure its authors built.
- The read is a link: `read` plus `id` survives reload and can be shared.

**Negative / trade-offs:**
- One more address key, a public contract once shipped (ADR-023).
- A repository whose root container holds no identity or sections opens on an empty page; the readability audit (srs-lab) names that as a data fix.
