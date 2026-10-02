/** Bootstraps a relay channel. All framing lives in ./relay-protocol (vendored). */
import type { ChannelBootstrap } from "./relay-protocol";

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
