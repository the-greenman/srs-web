# ADR-023: One hash address and one history for every shell

- **Status:** proposed
- **Date:** 2026-10-09
- **Issue:** [srs-web#547](https://github.com/the-greenman/srs-web/issues/547), [srs-web#426](https://github.com/the-greenman/srs-web/issues/426) (address for every shell; narrowed by #547)
- **Builds on:** [ADR-001](./001-thin-client.md) (thin client), [ADR-021](./021-open-from-url.md) (query string is for boot links)
- **Related:** [ADR-022](./022-built-in-views-and-editor-registry.md), [ADR-025](./025-lenses.md)

## Context

No ADR governs the URL hash today. Essay has its own module,
`src/lib/essay/address.ts`: `#e=<essayId>&p=<paragraphId>&z=<paragraphId>`, written
with `history.pushState` in `EssayShell.svelte`. The Lenses prototype wrote a second
scheme (`#repo=&lens=&id=&by=&ctxby=`) with `replaceState` and read it only at mount,
so browser Back did not walk selections. The prototype also kept an in-app link trail
with its own Back button, separate from browser history.

Two parsers mean agents learn two schemes. Two Backs can disagree. Both are two ways
to reach one goal. #426 asks for one `src/lib/address.ts` used by every shell.

## Decision

**One parser.** `src/lib/address.ts` is the only module that parses, formats or
writes the URL hash. It owns one `Address` type:

| Key | Field | Meaning | Used by |
|---|---|---|---|
| `e` | `essayId` | essay instance id | Essay |
| `p` | `paragraphId` | paragraph to scroll to and focus | Essay |
| `z` | `zoomId` | paragraph to zoom into | Essay |
| `lens` | `lens` | lens id, a `LensId` ([ADR-025](./025-lenses.md)) | Lenses |
| `id` | `instanceId` | the selected instance id | every shell (Lenses in #547; Generic, Governance, Guides under #426) |
| `by` | `by` | the Collection's "Tell apart by" choice | Lenses |
| `ctxby` | `ctxBy` | the Context pane's "Tell apart by" choice | Lenses |

`id` is **shell-neutral**: it names the selected instance whichever shell reads it, so
#426 reuses it rather than adding a key per shell. A shell that cannot resolve `id`
selects nothing; it never errors and never guesses a neighbour.

**Value grammar.**

- `lens`: `nav:<sectionContainerId>` | `comp:<compositionId>` | `type:<typeId>` |
  `pkg:<lensDefinitionId>` (reserved) | `find` | `set`. `parseAddress` drops a value
  that does not match; an unresolvable id falls back as ADR-025 says.
- `by`: `none` | `type` | `nesting` | `container` | `state` | `created-by` |
  `field:<fieldId>`. A field is named by its **field id** (UUID), never its name.
- `ctxby`: `link-type` | `none` | `boundary`.
- `parseAddress` keeps `by` and `ctxby` as strings. The Lenses module that owns each
  grammar (`src/lib/lens/lens-distinctions.ts`) parses it, and an unknown value means
  the default.

**Encoding.** `formatAddress` uses `URLSearchParams`, so `:` is written as `%3A`.
`parseAddress` accepts both a raw `:` and `%3A`. A person or an agent may write either
form; `parseAddress(formatAddress(a))` equals `a` for every valid `a`.

**Writing.** `formatAddress` writes keys in the fixed order of the table and omits
empty ones. `parseAddress` ignores unknown keys and tolerates junk. Shells never call
`history.pushState` or `history.replaceState` for the hash themselves; they call:

- `pushAddress(a, trail?)` for a selection change (picking a record, following a link,
  switching lens or essay, leaving Lenses by Go > Explorer);
- `replaceAddress(a, trail?)` for a distinction change (`by`, `ctxby`) and for clearing
  lens keys when the repository changes;
- `readTrail()` to read the link trail kept in `history.state`.

**One history.**
- Back, reload, a pasted link and an agent writing the hash all arrive as one
  `hashchange`. App owns the one handler that **chooses the shell** (ADR-022): a `lens`
  key selects Lenses, no `lens` key leaves Lenses for Generic. A shell's own listener
  only re-applies **selection** within that shell.
- The link trail lives in `history.state`. The trail's Back calls `history.back()`, so
  the visible Back and browser Back always agree. Reload keeps the trail.
- Opening another repository clears the lens keys (`lens`, `id`, `by`, `ctxby`) with
  `replaceAddress`, so a stale lens never applies to a different repository.

**Readable keys.** Keys and values stay human-readable (short words and instance
UUIDs), so a person or an agent can write an address by hand.

**The query string stays reserved for boot links** (`?open=`, `?repo=`, ADR-021). When
a boot link clears itself it must keep the hash.

**Every shell moves onto it.** Essay and Lenses use it in #547; Essay's `push` helper
(its one `history.pushState`) becomes `pushAddress`. Generic, Governance and Guides move
to it under #426.

## Alternatives considered

- **Lenses keeps its own hash parser; #426 unifies later.** Smallest diff, but two
  parsers is the drift the one-way-per-goal rule forbids. Rejected.
- **Close #426 in #547 by moving every shell now.** Adds four shells' selection
  rewiring to an already large PR. Rejected for #547; it stays #426's work.
- **A separate in-app trail with its own Back.** Two histories that can disagree.
  Rejected.

## Consequences

**Positive:**
- One address scheme from the start. An agent learns one set of keys.
- Back, reload and external hash writes land on the same selection.

**Negative / trade-offs:**
- Essay's import path changes (no behaviour change; covered by `tests/address.test.ts`).
- Until #426 lands, Generic, Governance and Guides have no address. Their selection is
  lost on reload.
- New keys are a public contract once shipped. Renaming one breaks saved links.
