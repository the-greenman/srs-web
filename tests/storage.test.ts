import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DropboxDocumentHandle,
  DropboxProvider,
  parseDropboxOAuthCallback,
} from "../src/lib/storage/dropbox.js";
import { StorageConflictError } from "../src/lib/storage/errors.js";
import {
  decodeBase64,
  encodeBase64,
  type GitContentsLocation,
} from "../src/lib/storage/git-contents.js";
import {
  completeGitHubOAuthCallback,
  GitHubDocumentHandle,
  GitHubProvider,
  parseGitHubOAuthCallback,
} from "../src/lib/storage/github.js";
import {
  GoogleDriveDocumentHandle,
  GoogleDriveProvider,
} from "../src/lib/storage/google-drive.js";

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
        })
      )
    );
    const provider = new DropboxProvider({
      appKey: "app-key",
      redirectUri: "http://localhost:5174/",
    });
    Object.assign(provider, { accessToken: "token", expiresAt: Date.now() + 60_000 });

    await expect(provider.list()).rejects.toThrow(
      "Enable files.metadata.read, files.content.read, and files.content.write"
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

// ---------------------------------------------------------------------------
// Provider create() — new-document creation (srs-web#141)
// ---------------------------------------------------------------------------

describe("DropboxProvider.create", () => {
  function signedInProvider(): DropboxProvider {
    const provider = new DropboxProvider({ appKey: "key", redirectUri: "https://app.test/" });
    // biome-ignore lint/suspicious/noExplicitAny: test seam — pre-seed a valid token to skip the OAuth popup
    (provider as any).accessToken = "token";
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    (provider as any).expiresAt = Date.now() + 3_600_000;
    return provider;
  }

  it("uploads with mode add + autorename and returns a writable handle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ".tag": "file",
          id: "id:new",
          name: "my-org.srsj",
          path_lower: "/my-org.srsj",
          rev: "rev-1",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const handle = await signedInProvider().create("my-org.srsj", '{"srsj":"1"}');

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://content.dropboxapi.com/2/files/upload");
    expect(request.body).toBe('{"srsj":"1"}');
    const args = JSON.parse((request.headers as Record<string, string>)["Dropbox-API-Arg"]) as {
      path: string;
      mode: string;
      autorename: boolean;
    };
    expect(args).toMatchObject({ path: "/my-org.srsj", mode: "add", autorename: true });
    expect(handle.provider).toBe("dropbox");
    expect(handle.capabilities.write).toBe(true);
    expect(handle.name).toBe("my-org.srsj");
    expect(handle.revision).toBe("rev-1");
  });

  it("throws a StorageFetchError on upload failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"error_summary":"path/no_write"}', { status: 400 }))
    );
    await expect(signedInProvider().create("x.srsj", "{}")).rejects.toThrow(
      /Dropbox create failed/
    );
  });
});

describe("GoogleDriveProvider.create", () => {
  function signedInProvider(): GoogleDriveProvider {
    const provider = new GoogleDriveProvider({ clientId: "c", apiKey: "k", appId: "a" });
    // biome-ignore lint/suspicious/noExplicitAny: test seam — pre-seed a valid token to skip GIS
    (provider as any).accessToken = "gtoken";
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    (provider as any).expiresAt = Date.now() + 3_600_000;
    return provider;
  }

  it("creates via multipart upload and returns a writable handle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "drive-new", name: "my-org.srsj" }), {
        status: 200,
        headers: { "Content-Type": "application/json", etag: "etag-1" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const handle = await signedInProvider().create("my-org.srsj", '{"srsj":"1"}');

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart");
    expect((request.headers as Record<string, string>)["Content-Type"]).toContain(
      "multipart/related"
    );
    expect(String(request.body)).toContain('{"name":"my-org.srsj","mimeType":"application/json"}');
    expect(String(request.body)).toContain('{"srsj":"1"}');
    expect(handle.provider).toBe("google-drive");
    expect(handle.capabilities.write).toBe(true);
    expect(handle.id).toBe("drive-new");
    expect(handle.revision).toBe("etag-1");
  });

  it("throws a StorageFetchError on create failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":{"message":"insufficient permissions"}}', { status: 403 })
        )
    );
    await expect(signedInProvider().create("x.srsj", "{}")).rejects.toThrow(
      /Google Drive create failed/
    );
  });
});

// ---------------------------------------------------------------------------
// GitHub storage adapter (srs-web#152)
// ---------------------------------------------------------------------------

