// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it } from "vitest";
import McpConnection from "../src/lib/components/McpConnection.svelte";

it("shows the agent as an ActorChip with its last activity in the one row", () => {
  const { getByTestId, queryByTestId } = render(McpConnection, {
    status: "online",
    actor: { kind: "ai", id: "agent:a", name: "alpha" },
    lastActivity: "titled ¶ Opening · 2 min ago",
  });
  expect(getByTestId("actor-name").textContent).toBe("alpha");
  expect(getByTestId("agent-last").textContent).toBe("titled ¶ Opening · 2 min ago");
  expect(queryByTestId("mcp-agent-name")).toBeNull();
});
