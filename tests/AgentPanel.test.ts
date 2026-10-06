// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import AgentPanel from "../src/lib/components/AgentPanel.svelte";
import type { PanelAgent } from "../src/lib/components/agent-panel";

const nop = () => null;
const relay = { id: "relay:1", label: "Test relay", url: "https://relay.test", isDefault: true };
const base = {
  relays: [relay],
  agents: [] as PanelAgent[],
  now: Date.parse("2026-01-01T00:10:00Z"),
  onAddRelay: nop,
  onUpdateRelay: nop,
  onRemoveRelay: nop,
  onSetDefault() {},
  onConnectNew() {},
  onConnect() {},
  onDisconnect() {},
  onForget() {},
  onRename() {},
  onRotate() {},
  onTakeover() {},
  pair: async () => ({
    code: "K7QPM-2XD4R",
    expiresAt: 0,
    connectorUrl: "https://relay.test/call",
  }),
};
const agent = (o: Partial<PanelAgent> = {}): PanelAgent => ({
  conn: { id: "agent:a", relayId: "relay:1", lastConnectedAt: "2026-01-01T00:08:00Z" },
  name: "alpha",
  relayLabel: "Test relay",
  state: null,
  inUseElsewhere: false,
  ...o,
});

it("with no relay: only 'No relay yet.' and the open add form; a seeded agent is hidden", () => {
  const { getByTestId, queryByTestId, container } = render(AgentPanel, {
    ...base,
    relays: [],
    agents: [agent({ conn: { id: "agent:a" } })],
  });
  expect(getByTestId("agent-panel-empty").textContent).toBe("No relay yet.");
  expect(queryByTestId("mcp-library-item")).toBeNull();
  expect(queryByTestId("mcp-connect-open")).toBeNull();
  expect(getByTestId("relay-add-open").getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector("details,h1,h2,h3,h4,h5,h6")).toBeNull();
});

it("with a relay and no agents: 'No agents yet.' and the connect disclosure", () => {
  const { getByText, getByTestId } = render(AgentPanel, base);
  getByText("No agents yet.");
  expect(getByTestId("mcp-connect-open").getAttribute("aria-expanded")).toBe("false");
});

it("a saved agent row: name, relay, last connected, Connect; no heading", () => {
  const { getByTestId, container } = render(AgentPanel, { ...base, agents: [agent()] });
  const row = getByTestId("mcp-library-item");
  expect(row.textContent).toContain("alpha");
  expect(row.textContent).toContain("Test relay");
  expect(getByTestId("agent-connected").textContent).toBe("Connected 2 min ago");
  expect(getByTestId("mcp-library-connect")).toBeTruthy();
  expect(container.querySelector("h1,h2,h3,h4,h5,h6")).toBeNull();
});

it("an open agent: one status word, Disconnect, last activity", () => {
  const { getByTestId, queryByTestId } = render(AgentPanel, {
    ...base,
    ctx: { lastActivity: () => "titled ¶ Opening · 2 min ago" },
    agents: [
      agent({ state: { status: "online", callerUrl: "https://relay.test/c", error: null } }),
    ],
  });
  expect(getByTestId("mcp-status").textContent).toBe("Connected");
  expect(getByTestId("mcp-disconnect")).toBeTruthy();
  expect(getByTestId("agent-last").textContent).toBe("titled ¶ Opening · 2 min ago");
  expect(queryByTestId("mcp-library-item")).toBeNull();
});

it("in use elsewhere disables Connect and shows the marker", () => {
  const { getByTestId } = render(AgentPanel, {
    ...base,
    agents: [agent({ inUseElsewhere: true })],
  });
  expect((getByTestId("mcp-library-connect") as HTMLButtonElement).disabled).toBe(true);
  expect(getByTestId("mcp-in-use")).toBeTruthy();
});

const online = (callerUrl: string | null = "https://relay.test/c") => ({
  status: "online" as const,
  callerUrl,
  error: null,
});
const NOW = base.now;
const pairing = (ms: number) => ({
  code: "K7QPM-2XD4R",
  expiresAt: NOW + ms,
  connectorUrl: "https://relay.test/call",
});
async function openPair(props: Record<string, unknown>) {
  const r = render(AgentPanel, { ...base, ...props });
  await fireEvent.click(r.getByTestId("agent-menu"));
  await fireEvent.click(r.getByTestId("agent-pair"));
  return r;
}

