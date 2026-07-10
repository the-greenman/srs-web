# Plan: Status/Tag vocabulary — add ratified/abandoned

## Summary

`c7078b1` introduced the `governance_lifecycle` package with `ratified` as the dominant real state
and `abandoned` used by `DecisionLogView`'s exclude filter, but the presentation-layer `Status`
vocabulary (TS union + CSS tag styling) was never updated to match. This plan extends the `Status`
union, adds the two missing CSS rules, and corrects a now-stale comment — presentation-only, no
WASM or SRS-semantics change.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | (this session) |
| Web App Worker | (this session) |
| Verification | (this session) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted (this plan adds no semantics — purely a vocabulary/label/CSS extension, the same category as existing Status values) |

No new ADR needed.

## Contracts

### WASM API surface

No — no new/changed WASM methods. `ratified`/`abandoned` are already-emitted lifecycle state strings; this plan only extends how the client labels/styles states it already receives.

### TypeScript types

Extends the existing `Status` union in `src/lib/types.ts`; no WASM payload shape changes.

## Scope

1. `src/lib/types.ts` (~lines 11-20): add `ratified` and `abandoned` to the `Status` union.
2. `src/styles/components/tag.css`: add `.tag--ratified` and `.tag--abandoned` rules, following the
   existing visual language (inspect `.tag--active`, `.tag--superseded`, `.tag--closed` for pattern:
   ratified should read as an emphatic/positive terminal state, abandoned as de-emphasized/muted).
3. `src/lib/components/RecordView.svelte` (~lines 25-28): correct the stale comment on the
   `lifecycle as Status` force-cast — it currently claims "Status includes draft, active, archived
   which matches LifecycleState", which is no longer accurate now that Status covers the full
   lifecycle vocabulary.

## Out of scope

- #195 — `DecisionSummaryCard`, `SuccessorModal`, `decision-export-utils` reading the stale `status`
  fieldValue instead of `record.lifecycle`. Tracked separately; not touched by this plan.

## Acceptance Criteria

- [ ] `Status` union in `src/lib/types.ts` includes `ratified` and `abandoned`.
- [ ] `.tag--ratified` and `.tag--abandoned` CSS rules exist and are visually consistent with sibling rules.
- [ ] `RecordView.svelte`'s comment no longer misstates the Status/LifecycleState relationship.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` pass.

## Final Acceptance

```bash
npm run typecheck
npm run lint
npm run build
npm test
```
