import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledPackage, priorBundles } from "../src/lib/packages/bundles.js";

const lock: { packageId: string; history?: { version: string; url: string; sha256: string }[] }[] = JSON.parse(readFileSync("packages.lock.json", "utf8"));

const dataUrl = (content: string) => `data:application/octet-stream;base64,${Buffer.from(content).toString("base64")}`;

describe("pinned package bundles", () => {
  it("every packages.lock.json entry is bundled", () => {
    for (const { packageId } of lock) expect(bundledPackage(packageId), packageId).toBeTruthy();
  });

  it("every lock history entry is bundled as prior proof, and the current bundle is not a prior one", () => {
    for (const { packageId, history = [] } of lock) {
      expect(priorBundles(packageId).length, packageId).toBe(history.length);
      for (const h of history) expect(h.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(priorBundles(packageId)).not.toContain(bundledPackage(packageId));
    }
    expect(priorBundles("no-such-package")).toEqual([]);
  });

  it("ensure-packages fetches a history entry to <packageId>@<version>.srspkg, verified", () => {
    const dir = mkdtempSync(join(tmpdir(), "srs-packages-"));
    const packageId = "test-package";
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const fakeLock = join(dir, "lock.json");
    writeFileSync(
      fakeLock,
      JSON.stringify([
        {
          packageId, name: "test", version: "2.0.0", url: dataUrl("current"), sha256: sha("current"),
          history: [{ version: "1.0.0", url: dataUrl("earlier"), sha256: sha("earlier") }],
        },
      ])
    );
    const run = spawnSync("node", ["scripts/ensure-packages.mjs"], {
      env: { ...process.env, PACKAGES_DIR: dir, PACKAGES_LOCK: fakeLock },
    });
    expect(run.status, run.stderr.toString()).toBe(0);
    expect(readFileSync(join(dir, `${packageId}.srspkg`), "utf8")).toBe("current");
    expect(readFileSync(join(dir, `${packageId}@1.0.0.srspkg`), "utf8")).toBe("earlier");
  });

  it("ensure-packages refreshes a cached bundle whose sha256 is stale, instead of failing", () => {
    const dir = mkdtempSync(join(tmpdir(), "srs-packages-"));
    const packageId = "test-package";
    const fresh = "fresh-bundle-bytes";
    const fakeLock = join(dir, "lock.json");
    writeFileSync(
      fakeLock,
      JSON.stringify([
        { packageId, name: "test", version: "1.0.0", url: dataUrl(fresh), sha256: createHash("sha256").update(fresh).digest("hex") },
      ])
    );
    writeFileSync(join(dir, `${packageId}.srspkg`), "stale-cached-bytes");

    const run = spawnSync("node", ["scripts/ensure-packages.mjs"], {
      env: { ...process.env, PACKAGES_DIR: dir, PACKAGES_LOCK: fakeLock },
    });
    expect(run.status, run.stderr.toString()).toBe(0);
    expect(readFileSync(join(dir, `${packageId}.srspkg`), "utf8")).toBe(fresh);
  });

  it("ensure-packages fails when a re-downloaded bundle still mismatches the lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "srs-packages-"));
    const packageId = "test-package";
    const fakeLock = join(dir, "lock.json");
    writeFileSync(
      fakeLock,
      JSON.stringify([
        { packageId, name: "test", version: "1.0.0", url: dataUrl("still-wrong"), sha256: "0".repeat(64) },
      ])
    );
    writeFileSync(join(dir, `${packageId}.srspkg`), "stale-cached-bytes");

    const run = spawnSync("node", ["scripts/ensure-packages.mjs"], {
      env: { ...process.env, PACKAGES_DIR: dir, PACKAGES_LOCK: fakeLock },
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr.toString()).toContain("sha256 mismatch");
  });

  it("ensure-bindings refuses a tarball whose sha256 differs", () => {
    const run = spawnSync("node", ["scripts/ensure-bindings.mjs", "--force"], {
      env: {
        ...process.env,
        SRS_BINDINGS_URL: "data:application/gzip;base64,dGFtcGVyZWQ=",
        SRS_BINDINGS_SHA256: "0".repeat(64),
      },
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr.toString()).toContain("sha256 mismatch");
  });
});
