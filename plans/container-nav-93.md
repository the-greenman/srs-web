# Plan: Sidebar nav from list_containers — retire TYPE_REGISTRY as nav source

> Issue: [srs-web#93](https://github.com/the-greenman/srs-web/issues/93)

## Summary

Replace the TYPE_REGISTRY-driven sidebar with a container-driven one. Currently
`buildDynamicSections()` seeds the nav from `TYPE_REGISTRY` and appends any
unknown typeIds found in records; `GovernanceShell.svelte` buckets records by
`typeId`. This is semantics-in-the-client: the TypeScript layer decides what
appears and how records group. After this change, the sidebar lists all containers
returned by `listContainers(repo, {})`. `TYPE_REGISTRY` is demoted to presentation
hints only (icon, view component), never deciding what appears in the nav.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Claude Code |
| Web App Worker | Claude Code |
| Verification | Architecture Reviewer + Verification Agent (Stage 7) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-006](../docs/adr/006-dynamic-dispatch-replaces-sections.md) | Dynamic section discovery (typeId-keyed) | superseded for nav by ADR-009 |
| [ADR-007](../docs/adr/007-unified-type-registry.md) | TYPE_REGISTRY unifies display hints and views | partially superseded: TYPE_REGISTRY is demoted to presentation hints only |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Container-keyed sidebar nav | proposed |

---

## Contracts

### WASM API surface

No new WASM binding required. All methods used are already in `srs-client.ts`:
- `listContainers(repo, {})` → `ContainerSummary[]` (has `containerId`, `title`, `containerType`)
- `getContainer(repo, containerId)` → `Container` (has `memberInstanceIds`, `rootInstanceIds`)
- `listRecords(repo, {})` — unchanged
- `typeSchema(repo, typeId, typeVersion)` — unchanged

### TypeScript types

`ContainerNavEntry` is a local interface inside `GovernanceShell.svelte`; not exported.
No changes to `srs-client.ts` types.

---

## Scope

**In scope:**
- `GovernanceShell.svelte`: replace typeId-keyed nav with container-keyed nav
- `e2e/fixtures/gallery.srsj`: rename "Decisions" container → "Decision Log"
- `e2e/fixtures/sample.srsj`: add 3 containers (Articles, Decision Log, Roles)
- `docs/adr/009-container-driven-nav.md`: new ADR
- `docs/adr/006-dynamic-dispatch-replaces-sections.md`: superseded-by note

