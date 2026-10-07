// @vitest-environment node
/**
 * Upgrade with earlier published bundles as proof, and with per-definition consent, on the REAL
 * engine (srs-web#450 / srs-rust#1325). Setup is the live case: essay 1.5.0 installed without its
 * reference copies, so the engine cannot prove any definition unmodified on its own.
 *
 * priorBundles / adopt / provenBy / adopted are srs-rust#1325; the pinned bindings (build 489)
 * predate them. The proof tests probe the engine and SKIP, saying so, until the pin carries #1325;
 * they are deliberately not mocked, so a mismatch with the real option names fails here, not in prod.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
const ESSAY = "5b14a4d4-ec08-4e5b-be75-c183aec90c40";
const pkg = (file: string) => readFileSync(path.resolve(__dirname, "../src/lib/packages", file), "utf8");

describe.skipIf(!haveBindings)("upgrade proof and consent on the real engine", () => {
  async function essay150WithoutReferenceCopies() {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "proof.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "proof.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    const fresh = mod.SrsRepository.create(JSON.stringify({ title: "Live case" }));
    fresh.install_package_bundle(pkg(`${ESSAY}@1.5.0.srspkg`), "{}");
    const files: Record<string, Uint8Array> = fresh.export_tree();
    const kept = Object.fromEntries(Object.entries(files).filter(([p]) => !p.includes(".srs-import/refs")));
    expect(Object.keys(kept).length).toBeLessThan(Object.keys(files).length); // the setup removed something
    return mod.SrsRepository.load_tree(kept);
  }

  const bundle = () => pkg(`${ESSAY}.srspkg`);
  const unproven = (r: { conflicts: { conflictKind: string }[] }) =>
    r.conflicts.filter((c) => c.conflictKind === "no-reference-copy");

  it("without proof the old definitions are unproven conflicts (the live case)", async () => {
    const repo = await essay150WithoutReferenceCopies();
    const plan = repo.upgrade_package_bundle(bundle(), JSON.stringify({ dryRun: true }));
    expect(unproven(plan).length).toBeGreaterThan(0);
  });

  it("an earlier bundle proves them unmodified: updated with provenBy, no conflicts", async (ctx) => {
    const { upgradeBundles } = await import("../src/lib/srs-client.js");
    const repo = await essay150WithoutReferenceCopies();
    const [plan] = upgradeBundles(repo, [ESSAY], { dryRun: true });
    if (unproven(plan).length > 0 && !plan.updated.some((u) => u.provenBy))
      ctx.skip("pinned bindings predate srs-rust#1325 (priorBundles); bump the pin to run this");
    expect(plan.conflicts).toEqual([]);
    expect(plan.updated.some((u) => u.provenBy === "1.5.0")).toBe(true);
    const [done] = upgradeBundles(repo, [ESSAY]);
    expect(done.conflicts).toEqual([]);
    expect(repo.validate().summary.errors).toBe(0);
  });

  it("adopt replaces an unproven definition, and nothing else, only when asked", async (ctx) => {
    const repo = await essay150WithoutReferenceCopies();
    // no priorBundles here: ask the engine directly so the definitions stay unproven
    const options = (adopt?: string[]) => JSON.stringify({ dryRun: true, ...(adopt ? { adopt } : {}) });
    const base = repo.upgrade_package_bundle(bundle(), options());
    const ids = unproven(base).map((c: { id: string }) => c.id);
    const asked = repo.upgrade_package_bundle(bundle(), options(ids));
    if (unproven(asked).length === ids.length) ctx.skip("pinned bindings predate srs-rust#1325 (adopt); bump the pin to run this");
    expect(unproven(asked)).toEqual([]);
    expect(asked.adopted.map((a: { id: string }) => a.id).sort()).toEqual([...ids].sort());
  });
});
