// @vitest-environment node
/**
 * srs-web#611 against the REAL engine (srs-rust#1454): a pre-10 .srsj opens migrated in memory with
 * a notice, every write is refused with `migration-required-before-write` until the user accepts,
 * and the refusal reaches the write choke point's prompt callback.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}

describe.skipIf(!haveBindings)("in-memory migration notice on the real engine", () => {
  async function engine() {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "migration-notice.mjs"));
    const mod = await import(/* @vite-ignore */ path.join(dir, "migration-notice.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    return mod;
  }
  const rev7 = () =>
    readFileSync(path.resolve(__dirname, "../e2e/fixtures/rev7/sample-rev7.srsj"), "utf8");

  it("refuses writes until accepted, tells the choke point, then exports at revision 10", async () => {
    const mod = await engine();
    const client = await import("../src/lib/srs-client.js");
    const raw = mod.SrsRepository.load(rev7());

    const notice = client.migrationNotice(raw);
    expect(notice?.sourceRevision).toBe(7);
    expect(notice?.migrations).toEqual([
      "rfc043-container-entries",
      "rfc046-actor-provenance",
      "rfc052-root-container",
    ]);
    // The tree gate's list is empty for a load() handle: the notice is the only signal.
    expect(client.neededMigrationIds(raw)).toEqual([]);

    const onRequired = vi.fn();
    const repo = client.observeWrites(raw, () => {}, onRequired);
    let refused: unknown;
    try {
      client.createContainer(repo, { title: "Before consent" });
    } catch (e) {
      refused = e;
    }
    expect(client.isMigrationRequired(refused)).toBe(true);
    expect(onRequired).toHaveBeenCalledTimes(1);

    client.acceptMigration(repo);
    expect(client.migrationNotice(repo)).toBeNull();
    expect(() => client.createContainer(repo, { title: "After consent" })).not.toThrow();
    expect(onRequired).toHaveBeenCalledTimes(1);
    expect(JSON.parse(client.exportSrsj(repo)).manifest.dataModelRevision).toBe(10);
  });

  it("a current document carries no notice, and the governance seed is 1.2.3 at revision 10", async () => {
    const mod = await engine();
    const client = await import("../src/lib/srs-client.js");
    const text = readFileSync(path.join(bindings, "governance-seed.srsj"), "utf8");
    const seed = JSON.parse(text);
    expect(seed.manifest.dataModelRevision).toBe(10);
    expect(seed.data["package/package.json"].version).toBe("1.2.3");
    expect(client.migrationNotice(mod.SrsRepository.load(text))).toBeNull();
  });

  it("isMigrationRequired branches on the code only", async () => {
    const { isMigrationRequired, MIGRATION_REQUIRED_CODE } = await import("../src/lib/srs-client.js");
    expect(isMigrationRequired(Object.assign(new Error("x"), { code: MIGRATION_REQUIRED_CODE }))).toBe(true);
    expect(isMigrationRequired(new Error(MIGRATION_REQUIRED_CODE))).toBe(false);
    expect(isMigrationRequired(null)).toBe(false);
  });
});