it("shows no connection box until a view is opened; Direct URL replaces pairing, Done returns focus to the menu", async () => {
  const r = render(AgentPanel, {
    ...base,
    agents: [agent({ state: online() })],
    pair: async () => pairing(600_000),
  });
  expect(r.queryByTestId("mcp-connection")).toBeNull();
  await fireEvent.click(r.getByTestId("agent-menu"));
  await fireEvent.click(r.getByTestId("agent-pair"));
  await r.findByTestId("pair-code");
  await fireEvent.click(r.getByTestId("agent-menu"));
  await fireEvent.click(r.getByTestId("agent-direct"));
  await waitFor(() => expect(r.queryByTestId("pair-code")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(r.getByTestId("mcp-caller-url")));
  await fireEvent.click(r.getByTestId("direct-close"));
  await waitFor(() => expect(r.queryByTestId("mcp-connection")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(r.getByTestId("agent-menu")));
});

it("offers Pair an agent only for an open agent with a caller URL", async () => {
  for (const [state, want] of [
    [online(), true],
    [null, false],
    [online(null), false],
  ] as const) {
    const r = render(AgentPanel, { ...base, agents: [agent({ state })] });
    await fireEvent.click(r.getByTestId("agent-menu"));
    expect(!!r.queryByTestId("agent-pair")).toBe(want);
    expect(!!r.queryByTestId("agent-direct")).toBe(want);
    r.unmount();
  }
});
it("choosing it mounts the loader and shows the code, countdown and focus", async () => {
  const pair = vi.fn(async () => pairing(9 * 60_000 + 41_000));
  const { findByTestId, getByTestId } = await openPair({
    agents: [agent({ state: online() })],
    pair,
  });
  expect(((await findByTestId("pair-code")) as HTMLInputElement).value).toBe("K7QPM-2XD4R");
  expect(pair).toHaveBeenCalledWith("agent:a");
  expect(getByTestId("pair-countdown").textContent).toBe("Expires in about 10 min");
  await waitFor(() => expect(document.activeElement).toBe(getByTestId("pair-code")));
});
it.each([
  [30_000, "Expires in about 1 min"],
  [-1, "Refreshing…"],
])("countdown at %i ms left", async (ms, text) => {
  const { findByTestId } = await openPair({
    agents: [agent({ state: online() })],
    pair: async () => pairing(ms),
  });
  await findByTestId("pair-code");
  expect((await findByTestId("pair-countdown")).textContent).toBe(text);
});
it("Done removes the view and returns focus to the row menu", async () => {
  const { findByTestId, queryByTestId, getByTestId } = await openPair({
    agents: [agent({ state: online() })],
    pair: async () => pairing(600_000),
  });
  await findByTestId("pair-code");
  await fireEvent.click(getByTestId("pair-close"));
  await waitFor(() => expect(queryByTestId("pair-code")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(getByTestId("agent-menu")));
});
it("a channel change (rotate) or disconnect removes the view for good", async () => {
  const a = agent({ state: online("https://relay.test/c1") });
  const props = { ...base, agents: [a], pair: async () => pairing(600_000) };
  const r = render(AgentPanel, props);
  await fireEvent.click(r.getByTestId("agent-menu"));
  await fireEvent.click(r.getByTestId("agent-pair"));
  await r.findByTestId("pair-code");
  await r.rerender({ ...props, agents: [agent({ state: online("https://relay.test/c2") })] });
  await waitFor(() => expect(r.queryByTestId("pair-code")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(r.getByTestId("agent-menu")));
  await r.rerender({ ...props, agents: [agent({ state: online("https://relay.test/c1") })] });
  expect(r.queryByTestId("pair-code")).toBeNull();
});
it("opening on another agent closes the first", async () => {
  const b = agent({
    conn: { id: "agent:b", relayId: "relay:1" },
    name: "beta",
    state: online("https://relay.test/b"),
  });
  const r = render(AgentPanel, {
    ...base,
    agents: [agent({ state: online() }), b],
    pair: async () => pairing(600_000),
  });
  const menus = r.getAllByTestId("agent-menu");
  await fireEvent.click(menus[0]);
  await fireEvent.click(r.getByTestId("agent-pair"));
  await r.findByTestId("pair-code");
  await fireEvent.click(menus[1]);
  await fireEvent.click(r.getByTestId("agent-pair"));
  await waitFor(() => expect(r.getAllByTestId("pair-code")).toHaveLength(1));
  expect(r.getByTestId("mcp-connection").querySelector('[data-testid="pair-code"]')).toBeTruthy();
});

it("Forget is disabled with a reason while the channel is in use in another tab (#395)", async () => {
  for (const [inUseElsewhere, want] of [
    [true, true],
    [false, false],
  ] as const) {
    const r = render(AgentPanel, { ...base, agents: [agent({ inUseElsewhere })] });
    await fireEvent.click(r.getByTestId("agent-menu"));
    const f = r.getByTestId("mcp-library-forget") as HTMLButtonElement;
    expect(f.disabled).toBe(want);
    expect(f.title).toBe(want ? "In use in another tab" : "");
    r.unmount();
  }
});
