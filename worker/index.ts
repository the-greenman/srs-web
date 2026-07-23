/**
 * srs-web Cloudflare Worker — OAuth token-exchange proxy (ADR-011).
 *
 * The ONLY server-side surface in srs-web. It exchanges an OAuth authorization
 * code for an access token for git-host providers (GitHub now; Codeberg later)
 * whose token endpoints require a client secret and have no browser CORS.
 * A separate /refresh route exchanges a refresh token for a new access token
 * without re-prompting the user (ADR-017, srs-web#163).
 *
 * It carries ZERO SRS semantics (ADR-001) — no record/type/relation/.srsj logic.
 * Every non-`/api` request falls through to the static assets (the SPA).
 */

export interface Env {
  /** Static assets binding — serves the built SPA for all non-API routes. */
  ASSETS: { fetch(request: Request): Promise<Response> };
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Exact app origin, e.g. https://app.mudemocracy.org — never a spoofable Host header. */
  APP_ORIGIN: string;
  /** Exact registered OAuth redirect URI, e.g. https://app.mudemocracy.org/ */
  GITHUB_REDIRECT_URI: string;
}

interface TokenRequestBody {
  code?: string;
  code_verifier?: string;
  redirect_uri?: string;
}

interface TokenRefreshBody {
  refresh_token?: string;
}

interface ProviderConfig {
  tokenUrl: string;
  clientId: (env: Env) => string;
  clientSecret: (env: Env) => string;
  redirectUri: (env: Env) => string;
}

/** Registered providers. Codeberg slots in here with no handler rework (its own secret + redirect). */
const PROVIDERS: Record<string, ProviderConfig> = {
  github: {
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: (env) => env.GITHUB_CLIENT_ID,
    clientSecret: (env) => env.GITHUB_CLIENT_SECRET,
    redirectUri: (env) => env.GITHUB_REDIRECT_URI,
  },
};

const TOKEN_ROUTE = /^\/api\/oauth\/([a-z]+)\/token$/;
const REFRESH_ROUTE = /^\/api\/oauth\/([a-z]+)\/refresh$/;

interface UpstreamToken {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleTokenExchange(
  request: Request,
  env: Env,
  providerId: string
): Promise<Response> {
  const provider = PROVIDERS[providerId];
  if (!provider) return json({ error: "unsupported_provider" }, 404);

  // Open-oracle guard: only same-origin browser requests. A missing/null Origin
  // (curl, server-to-server) fails closed.
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.APP_ORIGIN) return json({ error: "forbidden_origin" }, 403);

  let payload: TokenRequestBody;
  try {
    payload = (await request.json()) as TokenRequestBody;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const { code, code_verifier, redirect_uri } = payload;
  if (!code || !code_verifier) return json({ error: "missing_parameters" }, 400);
  if (redirect_uri !== provider.redirectUri(env)) {
    return json({ error: "invalid_redirect_uri" }, 403);
  }

  const clientId = provider.clientId(env);
  const clientSecret = provider.clientSecret(env);
  // Fail fast rather than sending the literal "undefined" upstream when a
  // wrangler secret/var was never set (fresh worker, forgotten `secret put`).
  if (!clientId || !clientSecret) {
    return json({ error: "server_misconfigured" }, 500);
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier,
    redirect_uri,
    grant_type: "authorization_code",
  });

  const upstream = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const data = (await upstream.json().catch(() => ({}))) as UpstreamToken;
  if (!upstream.ok || data.error || !data.access_token) {
    return json(
      { error: data.error_description ?? data.error ?? "token_exchange_failed" },
      502
    );
  }

  // Pass through optional refresh fields — present only when the GitHub App has
  // "Expire user authorization tokens" enabled. Undefined fields are dropped by
  // JSON.stringify so the response shape is always well-formed.
  return json({
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
    refresh_token_expires_in: data.refresh_token_expires_in,
  });
}

async function handleTokenRefresh(
  request: Request,
  env: Env,
  providerId: string
): Promise<Response> {
  const provider = PROVIDERS[providerId];
  if (!provider) return json({ error: "unsupported_provider" }, 404);

  // Same open-oracle guard as handleTokenExchange.
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.APP_ORIGIN) return json({ error: "forbidden_origin" }, 403);

  let payload: TokenRefreshBody;
  try {
    payload = (await request.json()) as TokenRefreshBody;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const { refresh_token } = payload;
  if (!refresh_token) return json({ error: "missing_parameters" }, 400);

  const clientId = provider.clientId(env);
  const clientSecret = provider.clientSecret(env);
  if (!clientId || !clientSecret) {
    return json({ error: "server_misconfigured" }, 500);
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token,
    grant_type: "refresh_token",
  });

  const upstream = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Required: without Accept: application/json GitHub returns
      // application/x-www-form-urlencoded, which breaks upstream.json().
      Accept: "application/json",
    },
    body,
  });

  const data = (await upstream.json().catch(() => ({}))) as UpstreamToken;
  if (!upstream.ok || data.error || !data.access_token) {
    return json(
      { error: data.error_description ?? data.error ?? "token_refresh_failed" },
      502
    );
  }

  return json({
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token,
    refresh_token_expires_in: data.refresh_token_expires_in,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const tokenMatch = url.pathname.match(TOKEN_ROUTE);
    if (tokenMatch) {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return handleTokenExchange(request, env, tokenMatch[1]);
    }

    const refreshMatch = url.pathname.match(REFRESH_ROUTE);
    if (refreshMatch) {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return handleTokenRefresh(request, env, refreshMatch[1]);
    }

    return env.ASSETS.fetch(request);
  },
};
