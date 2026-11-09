import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PINNED, bundledPackage, priorBundleEntries } from "../src/lib/packages/bundles.js";

const lock: {
  packageId: string;
  onInstall?: boolean;
  history?: { version: string; url: string; sha256: string }[];
}[] = JSON.parse(readFileSync("packages.lock.json", "utf8"));

const dataUrl = (content: string) =>
  `data:application/octet-stream;base64,${Buffer.from(content).toString("base64")}`;

describe("pinned package bundles", () => {
  it("every packages.lock.json entry is bundled, unless it loads on install", () => {
    for (const { packageId, onInstall } of lock)
      expect(!!bundledPackage(packageId), packageId).toBe(!onInstall);
  });

  it("every lock history entry is bundled as prior proof, and the current bundle is not a prior one", () => {
    for (const { packageId, onInstall, history = [] } of lock) {
      if (onInstall) continue;
      expect(
        priorBundleEntries(packageId).map((e) => e.version),
        packageId
      ).toEqual(history.map((h) => h.version).sort());
      const pinned = PINNED.find((p) => p.packageId === packageId)!.version;
      for (const h of history)
        expect(h.version, `${packageId} history must be older than the pin`).not.toBe(pinned);
      for (const h of history) expect(h.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(priorBundleEntries(packageId).map((e) => e.text)).not.toContain(
        bundledPackage(packageId)
      );
    }
    expect(priorBundleEntries("no-such-package")).toEqual([]);
  });

  it("ensure-packages fetches a history entry to <packageId>@<version>.srspkg, verified", () => {
    const dir = mkdtempSync(join(tmpdir(), "srs-packages-"));
    const packageId = "test-package";
    const current = JSON.stringify({ publishedAt: "2026-01-01T00:00:00Z", types: [{}] });
    const served = join(dir, "served");
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const fakeLock = join(dir, "lock.json");
    writeFileSync(
      fakeLock,
      JSON.stringify([
        {
          packageId,
          name: "test",
          version: "2.0.0",
          url: dataUrl(current),
          sha256: sha(current),
          history: [{ version: "1.0.0", url: dataUrl("earlier"), sha256: sha("earlier") }],
        },
      ])
    );
    const run = spawnSync("node", ["scripts/ensure-packages.mjs"], {
      env: { ...process.env, PACKAGES_DIR: dir, PACKAGES_PUBLIC_DIR: served, PACKAGES_LOCK: fakeLock },
    });
    expect(run.status, run.stderr.toString()).toBe(0);
    expect(readFileSync(join(dir, `${packageId}.srspkg`), "utf8")).toBe(current);
    expect(readFileSync(join(served, "test-2.0.0.srspkg"), "utf8")).toBe(current);
    const [entry] = JSON.parse(readFileSync(join(served, "index.json"), "utf8")).entries;
    expect(entry).toMatchObject({
      packageId,
      typeCount: 1,
      kind: "package",
      locator: { mode: "remote", url: "/packages/test-2.0.0.srspkg" },
      checksum: sha(current),
    });
    expect(readFileSync(join(dir, `${packageId}@1.0.0.srspkg`), "utf8")).toBe("earlier");
  });

  it("ensure-packages refreshes a cached bundle whose sha256 is stale, instead of failing", () => {
    const dir = mkdtempSync(join(tmpdir(), "srs-packages-"));
    const packageId = "test-package";
    const current = JSON.stringify({ publishedAt: "2026-01-01T00:00:00Z", types: [{}] });
    const served = join(dir, "served");
    const fresh = '{"fresh":true}';
    const fakeLock = join(dir, "lock.json");
    writeFileSync(
      fakeLock,
      JSON.stringify([
        {
          packageId,
          name: "test",
          version: "1.0.0",
          url: dataUrl(fresh),
          sha256: createHash("sha256").update(fresh).digest("hex"),
        },
      ])
    );
    writeFileSync(join(dir, `${packageId}.srspkg`), "stale-cached-bytes");

    const run = spawnSync("node", ["scripts/ensure-packages.mjs"], {
      env: { ...process.env, PACKAGES_DIR: dir, PACKAGES_PUBLIC_DIR: served, PACKAGES_LOCK: fakeLock },
    });
    expect(run.status, run.stderr.toString()).toBe(0);
    expect(readFileSync(join(dir, `${packageId}.srspkg`), "utf8")).toBe(fresh);
  });

  it("ensure-packages fails when a re-downloaded bundle still mismatches the lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "srs-packages-"));
    const packageId = "test-package";
    const current = JSON.stringify({ publishedAt: "2026-01-01T00:00:00Z", types: [{}] });
    const served = join(dir, "served");
    const fakeLock = join(dir, "lock.json");
    writeFileSync(
      fakeLock,
      JSON.stringify([
        {
          packageId,
          name: "test",
          version: "1.0.0",
          url: dataUrl("still-wrong"),
          sha256: "0".repeat(64),
        },
      ])
    );
    writeFileSync(join(dir, `${packageId}.srspkg`), "stale-cached-bytes");

    const run = spawnSync("node", ["scripts/ensure-packages.mjs"], {
      env: { ...process.env, PACKAGES_DIR: dir, PACKAGES_PUBLIC_DIR: served, PACKAGES_LOCK: fakeLock },
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
