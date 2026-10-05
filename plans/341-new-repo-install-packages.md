# Plan: New repository with editor choice, and install an editor's packages

Delivers srs-web #339 + #340 + #341 (story the-greenman/muDemocracy.org#242, epic #224).

## Summary

The landing page can only create a governance repository. A writer cannot start a blank repository and get the packages an editor needs. This plan adds three things:

1. **Pinned package bundles (#339).** srs-web ships the `.srspkg` bundles its editors can install. Each bundle is fetched at build time and verified by sha256.
2. **Install on open (#340).** In the generic shell, an editor whose packages are missing is offered with an **Install** action. Install runs the core's `install_package_bundle`, the document is marked unsaved, and the editor opens.
3. **New repository (#341).** The landing panel is generalised to: name, an editor checklist, then a destination. The flow is create, install, `def.create?.(repo)`, then open the first chosen editor.

The required WASM surface already ships in the pinned build `v0.1.0-build.461`: `SrsRepository.create`, `check_package_requirements` and `install_package_bundle`. A spike on 2026-10-05 against that exact build checked the whole path. A blank create, then an essay 1.5.0 bundle install, then the requirement check (essay 1.3.0 is satisfied by 1.5.0), then `validate` reported 0 diagnostics.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | main session |
| Web App Worker | main session (small diff) |
| Verification | Verification Agent (srs-web), haiku |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | The core decides install, conflict handling and requirement satisfaction. TS only picks the bundle by `packageId` and presents the outcome. | accepted |
| [ADR-002](../docs/adr/002-editor-mode-selection.md) | Explicit editor selection. The landing checklist and the Install action are explicit user choices, with no auto-detection. | accepted |
| Owner decisions, 2026-10-02 (muDemocracy.org#242) | Use the EditorDefinition contract with the `packageDependencies` shape and `packageId`. Pinned `.srspkg` bundles are fetched at build time with sha256. Governance and guides keep their current paths until srs#390. Essay comes first. | accepted |
| D1: namespace for a blank create | **Core derives it** (owner, 2026-10-05). srs-rust#1265 / PR #1266: `create({title})` derives `com.example.<slug>` with the governance scaffold's function. No TS fallback. | accepted |
| D2: bundle hosting | **Public srs-web release asset** (owner, 2026-10-05). The private muDemocracy.org release `essay-v1.5.0` is the source of record. muDemocracy.org is private, so its asset 404s for CI and Cloudflare. The public copy is srs-web release `packages-essay-1.5.0`, sha256 `117c09c61bc3e3f0060d2a797bad275905f5f7173a268e877b9a43f3052daf31`. | accepted |

## Design decisions (owner input)

**D1. Namespace for a blank repository.** `SrsRepository.create` requires `namespace`. Today the core derives `com.example.<slug>` from the title only inside `governance_scaffold_service::derive_namespace`.
- (a) **Recommended.** srs-rust makes `namespace` optional in `CreateBlankRepositoryInput` and reuses that derivation. That means one small srs-rust PR and a new release, then a bump of srs-web's binding pin.
- (b) TS derives `com.example.<slug>`. That duplicates a core rule in the client, which breaks ADR-001 and the one-way-per-goal rule.
- (c) The form asks for a namespace. Writers do not know what a reverse-DNS name is.

**D2. Where the essay bundle is published.** No muDemocracy.org release exists yet.
- (a) **Recommended, as approved.** Publish a muDemocracy.org GitHub release `essay-v1.5.0` with `essay.srspkg` as its asset. It is exported with `srs package export --selector packages/essay`, using the pinned CLI build and a fixed `--published-at`. srs-web pins `{packageId, url, sha256}`. A release workflow in muDemocracy.org is a follow-up.
- (b) Commit the `.srspkg` file into srs-web. This is simpler, but it departs from the approved decision and leaves no single published copy.

## Contracts

### WASM API surface
No new WASM methods. Every method used is in build.461:
- `SrsRepository.create(input_json)`
- `check_package_requirements(input_json)`
- `install_package_bundle(bundle_json, options_json)`

If D1(a) is chosen, `create`'s input gains an optional `namespace`. That change is filed and landed in srs-rust first.

### TypeScript types
- `srs-client.ts` gains:
  - `createBlankRepository(title: string): SrsRepository`
  - `installPackageBundle(repo, bundleText): InstallPackageResult`. Its fields are `packageId`, `version`, `installed`, `skippedIdentical` and `conflicts`, taken from the CLI payload schema `package install`.
- `src/lib/packages/bundles.ts` exports `bundledPackage(packageId): string | undefined`. Bundles are loaded with `import.meta.glob("./*.srspkg", { query: "?raw", import: "default", eager: true })`.
- `registry.ts`:
  - `UnmetRequirement` gains `install?: PackageRequirement[]`. It is present only when every unmet requirement is missing (has no installed candidate) and has a pinned bundle.
  - An editor whose entry type is absent is now offered when every requirement it has is installable.
  - An outdated requirement stays blocked with its existing reason. Install never upgrades.
  - `EditorDefinition` gains `seed?: (title: string) => SrsRepository`. Governance sets it to `createGovernanceDocument`, and no other editor does.

## Scope

- `packages.lock.json`, `scripts/ensure-packages.mjs` (sha256 check with `node:crypto`; a mismatch fails the build), the gitignored `src/lib/packages/*.srspkg`, and hooks in `prebuild`, `predev` and `fetch-bindings`.
- A sha256 check in `scripts/ensure-bindings.mjs` against the release's `.sha256` asset.
- `srs-client.ts` wrappers. `registry.ts` install-aware availability. A GenericSrsShell Install button, and App `installEditor(id)`.
- `CreateGovernanceDocumentPanel` is renamed `CreateRepositoryPanel` and gains an editor checklist. Only creatable editors are listed: those with a `seed`, or those whose requirements are all bundled. App `createRepository(name, editors, destination)` sets `editorMode` to the first chosen editor.

**Out of scope (each filed as a follow-up):**
- A muDemocracy.org release workflow that publishes bundles on change.
- Extending `check-pin-freshness.mjs` to package pins.
- Upgrade of outdated packages. It is blocked with a message for now.
- Installable governance and guides. Both wait on srs#390, where bundles carry blueprints.

## Rules settled by the plan review (architecture + plan reviewers, 2026-10-05)

- **R1. Installable is the core's reason, not a TS inference.** A requirement is installable only when its outcome `reason === "missing"` (the RFC-044 code, kept in one constant `REQUIREMENT_MISSING` next to `RequirementOutcome`) **and** `bundledPackage(packageId)` exists. Every other reason stays blocked with its existing message: `version-too-low`, `incompatible`, `prerelease-excluded`, `version-unknown`, and a thrown check. TS never reads `candidateVersions` to decide.
- **R2. One derivation.** `registry.ts` exports `installableRequirements(outcomes, requires)`, used inside `availableEditors`, and `creatableEditors(): EditorDefinition[]` (editors with a `seed`, or whose every requirement has a bundle). The panel never recomputes either.
  - `availableEditors` builds the full outcome list with a map, not `findIndex`.
  - `unmet.install` is set only when **every** unsatisfied requirement is installable. A mix of missing and outdated is blocked, with no `install`.
  - An editor whose entry type is absent is offered only when it has `unmet.install`.
- **R3. Install is checked by the core.**
  - `installBundles(repo, packageIds)`, in srs-client, first runs `check_package_requirements(bundleText)`, which covers the bundle's own `packageDependencies`.
  - Any unsatisfied outcome throws `"<name> needs <dep> <version>"` before any write.
  - It then calls `install_package_bundle(text, "{}")`. A non-empty `conflicts` throws, and the result's `notes` go into the message.
  - Package ids are deduplicated across editors, in `EDITORS` order and then `requires` order. A re-install of an identical bundle is a core no-op (`skippedIdentical`).
  - After install, App does not assume success. `availableEditors` re-runs (`documentRevision`), and the existing effect keeps `editorMode` generic if the editor is still unmet.
- **R4. Failure behaviour.**
  - *Create:* the whole repo is built in memory, through create, install and `create` hooks, before anything is persisted or assigned to `repo`. A throw leaves the app idle with the error in the panel, as `createDocument` does today.
  - *Install on open:* packages installed before the failure stay, the document is dirty (write epoch), the error is shown beside the button, and `editorMode` is unchanged. No snapshot or restore, because the user can discard unsaved changes.
- **R5. `seed?` is transitional.** Only governance has one, and it wraps the existing `createGovernanceDocument`. The field comment names srs#390, when governance becomes installable, as the removal condition. `createRepository` throws if two chosen editors both have a `seed`.
- **R6. Selection (ADR-002).**
  - Checkboxes start unchecked.
  - With zero chosen, a blank repo opens in the generic shell, where Install is offered.
  - The editor that opens is the first chosen one in `EDITORS` order.
- **R7. Build wiring.**
  - `ensure-packages.mjs` runs from `prebuild`, from a new `predev` (which also runs ensure-bindings), from `pretest` and `pree2e`, and inside `fetch-bindings`, which CI runs before test and e2e.
  - A test asserts that every `packages.lock.json` entry is present in the `import.meta.glob`, so a missing bundle fails loud instead of turning into "not installable".
- **R8. Deferred (follow-up issues):**
  - a sha256 pin for the bindings tarball (supply-chain hardening, outside #339 to #341's user goal)
  - package-pin freshness in `check-pin-freshness.mjs`
  - a muDemocracy.org workflow that publishes a bundle on change, plus its public mirror
  - upgrading outdated packages

  Function names differ from the issue sketches: `installBundles` / `installableRequirements` stand in for #340's `missingRequirements` / `installPackages`, and the issue bodies are superseded by this plan.

## Phases

### Phase 0: Binding pin
- [ ] After srs-rust PR #1266 merges and its release publishes, bump `ensure-bindings.mjs` `DEFAULT_URL` to that build. Run the full unit suite and e2e on the bump before building on it.

### Phase 1: Pinned bundles (#339)
- [x] `packages.lock.json`: `[{packageId, name, version, url, sha256}]` for essay.
- [x] `scripts/ensure-packages.mjs`: download any missing bundle, verify its sha256 (refusing on mismatch), and write `src/lib/packages/<packageId>.srspkg`. A present file is re-verified, so a stale local copy fails loudly.
- [x] `package.json`: wiring per R7.
- [x] `tests/package-bundles.test.ts`: every lock entry is in the glob. Running `ensure-packages.mjs` with `PACKAGES_DIR` set to a temp dir that holds a tampered `<packageId>.srspkg` exits non-zero. This needs no network, because a present file is re-verified.
- [x] `src/lib/packages/bundles.ts` + `.gitignore`.

**Acceptance:** a fresh `npm run fetch-bindings` writes the essay bundle. `tests/package-bundles.test.ts` passes.

### Phase 2: Install an editor's packages (#340)
- [x] `srs-client.ts`: add `installPackageBundle` and `createBlankRepository`. Add `install_package_bundle` to the local WASM interface.
- [x] `registry.ts`: install-aware `availableEditors`, plus `installEditor(repo, editor)`, which installs each `unmet.install` bundle in order.
- [x] GenericSrsShell `editorButtons` snippet: when `unmet.install` is set, render an `Install {label}` button (`{prefix}-{id}-install`) that calls a new prop `onInstallEditor(id): Promise<void>`. Show busy and disabled while it runs, and the error in a `<Notice>`. The WASM call is synchronous, so a brief freeze is acceptable for a 22 KB bundle.
- [x] App `installEditor(id)`: `installBundles(repo, ids)` through the write-observed repo, so `syncDocument` marks it dirty (no new API). Then `editorMode = id`. R3 and R4 apply.
- [x] Tests:
  - `tests/editor-registry.test.ts` (mocked outcomes), covering R1 and R2:
    - `missing` with a bundle gives `install`
    - `missing` with no bundle is blocked
    - `version-too-low` / `incompatible` / `prerelease-excluded` are blocked
    - a thrown check is fail-closed
    - a mix of missing and outdated is blocked, with no `install`
    - an absent entry type that is installable is offered; an absent entry type that is not installable is not offered
  - `tests/editor-install.wasm.test.ts` (real WASM, build pinned in Phase 0):
    - `createBlankRepository("My Essays")` offers essay as installable
    - `installBundles` advances the write epoch, `validate` reports 0 diagnostics, essay 1.3.0 is satisfied by 1.5.0 (a regression guard on the core's band rule), and `newEssay` works
    - a second identical install is a no-op

### Phase 3: New repository panel (#341)
- [ ] `CreateRepositoryPanel.svelte`: name, then an editor checklist built from the creatable editors, then the existing three destinations.
- [ ] App `createRepository`:
  - The base repo is the first chosen editor with a `seed`, or `createBlankRepository(name)`.
  - Install every other chosen editor's bundles.
  - Run `def.create?.(repo)` for each chosen editor.
  - Persist, open, and set `editorMode`.
- [ ] Rename audit: update `CreateGovernanceDocumentPanel` imports, tests and testids (`create-name`, `create-local`, …, kept as they are; add `create-editor-{id}` checkboxes).
- [ ] e2e, in `e2e/create-document.spec.ts`:
  - `new repository with Essay opens the essay editor` (local)
  - the existing governance tests tick `create-editor-governance` and now land in GovernanceShell
  - `blank repository installs Essay from the generic shell`: generic shell, then `package-editor-essay-install`, then EssayShell with `document-dirty-status`

## Final Acceptance
```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
```
