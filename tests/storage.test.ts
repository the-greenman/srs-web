import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DropboxDocumentHandle,
  DropboxProvider,
  parseDropboxOAuthCallback,
} from "../src/lib/storage/dropbox.js";
import { StorageConflictError } from "../src/lib/storage/errors.js";
import { GoogleDriveDocumentHandle } from "../src/lib/storage/google-drive.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Dropbox storage adapter", () => {
  it("parses successful and denied OAuth callbacks", () => {
    expect(parseDropboxOAuthCallback("https://app.test/?code=abc&state=state-1")).toEqual({
      code: "abc",
      state: "state-1",
      error: null,
    });
    expect(
      parseDropboxOAuthCallback(
        "https://app.test/?error=access_denied&error_description=Nope&state=state-2"
      )
    ).toEqual({ code: null, state: "state-2", error: "Nope" });
  });

  it("advances the revision after an update write", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ".tag": "file", id: "id:1", name: "repo.srsj", rev: "rev-2" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const handle = new DropboxDocumentHandle(
      "id:1",
      "repo.srsj",
      "/repo.srsj",
      "rev-1",
      () => "token"
    );

    await expect(handle.write("{}", "rev-1")).resolves.toEqual({ revision: "rev-2" });
    expect(handle.revision).toBe("rev-2");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const args = JSON.parse((request.headers as Record<string, string>)["Dropbox-API-Arg"]) as {
      mode: { ".tag": string; update: string };
    };
    expect(args.mode).toEqual({ ".tag": "update", update: "rev-1" });
  });

  it("maps Dropbox revision conflicts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("conflict", { status: 409 })));
    const handle = new DropboxDocumentHandle(
      "id:1",
      "repo.srsj",
      "/repo.srsj",
      "rev-1",
      () => "token"
    );
    await expect(handle.write("{}", "rev-1")).rejects.toBeInstanceOf(StorageConflictError);
  });

  it("explains missing Dropbox scopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error_summary: "missing_scope/..." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const provider = new DropboxProvider({
      appKey: "app-key",
      redirectUri: "http://localhost:5174/",
    });
    Object.assign(provider, { accessToken: "token", expiresAt: Date.now() + 60_000 });

    await expect(provider.list()).rejects.toThrow(
      "Enable files.metadata.read, files.content.read, and files.content.write",
    );
  });
});

describe("Google Drive storage adapter", () => {
  it("uses the expected revision and records the next revision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "drive-1", name: "repo.srsj", version: "2" }), {
        status: 200,
        headers: { "Content-Type": "application/json", etag: '"etag-2"' },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const handle = new GoogleDriveDocumentHandle(
      "drive-1",
      "repo.srsj",
      '"etag-1"',
      async () => "token"
    );

    await expect(handle.write("{}", '"etag-1"')).resolves.toEqual({
      revision: '"etag-2"',
    });
    expect(handle.revision).toBe('"etag-2"');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.headers as Record<string, string>)["If-Match"]).toBe('"etag-1"');
  });

  it("maps conditional update failures to revision conflicts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 412 })));
    const handle = new GoogleDriveDocumentHandle(
      "drive-1",
      "repo.srsj",
      '"etag-1"',
      async () => "token"
    );
    await expect(handle.write("{}", '"etag-1"')).rejects.toBeInstanceOf(StorageConflictError);
  });
});
