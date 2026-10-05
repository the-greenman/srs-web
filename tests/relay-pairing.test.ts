import { describe, expect, it, vi } from "vitest";
import { pairingMinutesLeft } from "../src/lib/components/agent-panel";
import { bootstrapChannel, executorCredential, requestPairing } from "../src/lib/mcp/relay-wire";

const creds = { channel: "c1", callerUrl: "https://relay.test/v1/channels/c1/call/CALLER1", executorUrl: "wss://relay.test/v1/channels/c1/executor/EXEC1?generation=x" };
const ok = { code: "ABCDE-FGHJK", expiresAt: 1000, connectorUrl: "https://relay.test/v1/channels/c1/call" };
const reply = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("executorCredential", () => {
  it.each([
    ["wss://relay.test/v1/channels/c1/executor/EXEC1?generation=x", "EXEC1"],
    ["wss://relay.test/v1/channels/c1/executor/EXEC1/", "EXEC1"],
    ["wss://relay.test/v1/channels/c1/executor/EXEC1?q=1", "EXEC1"],
    ["wss://relay.test/v1/channels/c1/call/X", null],
    ["wss://relay.test/v1/channels/c1/executor/", null],
    ["wss://relay.test/v1/channels/c1/executor//x", null],
    ["not a url", null],
  ])("%s -> %s", (u, want) => expect(executorCredential(u)).toBe(want));
});

describe("requestPairing", () => {
  it("sends one bare POST to the pairing route", async () => {
    for (const relay of ["https://relay.test", "https://relay.test/"]) {
      const f = reply(200, ok);
      expect(await requestPairing(relay, creds, f)).toEqual(ok);
      expect(f).toHaveBeenCalledExactlyOnceWith("https://relay.test/v1/channels/c1/pairing/EXEC1", { method: "POST" });
    }
  });
  it.each([
    [403, { error: "executor_origin_forbidden" }, /origin \(executor_origin_forbidden\)/],
    [403, { error: "invalid_credential" }, /no longer valid; rotate the URL or reconnect\./],
    [500, { error: "x" }, /^pairing failed: 500 \(x\)$/],
    [502, "<html>", /^pairing failed: 502$/],
    [200, { code: 1 }, /^pairing failed: malformed response$/],
  ])("maps %i %j", async (status, body, msg) => {
    const e = await requestPairing("https://relay.test", creds, reply(status, body)).catch((x) => x);
    expect(e.message).toMatch(msg);
    expect(e.message).not.toContain("EXEC1");
  });
});

describe("bootstrapChannel", () => {
  it("still surfaces invalid_origin", async () => {
    await expect(bootstrapChannel("https://relay.test", reply(400, { error: "invalid_origin" }))).rejects.toThrow(/invalid_origin/);
    await expect(bootstrapChannel("https://relay.test", reply(500, "x"))).rejects.toThrow("relay bootstrap failed: 500");
  });
});

describe("pairingMinutesLeft", () => {
  const now = 1_000_000;
  it.each([
    [now + 9 * 60_000 + 41_000, 10],
    [now + 60_000, 1],
    [now + 1, 1],
    [now, 0],
    [now - 5, 0],
    [now + 11 * 60_000, 10],
  ])("%i -> %i", (exp, want) => expect(pairingMinutesLeft(exp, now)).toBe(want));
});
