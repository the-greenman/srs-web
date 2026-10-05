import { describe, expect, it, vi } from "vitest";
import { RelayHost } from "../src/lib/mcp/relay-host";

const creds = (n: string) => ({ callerUrl: `https://${n}/c`, executorUrl: `wss://${n}/e` });
function run(relayUrl: string) {
  const m = new Map([["k", JSON.stringify({ relayUrl: "https://a.test", creds: creds("a.test") })]]);
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(creds("fresh")), { status: 200 }));
  const host = new RelayHost({
    relayUrl,
    storageKey: "k",
    storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    createSocket: () => ({ send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null }) as never,
    onHandled() {},
    onChange() {},
  });
  return { host, fetchImpl, m };
}

describe("RelayHost stored credentials", () => {
  it("reuses them for the same relay URL", async () => {
    const { host, fetchImpl } = run("https://a.test");
    await host.attach({ handle: async () => "" } as never);
    expect(fetchImpl).not.toHaveBeenCalled();
    host.detach();
  });
  it("ignores them for a different relay URL and bootstraps afresh", async () => {
    const { host, fetchImpl } = run("https://b.test");
    await host.attach({ handle: async () => "" } as never);
    expect(fetchImpl).toHaveBeenCalledOnce();
    host.detach();
  });
});
