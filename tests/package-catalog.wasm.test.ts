// @vitest-environment node
/**
 * Installing from the catalog on the REAL engine (srs-web#712): a new essay installs argument and its
 * missing dependency from served bundles, and its types work at once; nothing is written before the
 * writer confirms; an older essay is told what to upgrade; the generated catalog parses in the core.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/lib/packages/catalog.js";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}
const ESSAY = "5b14a4d4-ec08-4e5b-be75-c183aec90c40";
const ARGUMENT = "126eeba4-3124-4ee6-a9e5-5a943cb87cb5";
const GOVERNANCE = "1cd9622e-3d05-4214-a683-4cb81d0c44d9";
const served = (f: string) => readFileSync(path.resolve(__dirname, "../public/packages", f), "utf8");

const entry = (packageId: string, packageName: string, packageVersion: string): CatalogEntry => ({
  packageId,
  packageName,
  packageVersion,
  fieldCount: 0,
  typeCount: 0,
  locator: { mode: "remote", url: "" },
  checksum: "",
});
const ENTRIES = [
  entry(ESSAY, "essay", "1.9.0"),
  entry(GOVERNANCE, "governance", "1.2.0"),
  entry(ARGUMENT, "argument", "1.4.0"),
];
const fetchText = async (e: CatalogEntry) => {
  if (e.packageId === ARGUMENT) return served("argument-1.4.0.srspkg");
  if (e.packageId === GOVERNANCE) return served("governance-1.2.0.srspkg");
  throw new Error(`nothing should fetch ${e.packageName}: it is installed`);
};

async function engine() {
  const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "package-catalog.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "package-catalog.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

describe.skipIf(!haveBindings)("the package catalog on the real engine", () => {
  it("installs argument and its missing dependency into a new essay, and its types work with no reload", async () => {
    const { applyInstall, availablePackages, planInstall } = await import(
      "../src/lib/packages/catalog.js"
    );
    const { installBundles, listTypes } = await import("../src/lib/srs-client.js");
    const mod = await engine();
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Install" }));
    installBundles(repo, [ESSAY]);
    const before = listTypes(repo).length;
    expect(availablePackages(repo, ENTRIES).map((e) => e.packageName)).toEqual([
      "governance",
      "argument",
    ]);

    const plan = await planInstall(repo, ARGUMENT, { entries: ENTRIES, fetchText });
    expect(plan.packages.map((e) => e.packageName)).toEqual(["governance", "argument"]);
    expect(plan.unmet).toEqual([]);
    expect(listTypes(repo).length).toBe(before); // a plan writes nothing, so a decline leaves no trace

    applyInstall(repo, plan);
    expect(availablePackages(repo, ENTRIES)).toEqual([]);
    const hypothesis = listTypes(repo).find(
      (t: { name: string; namespace: string }) =>
        t.namespace === "com.mudemocracy.argument" && t.name === "hypothesis"
    );
    expect(hypothesis, "an argument type is usable straight away").toBeTruthy();
    expect(repo.validate().summary.errors).toBe(0);

    // a saved essay keeps what was installed
    const reopened = mod.SrsRepository.load(repo.export_srsj());
    expect(availablePackages(reopened, ENTRIES)).toEqual([]);
  });

  it("an older essay is told what to upgrade, and the core refuses the install", async () => {
    const { applyInstall, planInstall } = await import("../src/lib/packages/catalog.js");
    const { installPackageBundle } = await import("../src/lib/srs-client.js");
    const mod = await engine();
    const repo = mod.SrsRepository.create(JSON.stringify({ title: "Older" }));
    const older = readFileSync(
      path.resolve(__dirname, `../src/lib/packages/${ESSAY}@1.8.0.srspkg`),
      "utf8"
    );
    for (const dep of JSON.parse(older).packageDependencies)
      installPackageBundle(
        repo,
        readFileSync(path.resolve(__dirname, `../src/lib/packages/${dep.packageId}.srspkg`), "utf8")
      );
    installPackageBundle(repo, older);

    const plan = await planInstall(repo, ARGUMENT, { entries: ENTRIES, fetchText });
    expect(plan.unmet).toEqual(["essay 1.9.0"]);
    expect(() => applyInstall(repo, plan)).toThrow(/essay/);
  });

  it("the generated catalog parses in the core and names a served file for every entry", async () => {
    const mod = await engine();
    const text = readFileSync(path.resolve(__dirname, "../public/packages/index.json"), "utf8");
    const registry = mod.parse_registry(text);
    const lock: { packageId: string; sha256: string }[] = JSON.parse(
      readFileSync(path.resolve(__dirname, "../packages.lock.json"), "utf8")
    );
    expect(registry.entries.map((e: CatalogEntry) => e.packageId)).toEqual(
      lock.map((l) => l.packageId)
    );
    for (const e of registry.entries as CatalogEntry[]) {
      expect(e.description, e.packageName).toBeTruthy();
      expect(
        existsSync(path.resolve(__dirname, `../public${e.locator.url}`)),
        e.locator.url
      ).toBe(true);
    }
  });
});

describe("a served bundle", () => {
  const E = { ...entry("x", "x", "1.0.0"), locator: { mode: "remote" as const, url: "/packages/x-1.0.0.srspkg" } };
  const serve = (body: string, status = 200) => {
    globalThis.fetch = async () => new Response(body, { status });
  };

  it("is returned when its checksum matches", async () => {
    const { fetchBundle } = await import("../src/lib/packages/catalog.js");
    serve("hello");
    const checksum = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    await expect(fetchBundle({ ...E, checksum })).resolves.toBe("hello");
  });

  it("is refused when its checksum doesn't match, or the download fails", async () => {
    const { fetchBundle } = await import("../src/lib/packages/catalog.js");
    serve("tampered");
    await expect(fetchBundle({ ...E, checksum: "00" })).rejects.toThrow(/published checksum/);
    serve("", 404);
    await expect(fetchBundle(E)).rejects.toThrow(/404/);
  });
});
