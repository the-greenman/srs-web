# CLAUDE.md

Guidance for Claude Code working in **srs-web** — the opinionated SRS governance web editor.
It is a thin client that delegates all SRS semantics to the Rust engine (`srs-rust`) via WASM
bindings; the editor adds presentation only (capability-layering). Part of the SemanticOps
monorepo.

## Project & priority management

Issues across the ecosystem are tracked on **Project #5 "SRS"** and prioritised **top-down from
user stories**. The authoritative process lives in the `srs-rust` repo:
**`docs/project-management.md`** (canonical).

Quick rules:
- **Never hand-set an implementation issue's priority.** It is derived from the user stories it
  serves (as native GitHub sub-issues): humans set **MoSCoW** on stories; `gh-project rollup`
  derives `priority: Pn` (Must→P0, Should→P1, Could→P2).
- **Bugs** floor at `priority: P1` (fixed ASAP, even without a story); **unlinked non-bug** work
  is flagged ("could get lost"), never dropped — link it to a story.
- Skills here: `/triage`, `/stories`, `/roadmap`. They fetch the released tool (works in an
  isolated checkout):
  `gh release download --repo the-greenman/srs-rust --pattern gh-project.mjs --output /tmp/gh-project.mjs --clobber`.
