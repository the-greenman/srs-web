import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledPackage } from "../src/lib/packages/bundles.js";

const lock: { packageId: string }[] = JSON.parse(readFileSync("packages.lock.json", "utf8"));

describe("pinned package bundles", () => {
  it("every packages.lock.json entry is bundled", () => {
    for (const { packageId } of lock) expect(bundledPackage(packageId), packageId).toBeTruthy();
  });

  it("ensure-packages refuses a present bundle whose sha256 differs", () => {
    const dir = mkdtempSync(join(tmpdir(), "srs-packages-"));
    for (const { packageId } of lock) writeFileSync(join(dir, `${packageId}.srspkg`), "tampered");
    const run = spawnSync("node", ["scripts/ensure-packages.mjs"], {
      env: { ...process.env, PACKAGES_DIR: dir },
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
