import { describe, expect, it } from "vitest";
import {
  MANIFEST_FILE,
  SCAN_SKIP_DIRS,
  SRS_MARKER_DIR,
  isOpenableName,
  isScanTargetName,
  isSrsArchiveName,
  isSrsDocumentName,
  listingHasRepoMarker,
  stripSrsExtension,
  toArchiveName,
} from "../src/lib/storage/srs-detect.js";
import type { StorageEntry } from "../src/lib/storage/types.js";

function entry(name: string, kind: StorageEntry["kind"]): StorageEntry {
  return { id: name, name, kind };
}

describe("srs-detect name predicates", () => {
  it("classifies archives, documents, and openables (case-insensitive)", () => {
    expect(isSrsArchiveName("gov.srs")).toBe(true);
    expect(isSrsArchiveName("GOV.SRS")).toBe(true);
    expect(isSrsArchiveName("gov.srsj")).toBe(false);
    expect(isSrsDocumentName("gov.srsj")).toBe(true);
    expect(isSrsDocumentName("gov.json")).toBe(true);
    expect(isSrsDocumentName("gov.srs")).toBe(false);
    expect(isOpenableName("gov.srs")).toBe(true);
    expect(isOpenableName("gov.srsj")).toBe(true);
    expect(isOpenableName("gov.json")).toBe(true);
    expect(isOpenableName("readme.md")).toBe(false);
  });

  it("scan targets are .srs/.srsj only — bare .json is too noisy", () => {
    expect(isScanTargetName("gov.srs")).toBe(true);
    expect(isScanTargetName("gov.srsj")).toBe(true);
    expect(isScanTargetName("package.json")).toBe(false);
  });

  it("strips any recognised extension, leaves others alone", () => {
    expect(stripSrsExtension("gov.srsj")).toBe("gov");
    expect(stripSrsExtension("gov.json")).toBe("gov");
    expect(stripSrsExtension("gov.srs")).toBe("gov");
    expect(stripSrsExtension("gov.md")).toBe("gov.md");
  });

  it("toArchiveName always produces a .srs name (ADR-015 auto-upgrade rename)", () => {
    expect(toArchiveName("gov.srsj")).toBe("gov.srs");
    expect(toArchiveName("gov.json")).toBe("gov.srs");
    expect(toArchiveName("gov.srs")).toBe("gov.srs");
    expect(toArchiveName("gov")).toBe("gov.srs");
  });
});

describe("listingHasRepoMarker", () => {
  it("detects the .srs marker directory", () => {
    expect(listingHasRepoMarker([entry(SRS_MARKER_DIR, "folder"), entry("a.srsj", "file")])).toBe(
      true
    );
  });

  it("detects manifest.json", () => {
    expect(listingHasRepoMarker([entry(MANIFEST_FILE, "file"), entry("records", "folder")])).toBe(
      true
    );
  });

  it("requires the right entry kind for each marker", () => {
    // A file named ".srs" or a folder named "manifest.json" is not a marker.
    expect(listingHasRepoMarker([entry(SRS_MARKER_DIR, "file")])).toBe(false);
    expect(listingHasRepoMarker([entry(MANIFEST_FILE, "folder")])).toBe(false);
  });

  it("is false for a plain folder", () => {
    expect(listingHasRepoMarker([entry("docs", "folder"), entry("readme.md", "file")])).toBe(false);
  });
});

describe("SCAN_SKIP_DIRS", () => {
  it("covers vcs, dependency, and build directories plus the .srs marker itself", () => {
    for (const dir of [".git", ".srs", "node_modules", "dist", "build", "target"]) {
      expect(SCAN_SKIP_DIRS.has(dir)).toBe(true);
    }
  });
});
