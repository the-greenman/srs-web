/**
 * Wire protocol of the generic browser-executor-relay
 * (the-greenman/browser-executor-relay, README "Contract"). This is the ONLY
 * module that knows relay framing. Bodies are opaque base64url bytes.
 */

export const RELAY_PROTOCOL_VERSION = 1;

export interface RelayRequestFrame {
  version: 1;
  type: "request";
  requestId: string;
  executorGeneration: string;
  deadlineUnixMs: number;
  request: {
    method: "POST";
    contentType: string | null;
    headers: Record<string, string>;
    body: string;
  };
}

export interface RelayResponseFrame {
  version: 1;
  type: "response";
  requestId: string;
  executorGeneration: string;
  response: { status: number; headers: Record<string, string>; body?: string };
}

export interface ChannelBootstrap {
  channel: string;
  executorUrl: string;
  callerUrl: string;
}

/** Close code the relay uses when a takeover replaces this executor. */
export const CLOSE_EXECUTOR_REPLACED = 4002;

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function newGeneration(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * ASSUMPTION (relay protocol not settled for browsers): the relay README says
 * the executor sends `X-Relay-Executor-Generation` / `X-Relay-Executor-Takeover`
 * HTTP headers on the upgrade, but a browser WebSocket cannot set headers. We
 * pass them as `generation` / `takeover` query parameters instead. If the relay
 * settles on another carrier (subprotocol, first frame), change only here.
 */
export function executorSocketUrl(
  executorUrl: string,
  generation: string,
  takeover: boolean
): string {
  const url = new URL(executorUrl);
  url.searchParams.set("generation", generation);
  if (takeover) url.searchParams.set("takeover", "true");
  return url.toString();
}

export async function bootstrapChannel(
  relayUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ChannelBootstrap> {
  const res = await fetchImpl(`${relayUrl.replace(/\/+$/, "")}/v1/channels`, { method: "POST" });
  if (!res.ok) {
    // Relay is channel-origin-bound: it answers 400 {"error":"invalid_origin"} for a
    // malformed/"null" page Origin. Surface its error code verbatim.
    const code = await res.json().then(
      (b: { error?: unknown }) => b?.error,
      () => undefined
    );
    throw new Error(
      code === "invalid_origin"
        ? "Relay refused this page's origin (invalid_origin). Open the app from its normal https URL, not a file or sandboxed frame."
        : `relay bootstrap failed: ${res.status}${typeof code === "string" ? ` (${code})` : ""}`
    );
  }
  return (await res.json()) as ChannelBootstrap;
}
