---
description: Plan → review → implement → PR pipeline for an srs-web feature. Autonomous between human checkpoints.
argument-hint: <feature description, or issue #N>
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, TodoWrite, WebFetch
---

# /ship-web — srs-web feature pipeline

You are running the full delivery pipeline for this srs-web feature:

> $ARGUMENTS

Run autonomously between stages — do not pause for minor decisions you can resolve from context. Use TodoWrite to track the stages below and work through them in order.

The pipeline runs to a **single terminal state inside this session**: PR open with CI green, everything (including dogfooding) verified pre-merge. It does **not** wait for a human to merge and then resume — never schedule a follow-up routine to "come back after merge". The issue auto-closes via `Closes #N` on merge.

There are two **deliberate human checkpoints** where you stop and wait for input:

| Checkpoint | Stage | When |
|---|---|---|
| WASM/spec gate | 1.5 | Feature requires a new WASM binding or spec change → file dependency issue, stop |
| Design decisions | 2 | Long-term architectural choices → present trade-offs, wait for input |

The pipeline then ends at **Stage 9** (PR open + CI green) — a terminal handoff, not a resume point.

Outside the two checkpoints, keep going. If a stage is genuinely blocked (auth failure, unresolvable rebase conflict, missing WASM binding, ambiguous requirement), stop and report.

All web work happens in `srs-web/`. Run `git` from `srs-web/`, never from the `semanticops/` parent (it is not a git repo).

---

## Stage 0 — Preflight

1. Confirm a commit-signing method is available (commits will fail otherwise). The required check depends on the environment:
   ```bash
   if ssh-add -l 2>/dev/null | grep -q "SHA256:vHuO6si5w3RLL4IJZofWbyvEi42WA2fYX7bM"; then
     echo "OK: local SSH signing key loaded in agent"
   elif [ ! -f "$HOME/.ssh/id_ed25519_git_signing.pub" ]; then
     echo "OK: cloud/remote environment — platform provides its own commit signing, ssh-agent not used"
   else
     echo "SIGNING KEY NOT LOADED — local key file present but not in agent"
   fi
   ```
   - **Local** (the signing key file exists under `~/.ssh`): the key must be loaded in the ssh-agent. If you see `SIGNING KEY NOT LOADED`, **stop** and tell the user — do not bypass signing.
   - **Cloud / remote agent** (no local signing key file, e.g. a scheduled CCR run): the ssh-agent is not used — the platform signs commits with its own method. Proceed; do not stop on the ssh-agent check.

   In both environments use plain `git commit` — never `--no-gpg-sign`.
2. Confirm `gh auth status` succeeds. If not, stop.
3. Confirm you are working in `srs-web/` (`/home/greenman/dev/semanticops/srs-web`). This command is for srs-web only — redirect Rust or spec work to `/ship`.

## Stage 1 — Issue

- If `$ARGUMENTS` references an existing issue (`#N` or a URL), fetch it with `gh issue view N --repo the-greenman/srs-web` and use it as the brief.
- Otherwise create one:
  ```bash
  gh issue create --repo the-greenman/srs-web \
    --title "<concise title>" \
    --body "<one-paragraph problem statement>"
  ```
  Capture the issue number — every later stage refers to it.

## Stage 1.5 — Dependency gate

Before writing any plan, determine whether this feature requires:

**(A) A new or changed WASM binding** — i.e., a new method on the WASM API surface that doesn't yet exist in `srs-rust`. This is required if the feature needs to:
- call a new SRS operation (create/update/delete/validate/query) not already exposed,
- return a new payload shape, or
- accept new input parameters not in the current WASM API.

Check the existing WASM surface in `srs-web/src/wasm/` or the current `srs-rust` bindings.

**(B) A change to the SRS specification** (`srs/` repo) — new field, type, relation type, extension, or changed validation semantics.