**Out of scope:**
- Removing `buildDynamicSections` from `sections.ts` (tested there; not harmful to keep)
- Changing `RecordDispatch.svelte` or any view components
- Implementing member-aware list pane (tracked as srs-web#94)
- Implementing nav from `repository_navigation` service (tracked as srs-web#98, gated on srs-rust#266)
- Removing TYPE_REGISTRY entirely (still used for icon and view component lookup)

---

## Phases

### Phase 1: GovernanceShell.svelte — container-driven nav

**Goal:** After this phase, the sidebar lists containers from `listContainers()` and
`activeContainerId` (containerId string) replaces `activeSection` (typeId string) as the
nav state.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `getContainer` to imports from `$lib/srs-client.js`; add `ContainerSummary` to type imports
- [ ] Remove `buildDynamicSections`, `SectionConfig`, `SectionKey` imports from governance/sections.js
- [ ] Define local `ContainerNavEntry` interface (containerId, title, containerType?, rootTypeId?, icon, rootTypeVersion?)
- [ ] Replace state: `dynamicSections → containers: ContainerNavEntry[]`, `sectionRecords → containerRecords: Record<string, SrsRecord[]>`, `activeSection → activeContainerId: string | null`
- [ ] Replace state: remove `decisionLogContainerId` (replaced by activeContainerId)
- [ ] Replace state: rename `sectionSchemas → containerSchemas` (keyed by containerId)
- [ ] Update derived: `activeSection_ → activeContainer` using `containers.find(c => c.containerId === activeContainerId)`
- [ ] Update derived: `activeRecords` to use `containerRecords[activeContainerId]`
- [ ] Update derived: `activeSectionSchema` to use `containerSchemas[activeContainerId]`
- [ ] Implement `loadContainerNav()`:
  - `listContainers(repo, {})` → get all container summaries
  - `listRecords(repo, {})` → get all records; build Map<instanceId, SrsRecord>
  - For each container: `getContainer(repo, containerId)` → get memberInstanceIds + rootInstanceIds
  - Filter `memberInstanceIds` against record map → `containerRecords[containerId]`
  - Resolve rootTypeId + rootTypeVersion from `rootInstanceIds[0]` record in the map
  - Look up `TYPE_REGISTRY[rootTypeId]?.icon ?? "◻"` for the icon
  - Build `ContainerNavEntry` and push to `containers`
  - Set `activeContainerId = containers[0].containerId` if not yet set
- [ ] Implement `buildContainerSchemas()`: for each container with `rootTypeId`, call `typeSchema(repo, rootTypeId, rootTypeVersion ?? 1)`; store result keyed by `containerId`
- [ ] Remove `buildSectionSchemas()` and `loadSectionRecords()` functions
- [ ] Remove `onMount` block's `decisionLogContainerId` discovery; replace `loadSectionRecords()` + `buildSectionSchemas()` calls with `loadContainerNav()` + `buildContainerSchemas()`
- [ ] Update `handleFormSave`: replace `sectionSchemas[activeSection]` with `containerSchemas[activeContainerId]`; always call `addContainerMember(repo, activeContainerId, created.instanceId)` (not just for DECISION_TYPE_ID)
- [ ] Remove special `decisionLogContainerId` error path from `handleFormSave` (simplify)
- [ ] Update all callsites of `loadSectionRecords()` to call `loadContainerNav()` instead
- [ ] Update view dispatch: replace `activeSection_?.typeId === DECISION_TYPE_ID` with `activeContainer?.rootTypeId === DECISION_TYPE_ID`
- [ ] Update nav template: `{#each containers as container (container.containerId)}` instead of `{#each dynamicSections as section (section.key)}`; update NavItem props: `label={container.title}`, `id={container.icon}`, `count={containerRecords[container.containerId]?.length ?? 0}`, `active={activeContainerId === container.containerId}`, onclick sets `activeContainerId = container.containerId`
- [ ] Update `governanceCrumbItems()`: replace `activeSection_?.label` with `activeContainer?.title`
- [ ] Update inspector $effect: replace `activeSection_?.typeId === DECISION_TYPE_ID` with `activeContainer?.rootTypeId === DECISION_TYPE_ID`
- [ ] Update inspector section check: `activeSection_?.typeId === DECISION_TYPE_ID` → `activeContainer?.rootTypeId === DECISION_TYPE_ID`

#### Acceptance Criteria

- [ ] `npm run typecheck` passes (no TS errors)
- [ ] `npm run build` passes
- [ ] Nav renders containers from `listContainers()`, not TYPE_REGISTRY entries
- [ ] `activeContainerId` tracks containerId, not typeId

#### Milestone gate

1. `npm run typecheck` — zero errors
2. `npm run build` — zero errors
3. `npm test` — sections.test.ts + unit tests pass
4. Commit: `feat: container-driven sidebar nav (#93)`

---

### Phase 2: Fixture migration

**Goal:** `sample.srsj` has 3 containers; `gallery.srsj` "Decisions" → "Decision Log".

**Agent:** Web App Worker

#### Tasks

- [ ] Update `e2e/fixtures/gallery.srsj`:
  - In `containers/138e2fac-...json`: change `"title": "Decisions"` → `"title": "Decision Log"`
  - In `data['manifest.json'].containerIndex`: change `"title": "Decisions"` → `"title": "Decision Log"` for the same containerId
- [ ] Update `e2e/fixtures/sample.srsj`: add:
  - 3 container entries under `data['containers/<uuid>.json']` with titles "Articles", "Decision Log", "Roles" and empty memberInstanceIds/rootInstanceIds
  - `data['manifest.json']` with `containerIndex` array listing those 3 containers in order

#### Container UUIDs for sample.srsj (stable, deterministic)

- Articles: `aa000001-0000-4000-8000-000000000001`
- Decision Log: `dd000001-0000-4000-8000-000000000001`
- Roles: `rr000001-0000-4000-8000-000000000001` → `ee000002-0000-4000-8000-000000000002` (valid hex)

Use: Articles=`aa000001-0000-4000-8000-000000000001`, Decision Log=`dd000001-0000-4000-8000-000000000001`, Roles=`cc000001-0000-4000-8000-000000000001`

#### Acceptance Criteria

- [ ] `listContainers` called on sample.srsj returns 3 containers with titles "Articles", "Decision Log", "Roles"
- [ ] `listContainers` called on gallery.srsj returns containers where one has title "Decision Log" (not "Decisions")
- [ ] `npm run typecheck` still passes

#### Milestone gate

1. `npm run typecheck` — zero errors
2. `npm run build` — zero errors
3. `npm test` — all unit tests pass
4. Commit: `feat: migrate fixtures to container-based nav (#93)`

---

### Phase 3: ADR

**Goal:** New ADR-009 documents container-keyed nav; ADR-006 updated with superseded-by note.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `docs/adr/009-container-driven-nav.md`
- [ ] Update `docs/adr/006-dynamic-dispatch-replaces-sections.md`: add superseded-by note for the section-list portion
- [ ] Update `docs/adr/007-unified-type-registry.md`: add note that TYPE_REGISTRY is demoted to presentation hints only (nav source moved to containers)

#### Acceptance Criteria

- [ ] ADR-009 exists with status `accepted` (the change ships with this PR)
- [ ] ADR-006 references ADR-009 as superseding the section-list portion
- [ ] `npm run typecheck` passes

#### Milestone gate

1. `npm run typecheck` — zero errors
2. Commit: `docs: ADR-009 container-driven nav (#93)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes (all unit tests)
- [ ] e2e navigation.spec.ts: "Articles", "Decision Log", "Roles" nav items visible with sample.srsj
- [ ] e2e gallery.spec.ts: "Decision Log" nav item resolves; DecisionLogView renders for Decisions container
- [ ] No record-by-typeId bucketing in GovernanceShell.svelte
- [ ] Icons resolve via TYPE_REGISTRY
