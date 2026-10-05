// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it } from "vitest";
import McpConnection from "../src/lib/components/McpConnection.svelte";

it("shows the caller URL and takeover for a refused channel, with the error as a Notice", () => {
  const { getByTestId, getByRole } = render(McpConnection, {
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