**If either is required:**
1. File a dependency issue in the appropriate repo:
   - WASM binding: `gh issue create --repo the-greenman/srs-rust --title "WASM: <binding needed>" --label "wasm,enhancement" --body "<what method is needed, its signature, and which srs-web feature depends on it>"`
   - Spec change: `gh issue create --repo the-greenman/srs --title "RFC: <title>" --label "rfc" --body "<problem, proposed change, open questions>"`
2. Post a comment on the srs-web issue linking the dependency and explaining that implementation is blocked.
3. **Stop** — return to the user with the dependency issue URL. No planning, no implementation until the dependency is resolved.

**If no dependency is required:** state this explicitly (one sentence) and continue to Stage 2.

## Stage 2 — Plan

1. Read the template at `srs-web/plans/TEMPLATE.md` and the role definitions at `srs-web/plans/agents.md`. **Review the agent list** — if this feature needs a role not yet defined, add it to `agents.md` before writing the plan.
2. Write a **draft** plan to `srs-web/plans/<slug>.md`, filling every section of the template. A plan that needs human interpretation at execution time is incomplete.
3. **ADR check:** read every file in `srs-web/docs/adr/`. Identify:
   - Existing ADRs that govern choices in this plan (cite them in the Architecture Decisions table — at minimum reference ADR-001).
   - Choices that require a **new ADR** — any decision that establishes a new architectural constraint, rejects a plausible alternative others might revisit, or changes a prior decision.
4. **Design decision pause:** before finalising the plan, identify any decision with **long-term consequences** — a new WASM API shape that srs-rust will need to implement, a new component architecture or routing pattern, a new TS type contract, or anything that would be painful to reverse later. For each such decision, present it clearly to the user with the trade-offs and **wait for their input** before continuing. Record their decision in the plan's Architecture Decisions table (and draft a new ADR if warranted). This is the one deliberate pause in the autonomous pipeline.
5. After input is received and decisions are recorded, finalise the plan and draft any new ADRs in `srs-web/docs/adr/NNN-title.md` using the existing ADRs as a template (status: `proposed`).
6. Set the issue body to the plan: `gh issue edit N --repo the-greenman/srs-web --body-file srs-web/plans/<slug>.md`.

## Stage 3 — Plan review loop

1. Spawn review agents **in parallel** (one Agent call, multiple invokes):
   - **Architecture Reviewer (srs-web)** (`agents.md#architecture-reviewer-srs-web`) `model: "sonnet"` — checks the plan against every ADR in `srs-web/docs/adr/` for ADR-001 compliance, WASM API drift, scope discipline, and ADR coverage. Read-only; returns numbered findings with severity (`blocking` / `should-fix` / `nit`).
   - **Plan Reviewer** (`agents.md#plan-reviewer` from `srs-rust/plans/agents.md`) `model: "haiku"` — completeness, contracts, scope discipline, testability. Findings same format.
   Give each agent the plan file path and relevant CLAUDE.md / ADR paths. They are read-only.
2. Post **all** findings as comments on the issue:
   ```bash
   gh issue comment N --repo the-greenman/srs-web --body "<findings>"
   ```
   One comment per reviewer, clearly attributed.
3. Respond to the review: update the plan to resolve every `blocking` and `should-fix` finding; for any finding you decline, record why in an issue comment. Re-sync the issue body: `gh issue edit N --repo the-greenman/srs-web --body-file <plan>`.
4. **File deferred items as issues:** for every item the plan explicitly defers (marked in *Out of scope* or *Assumptions*), create a GitHub issue:
   ```bash
   gh issue create --repo the-greenman/srs-web \
     --title "<deferred item title>" \
     --label "enhancement" \
     --body "<what was deferred, why, and what the future plan needs to address>"
   ```
   If the deferred item requires a WASM binding change, add `--label "requires-wasm-binding"`. Post a comment on the current issue listing all newly filed deferred issues.
5. **Loop:** if the plan is large (≥ 3 phases or touches ≥ 3 components) **and** the last review produced any `blocking` finding, re-run the review on the updated plan. Repeat until a review pass yields **zero** blocking findings.

## Stage 4 — Branch & worktree

