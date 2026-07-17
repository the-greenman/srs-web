# Plan: Migrate rendering/field-helpers.ts field-name scan to WASM binding (#217)

## Summary

`src/rendering/field-helpers.ts` exports `getFieldValueByName`, which resolves a field value
from `record.fieldValues` by scanning the WASM-derived `fieldMeta` map in TypeScript. This is
the same category of ADR-001 residual debt that `field-utils.ts` addressed in srs-web#179
(now closed). Two rendering-layer components use it: `rendering/DecisionSummaryCard.svelte`
and `rendering/DecisionView.svelte`. This plan replaces those calls with
`repo.get_field_value_by_name(instanceId, fieldName)` (WASM binding, srs-rust build 162,
srs-rust#536), wires `repo` into the rendering layer via a new Svelte context
(`repo-context.ts`, following the existing `field-meta.ts` pattern), reduces `field-helpers.ts`
to `isPresent` only, and removes the ADR-001 caveat note that tracks this debt.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Main session |
| Web App Worker | Main session |
| Verification | Spawned in Stage 7 |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | `getFieldValueByName` TS scan is ADR-001 debt; replace with WASM binding | accepted — this plan closes the `field-helpers.ts` debt entry |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | TYPE_REGISTRY view interface is `{ record: SrsRecord }` — `repo` cannot be added as a prop to rendering views without breaking the registry contract | accepted — motivates the context approach |
| [ADR-013](../docs/adr/013-repo-context.md) | `SrsRepository` is exposed to the rendering layer via a Svelte context set by `GovernanceShell` | proposed |

---

## Contracts

### WASM API surface

**No new WASM binding required.** `get_field_value_by_name(instance_id: string, field_name: string): any`
is already declared in `src/lib/srs-client.ts:71` and used in:
- `src/lib/components/DecisionSummaryCard.svelte` (lines 26, 39)
- `src/lib/governance/decision-export-utils.ts` (lines 36, 41, 57, 62)

Return contract (srs-rust#536): returns the raw field value (string, number, boolean, array,
or object) or `null` if the field is absent, the name is unknown, or the record is not found.
Never throws for missing/unknown fields.

### TypeScript types

- New file `src/lib/governance/repo-context.ts` — `RepoContext` interface, `REPO_CONTEXT_KEY` Symbol,
  `setRepoContext(getRepo: () => SrsRepository): void`,
  `getRepoContext(): RepoContext`.
- `GovernanceShell.svelte`: one new call to `setRepoContext(() => repo)` alongside the existing
  `setFieldMetaContext` call. No new imports from srs-rust.
- `rendering/DecisionSummaryCard.svelte`: drops `getFieldMetaContext`, adds `getRepoContext`.
  Props unchanged: still `{ record: SrsRecord }`.
- `rendering/DecisionView.svelte`: keeps `getFieldMetaContext` (needed for display metadata),
  adds `getRepoContext`. Props unchanged: still `{ record: SrsRecord }`.
- `rendering/field-helpers.ts`: `getFieldValueByName` and `getFieldByName` removed; `isPresent`
  export kept (still used by both components for empty-value guards).

### FieldValue synthetic objects for FieldValueView

`FieldValueView` accepts `{ fv: FieldValue }` where `FieldValue = { fieldId: string, value: unknown }`.
`FieldValueView` uses only `fv.value` internally (verified: `FieldValueView.svelte` does not
reference `fv.fieldId`). `CardField.id` (used for aria-controls) is optional.

- `DecisionSummaryCard.svelte`: pass `{ fieldId: field.name, value }` as synthetic FieldValue.
  `CardField` has no `id` prop here, so fieldId is irrelevant to accessibility.
- `DecisionView.svelte`: pass `field.name` as `CardField.id` (stable, unique within the
  component). `FieldValueView` receives `{ fieldId: field.name, value }`. Display metadata
  (`description`, `instructions`) is looked up via a `metaByName` reverse map derived from
  `fieldMeta` (name → FieldFormDef, built once in `$derived`). `fieldMeta` remains in
  `DecisionView` for this display-only purpose.

---

## Scope

**In scope:**
- Create `src/lib/governance/repo-context.ts`.
- Wire `setRepoContext` into `GovernanceShell.svelte`.
- Migrate `rendering/DecisionSummaryCard.svelte`: remove `fieldMeta`, replace `getFieldValueByName`.
- Migrate `rendering/DecisionView.svelte`: keep `fieldMeta` for metadata, replace `getFieldValueByName`.
- Reduce `rendering/field-helpers.ts` to `isPresent` only (remove `getFieldValueByName`, `getFieldByName`).
- Flip `ADR-013` status from `proposed` to `accepted` in the new ADR file once shipped.
- Update `ADR-001` to close the `field-helpers.ts` debt entry.

**Out of scope:**
- Changing `FieldValueView.svelte` or `RecordView.svelte` (not touched by this debt).
- Changing the TYPE_REGISTRY or RecordDispatch interface.
- Other ADR-001 residual debt items (relation-chain traversal, status vocabularies, relation types).
- `GuidesShell.svelte` or any component outside `src/rendering/` and `src/lib/governance/`.

---

## Phases

### Phase 1: Create RepoContext and wire into GovernanceShell

**Goal:** `SrsRepository` is available as a Svelte context throughout the rendering layer.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/governance/repo-context.ts`:
  ```ts
  import { getContext, setContext } from 'svelte';
  import type { SrsRepository } from '$lib/srs-client.js';

  export const REPO_CONTEXT_KEY = Symbol('repo');

  export interface RepoContext {
    readonly repo: SrsRepository;
  }

  export function setRepoContext(getRepo: () => SrsRepository): void {
    setContext<RepoContext>(REPO_CONTEXT_KEY, {
      get repo() { return getRepo(); },
    });
  }

  export function getRepoContext(): RepoContext {
    return getContext<RepoContext>(REPO_CONTEXT_KEY);
  }
  ```
- [ ] In `GovernanceShell.svelte`, import `setRepoContext` from `$lib/governance/repo-context.js`
  and call `setRepoContext(() => repo)` immediately after the existing `setFieldMetaContext` call
  (line ~145). This runs at component init (synchronous, top-level `<script>`).

#### Acceptance Criteria

- [ ] `src/lib/governance/repo-context.ts` exists and exports `RepoContext`, `REPO_CONTEXT_KEY`,
  `setRepoContext`, `getRepoContext`.
- [ ] `GovernanceShell.svelte` calls `setRepoContext(() => repo)` at init.
- [ ] `npm run typecheck` passes.

#### Testing

```bash
cd /home/user/srs-web && npm run typecheck
```

#### Milestone gate

Run `npm run typecheck`. Pass → mark tasks `[x]`, commit.

---

### Phase 2: Migrate rendering/DecisionSummaryCard.svelte

**Goal:** `rendering/DecisionSummaryCard.svelte` calls `repo.get_field_value_by_name` for all
field lookups; `fieldMeta` is removed from the component.

**Agent:** Web App Worker

#### Tasks

- [ ] In `rendering/DecisionSummaryCard.svelte`:
  - Add `import { getRepoContext } from '$lib/governance/repo-context.js';`
  - Remove `import { getFieldMetaContext } from '$lib/governance/field-meta.js';`
  - Remove `getFieldValueByName` from the `field-helpers.js` import (keep `isPresent`).
  - Remove `const _fieldMetaCtx = getFieldMetaContext();` and `const fieldMeta = $derived(...)`.
  - Add:
    ```ts
    const _repoCtx = getRepoContext();
    const repo = $derived(_repoCtx.repo);
    ```
  - Replace the `displayTitle` derived:
    ```ts
    // Before:
    const displayTitle = $derived(() => {
      const ttl = getFieldValueByName(record, 'title', fieldMeta)?.value;
      return ttl ? String(ttl) : record.instanceId.slice(0, 8);
    });
    // After:
    const displayTitle = $derived(() => {
      const ttl = repo.get_field_value_by_name(record.instanceId, 'title') as string | null | undefined;
      return ttl ? String(ttl) : record.instanceId.slice(0, 8);
    });
    ```
  - Replace the `#each` block:
    ```svelte
    <!-- Before: -->
    {@const fv = getFieldValueByName(record, field.name, fieldMeta)}
    {#if fv && isPresent(fv.value)}
      <CardField label={field.label}>
        <FieldValueView {fv} />
      </CardField>
    {/if}
    <!-- After: -->
    {@const value = repo.get_field_value_by_name(record.instanceId, field.name)}
    {#if value !== null && value !== undefined && isPresent(value)}
      <CardField label={field.label}>
        <FieldValueView fv={{ fieldId: field.name, value }} />
      </CardField>
    {/if}
    ```

#### Acceptance Criteria

- [ ] No import of `getFieldValueByName` remains in `DecisionSummaryCard.svelte`.
- [ ] No reference to `fieldMeta` remains in `DecisionSummaryCard.svelte`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.

#### Testing

```bash
cd /home/user/srs-web && npm run typecheck && npm run build
```

#### Milestone gate

Run typecheck + build. Pass → mark tasks `[x]`, commit.

---

### Phase 3: Migrate rendering/DecisionView.svelte

**Goal:** `rendering/DecisionView.svelte` calls `repo.get_field_value_by_name` for all field
value lookups; `fieldMeta` is kept only for display metadata (description, instructions).

**Agent:** Web App Worker

#### Tasks

- [ ] In `rendering/DecisionView.svelte`:
  - Add `import { getRepoContext } from '$lib/governance/repo-context.js';`
  - Remove `getFieldValueByName` from the `field-helpers.js` import (keep `isPresent`).
  - Add after existing `fieldMeta` derived:
    ```ts
    const _repoCtx = getRepoContext();
    const repo = $derived(_repoCtx.repo);
    // name → FieldFormDef reverse map for display metadata
    const metaByName = $derived(
      new Map([...fieldMeta.entries()].map(([_, def]) => [def.name, def]))
    );
    ```
  - Replace the `#each` block:
    ```svelte
    <!-- Before: -->
    {@const fv = getFieldValueByName(record, field.name, fieldMeta)}
    {#if fv && isPresent(fv.value)}
      {@const def = fieldMeta.get(fv.fieldId)}
      <CardField label={field.label} description={def?.description} instructions={def?.instructions} id={fv.fieldId}>
        <FieldValueView {fv} />
      </CardField>
    {/if}
    <!-- After: -->
    {@const value = repo.get_field_value_by_name(record.instanceId, field.name)}
    {#if value !== null && value !== undefined && isPresent(value)}
      {@const def = metaByName.get(field.name)}
      <CardField label={field.label} description={def?.description} instructions={def?.instructions} id={field.name}>
        <FieldValueView fv={{ fieldId: field.name, value }} />
      </CardField>
    {/if}
    ```

#### Acceptance Criteria

- [ ] No import of `getFieldValueByName` remains in `DecisionView.svelte`.
- [ ] `repo.get_field_value_by_name` is used for field value lookups.
- [ ] `fieldMeta` is still present (for display metadata only).
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.

#### Testing

```bash
cd /home/user/srs-web && npm run typecheck && npm run build
```

#### Milestone gate

Run typecheck + build. Pass → mark tasks `[x]`, commit.

---

### Phase 4: Reduce field-helpers.ts and update ADR-001

**Goal:** `field-helpers.ts` exports only `isPresent`; ADR-001 caveat is closed.

**Agent:** Web App Worker

#### Tasks

- [ ] In `rendering/field-helpers.ts`:
  - Remove `getFieldValueByName` function (lines 14–22).
  - Remove `getFieldByName` function (lines 27–33) and its `import` of `FieldFormDef`.
  - Update the file comment to reflect the reduced scope.
  - `isPresent` remains (export unchanged).
- [ ] Verify no other file imports `getFieldValueByName` or `getFieldByName` from `field-helpers`:
  ```bash
  grep -rn "getFieldValueByName\|getFieldByName" /home/user/srs-web/src/
  ```
  Expect: no results.
- [ ] In `docs/adr/001-thin-client.md`, replace the `field-helpers.ts` debt bullet:
  - **Before:** the bullet starting "**Field-by-name lookup** — resolved in srs-web#179..."
    ending with "...not yet tracked as ADR-001 debt — see srs-web#217)."
  - **After:** same bullet through "srs-rust build 162)" then add a new sentence:
    "The equivalent scan in `src/rendering/field-helpers.ts` is resolved in srs-web#217
    (`getFieldValueByName` replaced with `repo.get_field_value_by_name`; `field-helpers.ts`
    reduced to `isPresent` only)."
  - Remove the parenthetical `"Note: an equivalent TS-side field-name scan remains..."`.
- [ ] In `docs/adr/013-repo-context.md`, flip status from `proposed` to `accepted`.

#### Acceptance Criteria

- [ ] `grep -rn "getFieldValueByName" /home/user/srs-web/src/` returns zero results.
- [ ] `rendering/field-helpers.ts` exports only `isPresent`.
- [ ] ADR-001 no longer lists `field-helpers.ts` as an open debt item.
- [ ] ADR-013 status is `accepted`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.

#### Testing

```bash
cd /home/user/srs-web
grep -rn "getFieldValueByName" src/   # expect: zero results
npm run typecheck && npm run build && npm test
```

#### Milestone gate

All tests and checks pass. Mark tasks `[x]`. Commit.

---

## Final Acceptance

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds.
- [ ] `npm test` passes.
- [ ] `npm run e2e` passes (or pre-existing failures confirmed pre-existing).
- [ ] `grep -rn "getFieldValueByName" src/` → zero results.
- [ ] `rendering/field-helpers.ts` exports only `isPresent`.
- [ ] ADR-001 caveat note for `field-helpers.ts` is resolved.
- [ ] ADR-013 is accepted.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The `metaByName` reverse map in `DecisionView`
  is display-layer presentation logic (building a name→label map from WASM-derived metadata),
  not a semantic field-name resolver.
- Verification Agent confirms WASM loads and `get_field_value_by_name` returns correctly for
  a loaded `.srsj` fixture.

## Assumptions

- `get_field_value_by_name` returns `null` (not `undefined`) for absent/unknown fields, as per
  the srs-rust#536 return contract. The `value !== null && value !== undefined` guard covers both.
- `GovernanceShell` is the only component that calls `setRepoContext`. The context is always
  available to `rendering/` components because they are only rendered by `RecordReading`, which
  is only rendered inside `GovernanceShell`.
- `isPresent` is still the correct empty-value guard. `repo.get_field_value_by_name` may return
  `""` or `[]` for fields that exist but have no meaningful value; `isPresent` filters these.
