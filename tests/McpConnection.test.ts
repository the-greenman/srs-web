// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

const copyText = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../src/lib/clipboard", () => ({ copyText }));
vi.mock("$lib/clipboard.js", () => ({ copyText }));
import McpConnection from "../src/lib/components/McpConnection.svelte";

beforeEach(() => copyText.mockClear());
const data = { code: "K7QPM-2XD4R", expiresAt: 0, connectorUrl: "https://relay.test/v1/channels/c1/call" };
const view = (o = {}) => ({ data, error: null, minutes: 10, ...o });

it("keeps the direct URL, takeover for a refused channel, with the error as a Notice", async () => {
  const { getByTestId, getByRole, queryByTestId } = render(McpConnection, {
    status: "rejected",
    callerUrl: "https://relay.test/c",
    error: "relay bootstrap failed: 500",
    onTakeover: () => {},
  });
  expect((getByTestId("mcp-caller-url") as HTMLInputElement).value).toBe("https://relay.test/c");
  expect(getByRole("alert").textContent).toContain("relay bootstrap failed");
  expect(getByTestId("mcp-takeover")).toBeTruthy();
});
it("renders nothing for an online agent with no caller URL", () => {
  const { queryByTestId } = render(McpConnection, { status: "online" });
  expect(queryByTestId("mcp-connection")).toBeNull();
});
it("shows the direct URL, its warning and Done only when given a callerUrl", async () => {
  const onClosePair = vi.fn();
  const { getByTestId, getByText } = render(McpConnection, { status: "online", callerUrl: "https://relay.test/c/X", onClosePair });
  getByText(/Anyone with this URL can read and write this document/);
  await fireEvent.click(getByTestId("mcp-caller-url-copy"));
  expect(copyText).toHaveBeenCalledWith("https://relay.test/c/X");
  await fireEvent.click(getByTestId("direct-close"));
  expect(onClosePair).toHaveBeenCalledOnce();
});
it("shows the pairing view: URL, code, copy buttons, plain-text countdown, security line", async () => {
  const { getByLabelText, getByRole, getByTestId } = render(McpConnection, { status: "online", pairingView: view() });
  expect((getByLabelText("Connector URL") as HTMLInputElement).value).toBe(data.connectorUrl);
  expect((getByLabelText("Pairing code") as HTMLInputElement).value).toBe("K7QPM-2XD4R");
  await fireEvent.click(getByRole("button", { name: "Copy connector URL" }));
  expect(copyText).toHaveBeenLastCalledWith(data.connectorUrl);
  await fireEvent.click(getByRole("button", { name: "Copy pairing code" }));
  expect(copyText).toHaveBeenLastCalledWith("K7QPM-2XD4R");
  const cd = getByTestId("pair-countdown");
  expect(cd.textContent).toBe("Expires in about 10 min");
  expect(cd.hasAttribute("aria-live")).toBe(false);
  expect(cd.hasAttribute("role")).toBe(false);
  expect(getByTestId("pair-security").textContent).toContain("Anyone with this code");
});
it("says Refreshing… at zero minutes", () => {
  const { getByTestId } = render(McpConnection, { status: "online", pairingView: view({ minutes: 0 }) });
  expect(getByTestId("pair-countdown").textContent).toBe("Refreshing…");
});
it("shows an error beside the kept code, with Retry; Done closes", async () => {
  const onRetryPair = vi.fn();
  const onClosePair = vi.fn();
  const { getByRole, getByTestId } = render(McpConnection, { status: "online", pairingView: view({ error: "pairing failed: 500" }), onRetryPair, onClosePair });
  expect(getByRole("alert").textContent).toContain("pairing failed: 500");
  expect((getByTestId("pair-code") as HTMLInputElement).value).toBe("K7QPM-2XD4R");
  await fireEvent.click(getByTestId("pair-retry"));
  await fireEvent.click(getByTestId("pair-close"));
  expect(onRetryPair).toHaveBeenCalledOnce();
  expect(onClosePair).toHaveBeenCalledOnce();
});
it("shows a loading line before any data", () => {
  const { getByTestId } = render(McpConnection, { status: "online", pairingView: view({ data: null, minutes: 0 }) });
  expect(getByTestId("pair-loading")).toBeTruthy();
});
it("is presentation only: no timers or notify", () => {
  const src = readFileSync("src/lib/components/McpConnection.svelte", "utf8");
  expect(src).not.toMatch(/setInterval|setTimeout|notify/);
});
