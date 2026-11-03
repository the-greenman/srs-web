import { describe, expect, it } from "vitest";
import { type FileMeta, asUrls, checkFiles } from "../src/lib/components/attach-check.js";

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
  it("limits the policy total, counting attached bytes and files already accepted", () => {
    const p = { maxTotalBytes: 100 };
    const r = checkFiles([f("a.txt", "text/plain", 30), f("b.txt", "text/plain", 30)], p, 50);
    expect(r.accepted.map((x) => x.name)).toEqual(["a.txt"]);
    expect(r.rejected[0].reason).toBe("would take attachments past the repository's 100 B limit");
  });
  it("lets a policy allow-list replace the defaults", () => {
    const p = { allowedMimeTypes: ["image/png"] };
    const r = checkFiles([f("c.png", "image/png"), f("a.txt", "text/plain")], p, 0);
    expect(r.accepted.map((x) => x.name)).toEqual(["c.png"]);
    expect(r.rejected[0].name).toBe("a.txt");
  });
});

describe("references budget and URLs (#519)", () => {
  it("rejects a PDF with the text-only hint", () => {
    const r = checkFiles([f("paper.pdf", "application/pdf"), f("p2.pdf", "")], undefined, 0);
    expect(r.accepted).toEqual([]);
    expect(r.rejected).toEqual([
      { name: "paper.pdf", reason: "PDF: paste the paper's text or add its URL" },
      { name: "p2.pdf", reason: "unknown file type" },
    ]);
  });
  it("has no total limit without a policy, as the core: a repository past the browser budget still attaches (#234)", () => {
    expect(checkFiles([f("a.txt", "text/plain", 0.8 * MB)], undefined, 50 * MB).accepted).toHaveLength(1);
    expect(checkFiles([f("a.txt", "text/plain", 0.8 * MB)], { maxPerFileBytes: 2 * MB }, 50 * MB).accepted).toHaveLength(1);
    expect(checkFiles([f("a.txt", "text/plain", 0.8 * MB)], { maxTotalBytes: 5 * MB }, 4.5 * MB).rejected).toHaveLength(1);
  });
  it("asUrls: a bare URL or a uri-list is URLs; anything else is ordinary text", () => {
    expect(asUrls(" https://example.org/a?b=1 \n")).toEqual(["https://example.org/a?b=1"]);
    expect(asUrls("# a comment\r\nhttp://a.org\r\nhttps://b.org")).toEqual(["http://a.org", "https://b.org"]);
    expect(asUrls("see https://example.org")).toBeNull();
    expect(asUrls("https://a.org\nsome text")).toBeNull();
    expect(asUrls("ftp://a.org")).toBeNull();
    expect(asUrls("javascript:alert(1)")).toBeNull();
    expect(asUrls("   ")).toBeNull();
  });
});
