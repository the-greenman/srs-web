// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it } from "vitest";
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
  const { getByTestId, queryByTestId, container } = render(AgentPanel, { ...base, relays: [], agents: [agent({ conn: { id: "agent:a" } })] });
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
    agents: [agent({ state: { status: "online", callerUrl: "https://relay.test/c", error: null } })],
  });
  expect(getByTestId("mcp-status").textContent).toBe("Connected");
  expect(getByTestId("mcp-disconnect")).toBeTruthy();
  expect(getByTestId("agent-last").textContent).toBe("titled ¶ Opening · 2 min ago");
  expect(queryByTestId("mcp-library-item")).toBeNull();
});

it("in use elsewhere disables Connect and shows the marker", () => {
  const { getByTestId } = render(AgentPanel, { ...base, agents: [agent({ inUseElsewhere: true })] });
  expect((getByTestId("mcp-library-connect") as HTMLButtonElement).disabled).toBe(true);
  expect(getByTestId("mcp-in-use")).toBeTruthy();
});
