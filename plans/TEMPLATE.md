# Plan: <Title>

> **Usage note:** The purpose of a plan file is to be reviewed and executed by agents. Write it with that reader in mind: unambiguous tasks, explicit file paths, named functions, checkable acceptance criteria. A plan that requires human interpretation at execution time is incomplete.
>
> Save this file to `plans/<slug>.md` before assigning agents. Agents receive the plan file as their primary brief.

## Summary

One paragraph. What problem does this plan solve, and why now?

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Web App Worker | — |
| Verification | — |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

List ADRs that govern this plan. Create a new ADR in `docs/adr/` for any decision that establishes a new constraint, rejects a plausible alternative, or changes a prior decision.

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | proposed |

---

## Contracts

### WASM API surface

Does this plan require new or changed WASM methods in `srs-rust`?

- **Yes** → file a `srs-rust` issue first; link it as a dependency. Do not proceed until the WASM binding is available.
- **No** → state this explicitly.

### TypeScript types

TS types for WASM outputs are derived from `srs-rust/crates/srs-cli/schemas/payload/`. If a new binding is added in srs-rust, regenerate or extend the TS type file accordingly.

---

## Scope

What is explicitly in scope. Keep it tight.

- ...

**Out of scope:**

- ...

---

## Phases

### Phase N: <Name>

**Goal:** One sentence — what state are we in after this phase completes?

**Agent:** Web App Worker

#### Tasks

- [ ] Task description
- [ ] Task description

#### Acceptance Criteria

- [ ] Behaviour X works as described
- [ ] `npm run typecheck` passes
- [ ] No regression in Y

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck` and `npm run build` — both must pass.
3. Update the plan file: mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`... (#N)`).

Do not start the next phase until the milestone gate passes.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] WASM loads and all WASM API calls succeed against `gallery.srsj`
- [ ] <Plan-specific criterion>

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). If a capability is missing from the WASM API, file a srs-rust issue — do not implement in TS.
- Lead Integrator freezes WASM binding API names before the edit forms consume them.
- Verification Agent runs after each major phase and before final sign-off.

## Assumptions

- ...
