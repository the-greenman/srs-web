import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no types
import {
  behindEntries,
  compareSemver,
  latestPackageVersion,
} from "../scripts/check-pin-freshness.mjs";

describe("check-pin-freshness semver", () => {
  it("orders numerically, not lexically", () => {
    expect(compareSemver("1.10.0", "1.9.0")).toBe(1);
    expect(compareSemver("1.5.0", "1.5.0")).toBe(0);
    expect(compareSemver("1.5.0+b1", "1.5.0")).toBe(0);
  });
  it("pre-releases are older than their release", () => {
    expect(compareSemver("2.0.0-rc.1", "2.0.0")).toBe(-1);
    expect(compareSemver("2.0.0-rc.2", "2.0.0-rc.10")).toBe(-1);
    expect(compareSemver("2.0.0-1", "2.0.0-alpha")).toBe(-1);
    expect(compareSemver("2.0.0-rc", "2.0.0-rc.1")).toBe(-1);
  });
  it("returns null for non-semver", () => {
    expect(compareSemver("v1", "1.0.0")).toBeNull();
  });
});

describe("check-pin-freshness behind", () => {
  const tags = [
    "packages-essay-1.5.0",
    "packages-essay-1.10.0",
    "packages-essay-2.0.0-rc.1",
    "packages-essay-pro-9.0.0",
    "v0.1.0-build.3",
  ];
  it("finds the highest tag for the exact name", () => {
    expect(latestPackageVersion(tags, "essay")).toBe("2.0.0-rc.1");
    expect(latestPackageVersion(tags, "other")).toBeUndefined();
  });
  it("flags only older pins", () => {
    expect(behindEntries([{ name: "essay", version: "1.5.0" }], tags)).toEqual([
      { name: "essay", pinned: "1.5.0", latest: "2.0.0-rc.1" },
    ]);
    expect(behindEntries([{ name: "essay", version: "2.0.0" }], tags)).toEqual([]);
    expect(behindEntries([{ name: "essay", version: "1.5.0" }], ["packages-essay-1.5.0"])).toEqual(
      []
    );
    expect(behindEntries([{ name: "essay", version: "junk" }], tags)).toEqual([]);
  });
});