Naming convention: **`feat/<issue-N>-<slug>`** where `<issue-N>` is the issue number and `<slug>` is short kebab-case from the title. Worktrees mirror: `../.worktrees/<issue-N>-<slug>`.

Before creating, check whether a branch for this issue already exists:

```bash
cd srs-web
BRANCH="feat/$ISSUE_N-$SLUG"
WORKTREE="../.worktrees/$ISSUE_N-$SLUG"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Branch $BRANCH already exists locally — reusing"
  git worktree add "$WORKTREE" "$BRANCH"
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  echo "Branch $BRANCH exists on remote — tracking"
  git worktree add "$WORKTREE" --track -b "$BRANCH" "origin/$BRANCH"
else
  git worktree add "$WORKTREE" -b "$BRANCH"
fi
```

Do all implementation inside that worktree. Run `npm install` once in the worktree if `node_modules/` is absent (it is not tracked by git).

## Stage 5 — Implement

Execute the plan phase by phase. For each phase:
- Implement the tasks, keeping all changes within `srs-web/**`.
- Respect ADR-001: no SRS semantics in TypeScript. If a WASM method is missing, file the srs-rust issue and stop.
- Run the phase's **milestone gate**:
  ```bash
  npm run typecheck
  npm run lint
  npm run build
  npm test
  ```
  All must pass before proceeding to the next phase.
- Mark plan checkboxes `[x]` and **commit at the milestone** with a message referencing the issue (`... (#N)`). Use plain `git commit` — never `--no-gpg-sign`.

Do not start a phase until the previous milestone gate passes.

## Stage 6 — Sync with main + final acceptance

First bring the branch up to date so acceptance, dogfooding, and CI all reflect current `main`:
```bash
# from inside the worktree
git fetch origin
git rebase origin/main
```
If the rebase conflicts and you cannot resolve it confidently from context, **stop and report** — this is a genuine blocker. Re-run the milestone gates after a non-trivial rebase.

Then run the full Final Acceptance list from the plan:
```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run e2e
```

All checks must pass before proceeding. If an e2e test fails due to a missing fixture or environment issue, diagnose and fix — do not skip.

## Stage 7 — Code review loop

1. Spawn in parallel against the diff (`git diff main...HEAD` from inside the worktree):
   - **Architecture Reviewer (srs-web)** (`agents.md#architecture-reviewer-srs-web`) `model: "sonnet"` — audits code against every ADR, ADR-001 in particular; WASM API drift; scope discipline; TS type correctness.
   - **Verification Agent (srs-web)** (`agents.md#verification-agent-srs-web`) `model: "haiku"` — runs `npm run typecheck`, `npm run build`, `npm test`; confirms WASM loads; produces the behaviour/duplication report.
2. Post findings as issue comments.
3. Respond: fix every `blocking` and `should-fix` finding, committing the fixes. Decline-with-reason for anything not fixed.
4. **Loop:** on a large change, repeat until a pass yields zero blocking findings.

## Stage 7.5 — Documentation pass

The pipeline is not done until the docs match the code. This stage runs after the code is final (Stage 7 passed) and before the PR.

1. **Determine the user-facing surface this change touched.** Ask: did this change add or modify any of —
   - a new Svelte component or page with a user-visible interaction,
   - a WASM API call shape (method name, parameters, or return type),
   - an ADR (new one drafted in Stage 2, or an existing one now superseded),
   - build/test/run commands or developer workflow?

   If the change is purely internal (refactor with no observable surface change), state that in one sentence and skip to Stage 8 — but say so explicitly; do not skip silently.

2. **Update each affected doc.** Map surface → doc:

   | Changed surface | Doc(s) to update |
   |---|---|
   | New/changed WASM API call or TS type contract | `srs-web/src/wasm/` type files + any inline usage docs |
   | New/changed component or UI behaviour | `srs-web/README.md` if it's a top-level capability |
   | New ADR | flip its status from `proposed` to `accepted` if the change shipped under it |
   | New build/test/run command or workflow | the **Commands** section of `srs-web/CLAUDE.md` (if it exists) and `semanticops/CLAUDE.md` if relevant |

