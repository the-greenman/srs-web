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

## Branch & PR hygiene

Every branch must trace to a GitHub issue, and every PR must link its issue. This is how the ecosystem avoids the recurring failure mode where an issue is marked closed but its fix survives only on an unmerged, abandoned branch.

- **Naming** — human-created branches use `type/<issue#>-slug` (e.g. `feat/242-cross-field-rules`, `docs/432-migrate-identity`). Cloud-agent branches (`claude/<name>-<hash>`) are exempt from the scheme but their PR **must** carry `Closes #N`.
- **Linking** — every PR body includes `Closes #N` (or `Refs #N` if it should not auto-close). No PR without an issue reference. See `.github/pull_request_template.md`.
- **Merged branches auto-delete** — the repo has `deleteBranchOnMerge` enabled; a branch is removed automatically once its PR merges. Don't recreate deleted merged branches.
- **Abandoning work** — if a PR is closed **without merging** and the work is still wanted, reopen/flag the linked issue with a pointer to the branch **before** walking away. Otherwise the issue looks done while the fix lives only on a dead branch.
- **Automated safety net** — the weekly **SRS Branch Auditor** cloud routine reports merged-but-undeleted branches and reopens any issue whose fix survives only on an unmerged branch.
