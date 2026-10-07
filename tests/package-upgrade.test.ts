import { describe, expect, it, vi } from "vitest";
import { installedPackages, upgradeNoticeText } from "../src/lib/package-upgrade.js";
import type { SrsRepository } from "../src/lib/srs-client.js";

const pins = [
  { packageId: "a", name: "essay", version: "1.7.0" },
  { packageId: "b", name: "guides", version: "2.0.0" },
  { packageId: "c", name: "gov", version: "1.0.0" },
  { packageId: "d", name: "other", version: "3.0.0" },
];
const repoWith = (dependencies: unknown[]) =>
  ({ check_package_requirements: vi.fn().mockReturnValue({ dependencies }) }) as unknown as SrsRepository;

describe("installedPackages", () => {
  it("marks version-too-low outdated, a satisfied one current, and ignores missing and incompatible", () => {
    const repo = repoWith([
      { satisfied: false, reason: "version-too-low", candidateVersions: ["1.5.0"] },
      { satisfied: true, candidateVersions: ["2.0.0"] },
      { satisfied: false, reason: "missing" },
      { satisfied: false, reason: "incompatible", candidateVersions: ["2.0.0"] },
    ]);
    const got = installedPackages(repo, pins);
    expect(got).toEqual([
      { packageId: "a", name: "essay", bundled: "1.7.0", installed: "1.5.0", outdated: true },
      { packageId: "b", name: "guides", bundled: "2.0.0", installed: "2.0.0", outdated: false },
    ]);
    expect(upgradeNoticeText(got.filter((p) => p.outdated))).toBe("essay 1.7.0 is available (installed 1.5.0).");
  });

  it("asks the core once, for the bundled versions, and never compares versions itself", () => {
    const repo = repoWith([{ satisfied: false, reason: "version-too-low", candidateVersions: ["1.10.0"] }]);
    installedPackages(repo, [pins[0]]);
    const spy = repo.check_package_requirements as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0]).packageDependencies[0]).toMatchObject({ packageId: "a", version: "1.7.0" });
  });
});
