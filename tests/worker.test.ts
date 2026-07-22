import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../worker/index.js";

// Minimal Env that satisfies the Worker handler's needs.
const baseEnv: Env = {
  ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  APP_ORIGIN: "https://app.test",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  GITHUB_REDIRECT_URI: "https://app.test/",
};

function makeRequest(
  path: string,
  options: { method?: string; origin?: string | null; body?: unknown } = {}
): Request {
  const { method = "POST", origin = "https://app.test", body } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin !== null) headers.Origin = origin;
  return new Request(`https://app.test${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function upstreamJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// /api/oauth/github/token — refresh token passthrough
// ---------------------------------------------------------------------------

describe("POST /api/oauth/github/token refresh token passthrough", () => {
  it("includes refresh_token and refresh_token_expires_in when upstream returns them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        upstreamJson({
          access_token: "gha_access",
          expires_in: 28800,
          refresh_token: "ghr_refresh",
          refresh_token_expires_in: 15897600,
        })
      )
    );

    const req = makeRequest("/api/oauth/github/token", {
      body: { code: "code-1", code_verifier: "verifier-1", redirect_uri: "https://app.test/" },
    });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body.access_token).toBe("gha_access");
    expect(body.refresh_token).toBe("ghr_refresh");
    expect(body.refresh_token_expires_in).toBe(15897600);
  });

  it("omits refresh_token when upstream does not return it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        upstreamJson({ access_token: "gha_access", expires_in: null })
      )
    );

    const req = makeRequest("/api/oauth/github/token", {
      body: { code: "code-2", code_verifier: "verifier-2", redirect_uri: "https://app.test/" },
    });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body.access_token).toBe("gha_access");
    expect(Object.prototype.hasOwnProperty.call(body, "refresh_token")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/oauth/github/refresh
// ---------------------------------------------------------------------------

describe("POST /api/oauth/github/refresh", () => {
  it("returns 403 for a missing Origin header", async () => {
    const req = makeRequest("/api/oauth/github/refresh", {
      origin: null,
      body: { refresh_token: "ghr_rt" },
    });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("forbidden_origin");
  });

  it("returns 403 for a mismatched Origin header", async () => {
    const req = makeRequest("/api/oauth/github/refresh", {
      origin: "https://evil.example.com",
      body: { refresh_token: "ghr_rt" },
    });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(403);
  });

  it("returns 400 when refresh_token is absent from the body", async () => {
    const req = makeRequest("/api/oauth/github/refresh", { body: {} });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("missing_parameters");
  });

  it("returns 500 server_misconfigured when client secret is not set", async () => {
    const env = { ...baseEnv, GITHUB_CLIENT_SECRET: "" };
    const req = makeRequest("/api/oauth/github/refresh", { body: { refresh_token: "ghr_rt" } });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(500);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("server_misconfigured");
  });

  it("exchanges the refresh token and returns a new token pair", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        upstreamJson({
          access_token: "gha_new",
          expires_in: 28800,
          refresh_token: "ghr_new",
          refresh_token_expires_in: 15897600,
        })
      )
    );

    const req = makeRequest("/api/oauth/github/refresh", { body: { refresh_token: "ghr_old" } });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body.access_token).toBe("gha_new");
    expect(body.refresh_token).toBe("ghr_new");
    expect(body.refresh_token_expires_in).toBe(15897600);
  });

  it("sends Accept: application/json to the upstream provider", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(upstreamJson({ access_token: "gha_new", expires_in: 28800 }));
    vi.stubGlobal("fetch", fetchMock);

    const req = makeRequest("/api/oauth/github/refresh", { body: { refresh_token: "ghr_old" } });
    await worker.fetch(req, baseEnv);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("returns 502 when upstream returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(upstreamJson({ error: "bad_refresh_token" }, 400))
    );
    const req = makeRequest("/api/oauth/github/refresh", { body: { refresh_token: "ghr_bad" } });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(502);
  });

  it("returns 405 for a non-POST method", async () => {
    const req = makeRequest("/api/oauth/github/refresh", {
      method: "GET",
      body: undefined,
    });
    const res = await worker.fetch(req, baseEnv);
    expect(res.status).toBe(405);
  });
});