describe("GitHub storage adapter", () => {
  const location: GitContentsLocation = {
    apiBase: "https://api.github.com",
    owner: "octo",
    repo: "gov",
    path: "governance/repo.srsj",
    branch: "main",
  };

  it("parses successful and denied OAuth callbacks", () => {
    expect(parseGitHubOAuthCallback("https://app.test/?code=abc&state=state-1")).toEqual({
      code: "abc",
      state: "state-1",
      error: null,
    });
    expect(
      parseGitHubOAuthCallback(
        "https://app.test/?error=access_denied&error_description=Nope&state=state-2"
      )
    ).toEqual({ code: null, state: "state-2", error: "Nope" });
  });

  it("does not consume a redirect it did not initiate (no GitHub state in sessionStorage)", async () => {
    // A Dropbox popup redirect also carries ?code&state; the GitHub handler must
    // ignore it (return false, no token exchange) so the right handler runs.
    vi.stubGlobal("window", {
      location: { href: "http://localhost:5173/?code=abc&state=s1", origin: "http://localhost:5173" },
      opener: {},
      close: () => {},
    });
    vi.stubGlobal("sessionStorage", { getItem: () => null, removeItem: () => {} });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeGitHubOAuthCallback({ clientId: "c", redirectUri: "http://localhost:5173/" })
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("round-trips UTF-8 through base64", () => {
    const original = '{"emdash":"—","name":"Ωmega"}';
    expect(decodeBase64(encodeBase64(original))).toBe(original);
  });

  it("decodes base64 content and captures the blob SHA on read", async () => {
    const text = '{"srsVersion":"2.0-draft"}';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ content: encodeBase64(text), encoding: "base64", sha: "sha-1" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, null, () => "token");

    await expect(handle.read()).resolves.toBe(text);
    expect(handle.revision).toBe("sha-1");
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/repos/octo/gov/contents/governance/repo.srsj?ref=main");
  });

  it("sends the expected SHA and advances the revision on write", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: { sha: "sha-2" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, "sha-1", () => "token");

    await expect(handle.write("{}", "sha-1")).resolves.toEqual({ revision: "sha-2" });
    expect(handle.revision).toBe("sha-2");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("PUT");
    const body = JSON.parse(String(request.body)) as {
      sha: string;
      content: string;
      branch: string;
    };
    expect(body.sha).toBe("sha-1");
    expect(body.branch).toBe("main");
    expect(decodeBase64(body.content)).toBe("{}");
  });

  it("omits the SHA when creating a new file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: { sha: "sha-new" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, null, () => "token");

    await expect(handle.write("{}", null)).resolves.toEqual({ revision: "sha-new" });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      sha?: string;
    };
    expect(body.sha).toBeUndefined();
  });

  it.each([409, 422])("maps HTTP %i on a stale SHA to a conflict", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, "sha-1", () => "token");
    await expect(handle.write("{}", "sha-1")).rejects.toBeInstanceOf(StorageConflictError);
  });

  it("explains a 403 write as a missing Contents write permission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Resource not accessible by integration" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, "sha-1", () => "token");
    await expect(handle.write("{}", "sha-1")).rejects.toThrow(/Read & write/);
  });

  it("saveToBranch commits to the current branch without creating a ref", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: { sha: "sha-2" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, "sha-1", () => "token");

    await expect(handle.saveToBranch("{}", { branch: "main" })).resolves.toEqual({
      revision: "sha-2",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // just the PUT, no ref ops
    expect(handle.branch).toBe("main");
  });

  it("saveToBranch creates a new branch, writes to it, and rebinds the handle", async () => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ object: { sha: "commit-1" } })) // GET source head ref
      .mockResolvedValueOnce(json({ ref: "refs/heads/feature" }, 201)) // POST create ref
      .mockResolvedValueOnce(json({ content: { sha: "sha-branch" } })); // PUT contents
    vi.stubGlobal("fetch", fetchMock);
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, "sha-1", () => "token");

    await expect(
      handle.saveToBranch("{}", { branch: "feature", createFromCurrent: true })
    ).resolves.toEqual({ revision: "sha-branch" });
    expect(handle.branch).toBe("feature");

    const createBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(createBody).toMatchObject({ ref: "refs/heads/feature", sha: "commit-1" });
    const putBody = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body));
    expect(putBody.branch).toBe("feature");
    expect(putBody.sha).toBe("sha-1");
  });

  it("saveToBranch on an existing branch uses that branch's SHA, not the source's", async () => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ object: { sha: "commit-1" } })) // GET source head ref
      .mockResolvedValueOnce(json({ message: "Reference already exists" }, 422)) // POST create ref -> exists
      .mockResolvedValueOnce(json({ sha: "target-sha" })) // GET file sha on the existing target branch
      .mockResolvedValueOnce(json({ content: { sha: "sha-after" } })); // PUT contents
    vi.stubGlobal("fetch", fetchMock);
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, "sha-1", () => "token");

    await expect(
      handle.saveToBranch("{}", { branch: "feature", createFromCurrent: true })
    ).resolves.toEqual({ revision: "sha-after" });
    // The write must send the *target branch's* SHA, not the stale source SHA.
    const putBody = JSON.parse(String((fetchMock.mock.calls[3]?.[1] as RequestInit).body));
    expect(putBody.sha).toBe("target-sha");
  });

  it("binds an opened document to the branch chosen while browsing", async () => {
    const provider = new GitHubProvider({ clientId: "c", redirectUri: "https://app.test/" });
    // biome-ignore lint/suspicious/noExplicitAny: test seam — skip the OAuth popup
    (provider as any).accessToken = "token";
    // biome-ignore lint/suspicious/noExplicitAny: test seam
    (provider as any).expiresAt = Date.now() + 3_600_000;

    const handle = await provider.open({
      id: "octo/gov:dev:governance/repo.srsj",
      name: "repo.srsj",
      kind: "file",
      path: "octo/gov:dev:governance/repo.srsj",
      revision: "sha-1",
    });

    // The handle targets the browsed branch/repo — so Save defaults there.
    expect((handle as GitHubDocumentHandle).branch).toBe("dev");
    expect((handle as GitHubDocumentHandle).repoLabel).toBe("octo/gov");
  });

  it("treats a non-SHA 422 as a fetch error, not a false conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Invalid request. Branch name is invalid." }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    const handle = new GitHubDocumentHandle("id:1", "repo.srsj", location, "sha-1", () => "token");
    const err = await handle.write("{}", "sha-1").catch((e) => e);
    expect(err).not.toBeInstanceOf(StorageConflictError);
    expect(String(err)).toMatch(/Branch name is invalid/);
  });
});