3. **Hunt for stale references.** Grep the docs for anything this change made wrong — renamed components, removed props, changed WASM method names:
   ```bash
   rg -n "<old-name>" --glob '*.md' .
   ```
   Fix every stale hit.

4. **Verify doc commands still run.** Any command block you added or touched in a `CLAUDE.md` or `README.md` must actually work — run it.

5. Commit the doc updates: `docs: update docs for <slug> (#N)`.

## Stage 7.6 — Dogfooding (pre-PR, on the branch)

This runs **before** the PR, on the rebased feature branch (Stage 6 already synced it with `main`), so the results land in this same PR.

**Skip** if purely internal (refactor, test-only, doc-only, build tooling). State the reason; do not skip silently.

1. **Build from the branch under review** (the current worktree HEAD — do **not** check out `main`):
   ```bash
   npm run build            # from inside the worktree
   ```

2. **Start the dev server** and open the feature in a browser using Playwright or the `run` skill:
   ```bash
   npm run dev &
   ```

3. **Run the feature end-to-end:** happy path + the named negative case from the plan's acceptance criteria. Confirm:
   - The WASM loads without JS errors.
   - The feature behaves as specified.
   - No regressions are visible in adjacent features.

4. **File issues:** `bug` for anything not working as designed (patch immediately if trivial); `enhancement` for workflow gaps that required workarounds. No cosmetic/hypothetical issues.

5. **Summarise:** scenarios run, components exercised, bugs filed, feature gaps filed.

## Stage 8 — PR

Before pushing, run a final lint gate:
```bash
npm run typecheck
npm run lint
```
If either reports errors, fix and commit before proceeding.

Then push and open the PR:
```bash
cd srs-web
git push -u origin feat/$ISSUE_N-$SLUG
gh pr create --repo the-greenman/srs-web --fill --base main --body "<summary>

Closes #N

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
End the body with the Claude Code attribution line. Link the PR back on the issue if `--fill` didn't.

## Stage 9 — Sweep open issues + CI watch

1. Run `gh issue list --repo the-greenman/srs-web --state open` and check whether any open issue is now addressable by this change or is a quick adjacent fix. Address what you reasonably can within this branch/PR; leave a comment noting status on the rest. Do not scope-creep the PR with unrelated large work.

2. **Watch CI and fix failures.** When a CI check fails:
   - Fetch the job logs (`gh run view --log-failed`), diagnose the root cause, push a fix commit, and repeat.
   - Keep fixing until all required checks are green or you hit a blocker you cannot resolve.
   - If a failure is a pre-existing flake unrelated to this change, note it in a PR comment and move on.
   - Do not close the PR or give up silently — always report status.

**This is the terminal state.** Once all CI checks pass (or a blocker is hit), the pipeline is done — report the PR URL and hand off. Do **not** wait for the merge, do **not** schedule a routine to resume after merge, and do **not** close the issue manually: `Closes #N` in the PR body closes it automatically on merge.

**Best-effort cleanup (optional, non-blocking).** If you created a local worktree and are in a long-lived local session, you may tidy it now — but never wait for the merge to do so, and never treat cleanup as a gate. In a cloud session the harness reclaims the workspace, so skip it.
```bash
git worktree remove ../.worktrees/<issue-N>-<slug> 2>/dev/null || true
git branch -d feat/<issue-N>-<slug> 2>/dev/null || true
```

---

## Output contract

When done, report: issue #, plan path, ADRs created (if any), number of review rounds, docs updated in Stage 7.5 (or "none — internal change"), the dogfooding summary (Stage 7.6 — scenarios run, components exercised, bugs filed, or "skipped — internal change"), and the PR URL with its final CI status. The pipeline ends at PR-open + CI green; the issue closes on merge via `Closes #N` — do not report a manual close or a post-merge step. If you stopped early, say exactly which stage and why.
