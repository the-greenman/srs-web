import { describe, expect, it, vi } from "vitest";
import { RelayHost, StalePairing } from "../src/lib/mcp/relay-host";

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

describe("RelayHost.pair", () => {
  const fc = (n: string) => ({
    channel: n,
    callerUrl: `https://${n}.test/v1/channels/${n}/call/C`,
    executorUrl: `wss://${n}.test/v1/channels/${n}/executor/E-${n}`,
  });
  const pairing = { code: "ABCDE-FGHJK", expiresAt: 1, connectorUrl: "https://x/call" };
  function setup() {
    const stored = new Map([["k", JSON.stringify({ relayUrl: "https://a.test", creds: fc("old") })]]);
    let release: () => void = () => {};
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("/pairing/")) {
        await new Promise<void>((r) => (release = r));
        return new Response(JSON.stringify(pairing), { status: 200 });
      }
      return new Response(JSON.stringify(fc("new")), { status: 200 });
    });
    const host = new RelayHost({
      relayUrl: "https://a.test",
      storageKey: "k",
      storage: { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => void stored.set(k, v) },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createSocket: () => ({ send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null }) as never,
      onHandled() {},
      onChange() {},
    });
    return { host, urls, release: () => release() };
  }
  const session = { handle: async () => "" } as never;

  it("rejects before any channel exists", async () => {
    await expect(setup().host.pair()).rejects.toThrow("No channel yet");
  });
  it("rejects after detach (no session)", async () => {
    const { host } = setup();
    await host.attach(session);
    host.detach();
    await expect(host.pair()).rejects.toThrow("No channel yet");
  });
  it("uses the attached channel's credential", async () => {
    const { host, urls, release } = setup();
    await host.attach(session);
    const p = host.pair();
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    release();
    expect(await p).toEqual(pairing);
    expect(urls[0]).toBe("https://a.test/v1/channels/old/pairing/E-old");
    host.detach();
  });
  it.each(["rotate", "detach", "takeover"] as const)("rejects with StalePairing when %s lands first", async (op) => {
    const { host, urls, release } = setup();
    await host.attach(session);
    const p = host.pair();
    await vi.waitFor(() => expect(urls).toHaveLength(1));
    if (op === "detach") host.detach();
    else await host[op]();
    release();
    await expect(p).rejects.toBeInstanceOf(StalePairing);
    host.detach();
  });
  it("uses the new credential after a rotate settles", async () => {
    const { host, urls, release } = setup();
    await host.attach(session);
    await host.rotate();
    const p = host.pair();
    await vi.waitFor(() => expect(urls.at(-1)).toContain("/pairing/E-new"));
    release();
    await p;
    host.detach();
  });
});
