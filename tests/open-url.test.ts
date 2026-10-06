import { describe, expect, it, vi } from "vitest";
import {
  MAX_ARCHIVE_BYTES,
  OpenUrlError,
  fetchArchiveFile,
  parseOpenUrl,
  sniffArchive,
  withoutOpenParam,
} from "../src/lib/open-url";

const zip = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]);
const json = new TextEncoder().encode('  {"srsVersion":"2.0"}');
const ok = (body: BodyInit | null, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(body, init)) as unknown as typeof fetch;

describe("parseOpenUrl", () => {
  it("accepts https", () =>
    expect(parseOpenUrl("https://semanticops.com/try/meeting.srs", false).host).toBe(
      "semanticops.com"
    ));
  it.each([
    "http://example.com/a.srs",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/plain,x",
    "ftp://x/a.srs",
  ])("refuses %s", (u) => {
    expect(() => parseOpenUrl(u, true)).toThrow(OpenUrlError);
  });
  it("allows http only for localhost, and only in dev", () => {
    expect(parseOpenUrl("http://localhost:5173/a.srs", true).hostname).toBe("localhost");
    expect(() => parseOpenUrl("http://localhost:5173/a.srs", false)).toThrow(/https/);
    expect(() => parseOpenUrl("http://evil.test/a.srs", true)).toThrow(/https/);
  });
  it("refuses credentials and garbage", () => {
    expect(() => parseOpenUrl("https://u:p@example.com/a.srs", false)).toThrow(/user name/);
    expect(() => parseOpenUrl("", false)).toThrow(/not a valid URL/);
  });
});

describe("withoutOpenParam", () => {
  it("drops only open", () => {
    expect(
      withoutOpenParam("https://app.test/?open=https%3A%2F%2Fa.test%2Fx.srs&theme=dark#h")
    ).toBe("/?theme=dark#h");
    expect(withoutOpenParam("https://app.test/?open=x")).toBe("/");
  });
});

describe("sniffArchive", () => {
  it("tells zip, json and neither", () => {
    expect(sniffArchive(zip)).toBe("srs");
    expect(sniffArchive(json)).toBe("srsj");
    expect(sniffArchive(new TextEncoder().encode("<!doctype html>"))).toBeNull();
  });
});

describe("fetchArchiveFile", () => {
  const url = new URL("https://semanticops.com/try/meeting.srs");
  it("fetches without credentials and names the file from the URL", async () => {
    const f = ok(zip);
    const file = await fetchArchiveFile(url, f);
    expect(file.name).toBe("meeting.srs");
    expect(file.size).toBe(zip.length);
    expect(f).toHaveBeenCalledWith(url.href, expect.objectContaining({ credentials: "omit" }));
  });
  it("fixes the extension from the content", async () => {
    expect((await fetchArchiveFile(new URL("https://x.test/a"), ok(json))).name).toBe("a.srsj");
    expect((await fetchArchiveFile(new URL("https://x.test/a.srsj"), ok(zip))).name).toBe("a.srs");
  });
  it("reports a network or CORS failure", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchArchiveFile(url, f)).rejects.toThrow(/CORS/);
  });
  it("reports an HTTP error and a non-archive body", async () => {
    await expect(
      fetchArchiveFile(url, ok("nope", { status: 404, statusText: "Not Found" }))
    ).rejects.toThrow(/404/);
    await expect(fetchArchiveFile(url, ok("<html></html>"))).rejects.toThrow(/not an SRS archive/);
  });
  it("refuses a file over the cap, by header and by streamed size", async () => {
    await expect(
      fetchArchiveFile(
        url,
        ok(zip, { headers: { "content-length": String(MAX_ARCHIVE_BYTES + 1) } })
      )
    ).rejects.toThrow(/50 MB/);
    const big = new Uint8Array(MAX_ARCHIVE_BYTES + 1);
    await expect(fetchArchiveFile(url, ok(big))).rejects.toThrow(/50 MB/);
  });
});
