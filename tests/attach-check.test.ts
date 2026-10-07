import { describe, expect, it } from "vitest";
import { type FileMeta, checkFiles } from "../src/lib/components/attach-check.js";

const f = (name: string, type: string, size = 10): FileMeta => ({ name, type, size });
const MB = 1024 * 1024;

describe("checkFiles", () => {
  it("accepts text types and rejects others by default", () => {
    const r = checkFiles(
      [f("a.txt", "text/plain"), f("b.json", "application/json"), f("c.png", "image/png")],
      undefined,
      0
    );
    expect(r.accepted.map((x) => x.name)).toEqual(["a.txt", "b.json"]);
    expect(r.rejected).toEqual([{ name: "c.png", reason: "not a text file (image/png)" }]);
  });
  it("derives an empty type from the extension, and rejects an unknown one", () => {
    const r = checkFiles([f("notes.md", ""), f("x.bin", "")], undefined, 0);
    expect(r.accepted.map((x) => x.name)).toEqual(["notes.md"]);
    expect(r.rejected.map((x) => x.name)).toEqual(["x.bin"]);
  });
  it("limits each file to 1 MB by default, and to the policy when given", () => {
    const big = f("big.txt", "text/plain", 1.4 * MB);
    expect(checkFiles([big], undefined, 0).rejected[0].reason).toBe(
      "1.4 MB is over the 1 MB limit"
    );
    expect(checkFiles([big], { maxPerFileBytes: 2 * MB }, 0).accepted).toHaveLength(1);
  });
  it("limits the total, counting used bytes and files already accepted", () => {
    const p = { maxTotalBytes: 100 };
    const r = checkFiles([f("a.txt", "text/plain", 30), f("b.txt", "text/plain", 30)], p, 50);
    expect(r.accepted.map((x) => x.name)).toEqual(["a.txt"]);
    expect(r.rejected[0].reason).toBe("would take the repository past 100 B");
  });
  it("lets a policy allow-list replace the defaults", () => {
    const p = { allowedMimeTypes: ["image/png"] };
    const r = checkFiles([f("c.png", "image/png"), f("a.txt", "text/plain")], p, 0);
    expect(r.accepted.map((x) => x.name)).toEqual(["c.png"]);
    expect(r.rejected[0].name).toBe("a.txt");
  });
});
