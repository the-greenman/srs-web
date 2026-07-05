# Plan: Nav from root container navigation service (srs-web#98)

## Summary

The governance sidebar currently sources its section list from `listContainers()` (ADR-009 interim path). This plan migrates to `repositoryNavigation()` — the WASM binding for `repository_navigation_service` (srs-rust#268, now closed) — which returns the repository identity plus precedes-ordered section roots derived from the RFC-013 root container. This completes Gate D: the web sidebar mirrors `srs repo navigation` exactly.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | claude-sonnet-4-6 |
| Web App Worker | claude-sonnet-4-6 |
| Verification | claude-sonnet-4-6 |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | srs-web is a thin client; zero SRS semantics in TS | accepted |
| [ADR-009](../docs/adr/009-container-driven-nav.md) | Container-keyed nav; this plan completes the migration to `repository_navigation` as ADR-009 anticipated | accepted |

No new ADR: ADR-009 already recorded this migration as the planned next step ("source swap, not a schema change").

---

## Contracts

### WASM API surface

No new WASM binding is required. `repository_navigation()` is implemented in `srs-rust/crates/srs-bindings/src/lib.rs:572` (srs-rust#268, closed). The TS facade in `srs-client.ts` only needs to declare the method and its return types.

### TypeScript types

The WASM binding serialises `RepositoryNavigation` with `#[serde(rename_all = "camelCase")]`:

```typescript
interface NavigationNode {
  instanceId: string;
  typeId: string;
  typeVersion: number;
  typeNamespace: string;
  typeName: string;
  displayLabel: string;
  sectionContainerId?: string;    // absent if section has no container
}

interface RepositoryNavigation {
  rootContainerId: string;
  identity: NavigationNode;
  sections: NavigationNode[];     // precedes-ordered
  diagnostics: string[];
}
```

`RepositoryNavigation` and `NavigationNode` are derived directly from `srs-rust/crates/srs-repository/src/repository_navigation_service.rs` (both structs use `#[serde(rename_all = "camelCase")]`).

---

## Scope

**In scope:**
- Add `RepositoryNavigation` and `NavigationNode` TS interfaces to `srs-client.ts`
- Add `repository_navigation()` to the `SrsRepository` WASM interface in `srs-client.ts`
- Add `repositoryNavigation()` wrapper function in `srs-client.ts`
- Migrate `GovernanceShell.svelte` `loadContainerNav()` from `listContainers() + getContainer()` to `repositoryNavigation()` as the nav source
- Retain `getContainer()` for loading section member records (keyed by `sectionContainerId`)
- Remove `containerType` as a structural/nav key — it is now a display hint only (already demoted in ADR-009; fully removed from nav entry)
- Update `e2e/fixtures/sample.srsj` to be RFC-013 compliant (add `manifest.container`, root container, identity record, section root records, precedes relations)
- Add unit tests for `repositoryNavigation()` in `tests/srs-client.test.ts`

**Out of scope:**
- Showing the identity node in the sidebar header (identity is for future `repoName` sourcing — separate issue)
- Handling the nav for non-governance shells (GuidesShell is unaffected)
- Migrating `gallery.srsj` or `muSrs.srsj` fixtures to RFC-013 (gallery.srsj is the WASM smoke-test fixture; those will be updated separately)
- Removing `listContainers()` or `getContainer()` from `srs-client.ts` (they are still used by other code paths)
- Removing `sections.ts` / `buildDynamicSections()` (kept for backward-compat unit tests per ADR-009)
- Adding a `listContainers()` graceful-degradation fallback for pre-RFC-013 repos (gallery.srsj) — see Phase 2 details

---

## Phases

### Phase 1: WASM facade — add `repositoryNavigation()` to `srs-client.ts`

**Goal:** `repositoryNavigation(repo)` is callable from TypeScript and returns a strongly-typed `RepositoryNavigation`.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `NavigationNode` interface to `srs-client.ts` (after the `ContainerSummary` interfaces, around line 556)
- [ ] Add `RepositoryNavigation` interface to `srs-client.ts`
- [ ] Add `repository_navigation()` method to the `SrsRepository` interface (after `list_terms()`, around line 64)
- [ ] Add `normalizeNavigationNode(raw: unknown): NavigationNode` following existing `normalizeMember` / `normalizeRecord` pattern (dual-lookup `raw.instanceId ?? raw.instance_id` etc.) — because `serde_wasm_bindgen` does not always honour `rename_all = "camelCase"` on nested structs
- [ ] Add `normalizeRepositoryNavigation(raw: unknown): RepositoryNavigation` that calls `normalizeNavigationNode` on `identity` and each element of `sections`
- [ ] Add `repositoryNavigation()` wrapper function that calls `repo.repository_navigation()` and passes result through `normalizeRepositoryNavigation`
- [ ] Add unit tests for `repositoryNavigation()` in `tests/srs-client.test.ts`:
  ```typescript
  describe("repositoryNavigation", () => {
    test("returns RepositoryNavigation with identity and sections", () => {
      const mockNav = {
        rootContainerId: "root-c-1",
        identity: { instanceId: "id-1", typeId: "t-1", typeVersion: 1, typeNamespace: "com.test", typeName: "gov-repo", displayLabel: "Governance Repo" },
        sections: [
          { instanceId: "s-1", typeId: "t-2", typeVersion: 1, typeNamespace: "com.test", typeName: "Articles", displayLabel: "Articles", sectionContainerId: "c-articles" },
          { instanceId: "s-2", typeId: "t-3", typeVersion: 1, typeNamespace: "com.test", typeName: "Decision Log", displayLabel: "Decision Log" }
          // sectionContainerId absent for second section — fallback test
        ],
        diagnostics: []
      };
      const mockRepo = { repository_navigation: () => mockNav } as unknown as SrsRepository;
      const result = repositoryNavigation(mockRepo);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].displayLabel).toBe("Articles");
      expect(result.sections[0].sectionContainerId).toBe("c-articles");
      expect(result.sections[1].sectionContainerId).toBeUndefined();
      expect(result.diagnostics).toHaveLength(0);
    });

    test("returns diagnostic when manifest.container absent (legacy repo)", () => {
      const mockNav = {
        rootContainerId: "",
        identity: { instanceId: "", typeId: "", typeVersion: 0, typeNamespace: "", typeName: "", displayLabel: "" },
        sections: [],
        diagnostics: ["repository-navigation: manifest.container is absent"]
      };
      const mockRepo = { repository_navigation: () => mockNav } as unknown as SrsRepository;
      const result = repositoryNavigation(mockRepo);
      expect(result.sections).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
    });
  });
  ```

#### Acceptance Criteria

- [ ] `repositoryNavigation(repo)` returns `RepositoryNavigation` with correct field shapes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (unit tests green)

#### Testing

```bash
npm run typecheck
npm run lint
npm test
```

#### Milestone gate

1. All acceptance criteria met.
2. `npm run typecheck` and `npm test` pass.
3. Mark completed checkboxes `[x]`.
4. Commit: `feat(srs-client): add repositoryNavigation() wrapper (#98)`

---

### Phase 2: Migrate `GovernanceShell.svelte` nav

**Goal:** The governance sidebar sources sections from `repositoryNavigation()`, ordered by `precedes`, with `displayLabel` as the section title.

**Agent:** Web App Worker

#### Tasks

- [ ] Update imports in `GovernanceShell.svelte`: add `repositoryNavigation` to imports from `srs-client.js`; remove `listContainers` import (keep `getContainer` — still used for loading member records)
- [ ] Update `ContainerNavEntry` interface: replace `title: string` source (now from `displayLabel`); remove `instanceId: string` (not needed — `containerId` is the nav key); remove `containerType?: string` (fully dropped from nav entry — no longer a field); keep `rootTypeId`, `rootTypeVersion`, `rootTypeName`, `rootTypeNamespace`, `icon`; note `containerId` maps to `section.sectionContainerId`
- [ ] Rewrite `loadContainerNav()` to use `repositoryNavigation()` with a `listContainers()` graceful-degradation fallback when `sections` is empty (pre-RFC-013 repos like `gallery.srsj`):
  ```typescript
  function loadContainerNav(): void {
    const nav = repositoryNavigation(repo);
    if (nav.diagnostics.length > 0) {
      console.warn("repository_navigation diagnostics:", nav.diagnostics);
    }

    if (nav.sections.length > 0) {
      // RFC-013 path: sections come from repository_navigation service
      const allRecords = listRecords(repo, {});
      const recordMap = new Map<string, SrsRecord>(allRecords.map(r => [r.instanceId, r]));
      const navEntries: ContainerNavEntry[] = [];
      const recordsByContainer: Record<string, SrsRecord[]> = {};

      for (const section of nav.sections) {
        if (!section.sectionContainerId) {
          // Section root has no container — skip; a nav entry with no container cannot load records
          continue;
        }
        const containerId = section.sectionContainerId;
        const full = getContainer(repo, containerId);
        const members = (full.memberInstanceIds ?? [])
          .map(id => recordMap.get(id))
          .filter((r): r is SrsRecord => r !== undefined);
        recordsByContainer[containerId] = members;

        const regEntry = TYPE_REGISTRY[section.typeId];
        navEntries.push({
          containerId,
          title: section.displayLabel,
          rootTypeId: section.typeId,
          rootTypeVersion: section.typeVersion,
          rootTypeName: section.typeName,
          rootTypeNamespace: section.typeNamespace,
          icon: regEntry?.icon ?? "◻",
        });
      }

      containers = navEntries;
      containerRecords = recordsByContainer;
    } else {
      // Pre-RFC-013 fallback: repo has no manifest.container, use listContainers() (ADR-009 interim)
      buildContainerSections();
    }

    if (activeContainerId === null && containers.length > 0) {
      activeContainerId = containers[0].containerId;
    }
  }
  ```
  Note: `buildContainerSections()` is the existing `listContainers()` + `getContainer()` loop already present in `GovernanceShell.svelte`, extracted into its own function for the fallback path. The fallback keeps the shell working for repos without `manifest.container` (gallery, pre-RFC-013 repos).
- [ ] Remove the `buildContainerSections` usage note from old code; rename/extract it as the fallback function
- [ ] Verify nav still works: section heading shows `displayLabel`, clicking a second nav item updates `activeContainerId` and the heading, form mode clears on section switch, breadcrumb updates

#### Acceptance Criteria

- [ ] Sidebar sections appear in `precedes` order (Articles → Decision Log → Roles as defined in sample.srsj)
- [ ] Section heading in main area reflects nav node's `displayLabel`, not a hardcoded string
- [ ] Clicking "Decision Log" nav item makes the Decision Log heading visible (verifiable via e2e)
- [ ] On load, `activeContainerId` is set to the first section's `containerId` (auto-select)
- [ ] `containerType` is not referenced as a structural join key in `loadContainerNav()` or nav rendering
- [ ] `npm run typecheck` passes

#### Testing

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

#### Milestone gate

1. All acceptance criteria met.
2. Milestone gates pass.
3. Mark completed checkboxes `[x]`.
4. Commit: `feat(governance-shell): source nav from repository_navigation (#98)`

---

### Phase 3: Update `sample.srsj` fixture to RFC-013

**Goal:** `sample.srsj` has a `manifest.container`, root container, identity record, section root records, and precedes relations so `repository_navigation()` returns Articles → Decision Log → Roles in order.

**Agent:** Web App Worker

#### Tasks

- [ ] Add `container` to top-level `manifest` in `sample.srsj`:
  ```json
  "container": {
    "containerId": "00000000-0000-4000-8000-000000000000",
    "title": "Test Governance",
    "identityInstanceId": "11000000-0000-4000-8000-000000000001",
    "rootInstanceIds": ["11000000-0000-4000-8000-000000000001"],
    "memberInstanceIds": [
      "11000000-0000-4000-8000-000000000001",
      "11000000-0000-4000-8000-000000000002",
      "11000000-0000-4000-8000-000000000003",
      "11000000-0000-4000-8000-000000000004"
    ]
  }
  ```
- [ ] Add `instanceIndex` entries to manifest for the 4 new records (identity + 3 section roots):
  ```json
  [
    {"instanceId": "11000000-0000-4000-8000-000000000001", "path": "records/tier-2/11000000-0000-4000-8000-000000000001.json", "tier": 2},
    {"instanceId": "11000000-0000-4000-8000-000000000002", "path": "records/tier-2/11000000-0000-4000-8000-000000000002.json", "tier": 2},
    {"instanceId": "11000000-0000-4000-8000-000000000003", "path": "records/tier-2/11000000-0000-4000-8000-000000000003.json", "tier": 2},
    {"instanceId": "11000000-0000-4000-8000-000000000004", "path": "records/tier-2/11000000-0000-4000-8000-000000000004.json", "tier": 2}
  ]
  ```
- [ ] Add root container file `containers/00000000-0000-4000-8000-000000000000.json` in `data`:
  ```json
  {
    "containerId": "00000000-0000-4000-8000-000000000000",
    "title": "Test Governance",
    "rootInstanceIds": ["11000000-0000-4000-8000-000000000001"],
    "memberInstanceIds": [
      "11000000-0000-4000-8000-000000000001",
      "11000000-0000-4000-8000-000000000002",
      "11000000-0000-4000-8000-000000000003",
      "11000000-0000-4000-8000-000000000004"
    ]
  }
  ```
- [ ] Add identity record `records/tier-2/11000000-0000-4000-8000-000000000001.json` (typeName: `"governance-repo"`, displayLabel derived from typeName)
- [ ] Add Articles section root `records/tier-2/11000000-0000-4000-8000-000000000002.json` (typeName: `"Articles"`)
- [ ] Add Decision Log section root `records/tier-2/11000000-0000-4000-8000-000000000003.json` (typeName: `"Decision Log"`)
- [ ] Add Roles section root `records/tier-2/11000000-0000-4000-8000-000000000004.json` (typeName: `"Roles"`)
- [ ] Update Articles container `containers/aa000001-...` to add `"rootInstanceIds": ["11000000-0000-4000-8000-000000000002"]`
- [ ] Update Decision Log container `containers/dd000001-...` to add `"rootInstanceIds": ["11000000-0000-4000-8000-000000000003"]`
- [ ] Update Roles container `containers/cc000001-...` to add `"rootInstanceIds": ["11000000-0000-4000-8000-000000000004"]`
- [ ] Add `relations/relations-collection.json` in `data` with precedes relations: Articles precedes Decision Log, Decision Log precedes Roles
- [ ] Keep `data["manifest.json"]["containerIndex"]` with the three section containers (the root container is NOT in containerIndex)

#### Acceptance Criteria

- [ ] `navigation.spec.ts` e2e tests pass without modification: "Articles is the default active section", "clicking Decision Log shows Decision Log section heading", "clicking Roles shows Roles section heading"
- [ ] After loading `sample.srsj`, no `console.warn` from `repository_navigation diagnostics` (diagnostics array is empty — the fixture has `manifest.container` configured correctly)
- [ ] Sections appear in precedes order (Articles first, Decision Log second, Roles third)

#### Testing

```bash
npm run build
npm run e2e -- navigation
```

#### Milestone gate

1. All acceptance criteria met.
2. Milestone gates pass.
3. Mark completed checkboxes `[x]`.
4. Commit: `test(fixtures): update sample.srsj to RFC-013 compliant root container (#98)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (unit tests for `repositoryNavigation()`)
- [ ] `npm run e2e` passes (especially `navigation.spec.ts` — sections in order, correct labels)
- [ ] Sidebar sections appear in precedes-order when loading `sample.srsj`
- [ ] `containerType` is not used as a structural join key anywhere in the nav code
- [ ] `console.warn` emitted when `diagnostics` from `repository_navigation` is non-empty

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). `repositoryNavigation()` is a pure pass-through.
- All nav ordering logic lives in the WASM service (`repository_navigation_service`), not in TS.

## Assumptions

- The WASM binary in `srs_bindings/` includes `repository_navigation()` (srs-rust#268, closed). The CI build rebuilds the WASM from source.
- `srs-client.ts` uses `#[serde(rename_all = "camelCase")]` on `RepositoryNavigation` and `NavigationNode` (confirmed in `repository_navigation_service.rs`), so no camelCase normalisation is needed.
- `gallery.srsj` does not have `manifest.container` — `repository_navigation()` returns `sections: []` with a diagnostic. The `listContainers()` fallback path in Phase 2 handles this: when `sections.length === 0`, `buildContainerSections()` is called and gallery-based e2e tests continue to work.
- **display label for sample.srsj:** Since `sample.srsj` has no package, `build_field_name_index` returns empty and `record_display_label` falls back to `typeName`. Setting `typeName: "Articles"` on the Articles section root gives display label "Articles". This is intentional for the test fixture.
- **`sectionContainerId` null handling:** Sections without a `sectionContainerId` are skipped (no nav entry rendered). RFC-013 mandates every section root has a corresponding container, so this only fires for malformed repos. No user-visible warning beyond the existing `diagnostics` console.warn. No fallback to `instanceId` — that was ADR-001 non-compliant (treating a record instanceId as a containerId is a semantic assumption).
