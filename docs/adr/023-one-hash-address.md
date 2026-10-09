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

**One parser.** `src/lib/address.ts` is the only module that parses or formats the URL
hash. It owns one `Address` type:

| Key | Meaning | Used by |
|---|---|---|
| `e` | essay instance id | Essay |
| `p` | paragraph to scroll to and focus | Essay |
| `z` | paragraph to zoom into | Essay |
| `lens` | lens id ([ADR-025](./025-lenses.md)) | Lenses |
| `id` | selected instance id | Lenses |
| `by` | the Collection's "Tell apart by" choice | Lenses |
| `ctxby` | the Context pane's "Tell apart by" choice | Lenses |

`formatAddress` writes keys in a fixed order and omits empty ones. `parseAddress`
ignores unknown keys and tolerates junk.

**One history.**
- A selection change (picking a record, following a link, switching lens or essay)
  **pushes** a history entry.
- A distinction change (`by`, `ctxby`) **replaces** the current entry.
- Shells react to `hashchange`. Back, reload, a pasted link and an agent writing the
  hash all go through that one path.
- The link trail lives in `history.state`. The trail's Back calls `history.back()`, so
  the visible Back and browser Back always agree. Reload keeps the trail.

**Readable keys.** Keys and values stay human-readable (short words and instance
UUIDs), so a person or an agent can write an address by hand.

**The query string stays reserved for boot links** (`?open=`, `?repo=`, ADR-021). When
a boot link clears itself it must keep the hash.

**Every shell moves onto it.** Essay and Lenses use it in #547. Generic, Governance
and Guides move to it under #426.

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
