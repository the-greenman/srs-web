// @vitest-environment node
/**
 * The site editor is registered for the website package (srs-web#680 B1, ADR-029): offered for a
 * site, creatable from the pinned bundle, and `create` gives a new repository its home page.
 * The registry import pulls in every editor shell, so these tests get a longer timeout.
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

const WEBSITE = "b3603f72-990a-408a-b6fc-28764ebabe78";

async function engine() {
  const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "site-registry.mjs"));
  const mod = await import(/* @vite-ignore */ path.join(dir, "site-registry.mjs"));
  mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
  return mod;
}

describe.skipIf(!haveBindings)("site editor registration on the real engine", () => {
  it(
    "is offered for a site and creatable from the pinned website bundle",
    { timeout: 30_000 },
    async () => {
      const mod = await engine();
      const { bundledPackage } = await import("../src/lib/packages/bundles.js");
      const { availableEditors, creatableEditors } = await import("../src/lib/editors/registry.js");
      const { listTypes } = await import("../src/lib/srs-client.js");
      expect(bundledPackage(WEBSITE)).toBeTruthy();
      expect(creatableEditors().map((e) => e.id)).toContain("site");
      const repo = mod.SrsRepository.load(
        readFileSync(path.join(__dirname, "../e2e/fixtures/site.srsj"), "utf8")
      );
      expect(
        availableEditors(repo, listTypes(repo)).find((o) => o.editor.id === "site")?.unmet
      ).toBeNull();
    }
  );

  it(
    "creates a home page in a new repository once the website package is installed",
    { timeout: 30_000 },
    async () => {
      const mod = await engine();
      const { EDITORS } = await import("../src/lib/editors/registry.js");
      const { installBundles } = await import("../src/lib/srs-client.js");
      const { findSite } = await import("../src/lib/site/site-views.js");
      const { listPages } = await import("../src/lib/site/site-model.js");
      const repo = mod.SrsRepository.create(JSON.stringify({ title: "A site" }));
      installBundles(repo, [WEBSITE]);
      await EDITORS.find((e) => e.id === "site")?.create?.(repo);
      const site = findSite(repo);
      if (!site) throw new Error("no site after install");
      expect(listPages(repo, site).map((p) => [p.key, p.title])).toEqual([["home", "Home"]]);
      expect(repo.validate().summary.errors).toBe(0);
    }
  );
});
