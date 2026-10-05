# Plan: Upgrade an editor's outdated package from its pinned bundle

Delivers srs-web #450. Extends [plan 341](341-new-repo-install-packages.md): there, an outdated requirement (`version-too-low`) stayed blocked (R1, R8). The core now ships `upgrade_package_bundle` (srs-rust#1269, unreleased), so it can be upgraded.

## Decisions

- **ADR-001.** The core decides everything: the downgrade refusal, conflicts, local edits kept. TS picks the bundle by `packageId` and presents the dry-run plan.
- **U1. Upgradable** = the core's outcome reason is `version-too-low` (`REQUIREMENT_VERSION_TOO_LOW`) and a bundle is pinned. Availability stays side-effect free and cheap: it does not dry-run. Whether the bundle satisfies the requirement is checked after the upgrade by re-deriving availability; a still-unmet editor stays generic.
- **U2. `incompatible` is never upgraded** (another major). Neither are `prerelease-excluded` / `version-unknown` / a thrown check.
- **U3. Mixed rule** (one rule for install and upgrade): `unmet.install` is set only when every unsatisfied requirement is `missing` and bundled; `unmet.upgrade` only when every one is `version-too-low` and bundled. A mix gives neither (blocked).
- **U4. Two steps.** `Upgrade <editor>` runs a dry run and opens `UpgradePlan` (a `Modal`); `Apply` runs the real upgrade through the write-observed repo (document unsaved), re-derives availability and opens the editor.

## Scope

- `srs-client.ts`: `upgradePackageBundle`, `UpgradePackageResult`, `upgradeBundles` (pinned lookup, deduped, throws when not bundled), the reason constants.
- `registry.ts`: `unmet.upgrade`, `upgradableRequirements`, `upgradeEditor(repo, offered, {dryRun})`.
- `GenericSrsShell` (`{prefix}-{id}-upgrade`, props `onPlanUpgrade`/`onUpgradeEditor`), `App.svelte`, `components/UpgradePlan.svelte` (testids `upgrade-modal`, `upgrade-apply`, `upgrade-cancel`), styleguide specimen (Dialogs).
- Tests: registry unit, srs-client unit, real-WASM `tests/editor-upgrade.wasm.test.ts` (essay 1.2.0 fixture `tests/fixtures/essay-1.2.0.srspkg` -> pinned 1.5.0), e2e `e2e/upgrade-package.spec.ts` (fixture `e2e/fixtures/essay-outdated.srsj`), styleguide specimen.

## Fixture decision

The registry requires essay 1.3.0 and EssayShell needs nothing newer (`purpose`, 1.4.0, is hidden when the type lacks it; `bundle_container_id`, 1.5.0, is not read by the shell), so the requirement is not raised. The outdated fixtures are essay **1.2.0** (muDemocracy.org d59e4ba, exported with the srs CLI from the #1269 branch), which is `version-too-low` against the real requirement.

## Release

The released bindings lack `upgrade_package_bundle`, so CI on this branch fails until `ensure-bindings.mjs` pins the build that ships srs-rust#1269 (done by the lead after release).
