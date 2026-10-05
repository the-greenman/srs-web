/** Bootstraps a relay channel. All framing lives in ./relay-protocol (vendored). */
import { type ChannelBootstrap, type PairingResponse, pairingPath } from "./relay-protocol";

/** The relay's JSON `error` string for a failed response, else undefined; never throws. */
export async function relayErrorCode(res: Response): Promise<string | undefined> {
  const code = await res.json().then(
    (b: { error?: unknown }) => b?.error,
    () => undefined
  );
  return typeof code === "string" ? code : undefined;
}

/** The executor credential segment of an executor URL (`.../executor/<cred>`), or null. */
export function executorCredential(executorUrl: string): string | null {
  try {
    const parts = new URL(executorUrl).pathname.split("/");
    return parts[parts.indexOf("executor") + 1] || null;
  } catch {
    return null;
  }
}

/** Fetches the current pairing code and secret-free connector URL for a channel. */
export async function requestPairing(
  relayUrl: string,
  creds: ChannelBootstrap,
  fetchImpl: typeof fetch = fetch
): Promise<PairingResponse> {
  const cred = executorCredential(creds.executorUrl);
  if (!cred) throw new Error("pairing failed: no executor credential");
  const res = await fetchImpl(
    `${relayUrl.replace(/\/+$/, "")}${pairingPath(creds.channel, cred)}`,
    {
      method: "POST",
    }
  );
  if (!res.ok) {
    const code = await relayErrorCode(res);
    if (res.status === 403 && code === "executor_origin_forbidden")
      throw new Error(
        "Relay refused pairing from this page's origin (executor_origin_forbidden). Open the app from its normal https URL."
      );
    if (res.status === 403 && code === "invalid_credential")
      throw new Error("This agent's channel is no longer valid; rotate the URL or reconnect.");
    throw new Error(`pairing failed: ${res.status}${code ? ` (${code})` : ""}`);
  }
  const p = (await res.json().catch(() => null)) as Partial<PairingResponse> | null;
  if (
    typeof p?.code !== "string" ||
    typeof p.connectorUrl !== "string" ||
    !Number.isFinite(p.expiresAt)
  )
    throw new Error("pairing failed: malformed response");
  return p as PairingResponse;
}

export async function bootstrapChannel(
  relayUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<ChannelBootstrap> {
  const res = await fetchImpl(`${relayUrl.replace(/\/+$/, "")}/v1/channels`, { method: "POST" });
  if (!res.ok) {
    // Relay is channel-origin-bound: it answers 400 {"error":"invalid_origin"} for a
    // malformed/"null" page Origin. Surface its error code verbatim.
    const code = await relayErrorCode(res);
    throw new Error(
      code === "invalid_origin"
        ? "Relay refused this page's origin (invalid_origin). Open the app from its normal https URL, not a file or sandboxed frame."
        : `relay bootstrap failed: ${res.status}${code ? ` (${code})` : ""}`
    );
  }
  return (await res.json()) as ChannelBootstrap;
}
