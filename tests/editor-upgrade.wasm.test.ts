// @vitest-environment node
/**
 * Upgrade an outdated essay package on the REAL engine (srs-web#450). The fixture is the essay 1.2.0
 * bundle (below the registry's 1.3.0 requirement); the pinned 1.5.0 bundle is what upgrades it.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}

describe.skipIf(!haveBindings)("upgrade an editor's outdated package on the real engine", () => {
  async function outdated() {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "real.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "real.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Outdated" }));
    repo.install_package_bundle(
      readFileSync(path.join(__dirname, "fixtures/essay-1.2.0.srspkg"), "utf8"),
      "{}"
    );
    return repo;
  }

  it("offers Upgrade, plans without writing, then upgrades, validates clean and opens", async () => {
    const { EDITORS, availableEditors, upgradeEditor } = await import(
      "../src/lib/editors/registry.js"
    );
    const { checkPackageRequirements, listTypes } = await import("../src/lib/srs-client.js");
    const { newEssay } = await import("../src/lib/essay/essay-document.js");
    const repo = await outdated();
    if (typeof repo.upgrade_package_bundle !== "function") return; // bindings predate srs-rust#1269
    const essay = EDITORS.find((e) => e.id === "essay")!;

    expect(checkPackageRequirements(repo, essay.requires)[0].reason).toBe("version-too-low");
    const [offered] = availableEditors(repo, listTypes(repo));
    expect(offered.unmet?.upgrade).toEqual(essay.requires);
    expect(offered.unmet?.install).toBeUndefined();

    const e0 = repo.write_epoch();
    const [plan] = upgradeEditor(repo, offered, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    expect([plan.previousVersion, plan.version]).toEqual(["1.2.0", "1.5.0"]);
    expect(plan.added.length + plan.newVersions.length + plan.updated.length).toBeGreaterThan(0);
    expect(repo.write_epoch()).toBe(e0);
    expect(availableEditors(repo, listTypes(repo))[0].unmet?.upgrade).toBeTruthy();

    const [done] = upgradeEditor(repo, offered);
    expect(done.conflicts).toEqual([]);
    expect(repo.write_epoch()).toBeGreaterThan(e0);
    expect(repo.validate().summary.errors).toBe(0);
    expect(checkPackageRequirements(repo, essay.requires)[0].satisfied).toBe(true);
    expect(availableEditors(repo, listTypes(repo))[0].unmet).toBeNull();
    expect(() => newEssay(repo, "First")).not.toThrow();
  });
});
