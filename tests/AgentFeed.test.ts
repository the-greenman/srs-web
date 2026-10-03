// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import AgentFeed from "../src/lib/components/AgentFeed.svelte";

const status = {
  connected: 1,
  total: 2,
  agents: [
    { id: "agent:a", name: "alpha", status: "online" },
    { id: "agent:b", name: "beta", status: "idle" },
  ],
  writes: [
    {
      seq: 1,
      agentId: "agent:a",
      tool: "record_update",
      instanceId: "p1",
      changed: [{ target: "instance", id: "p", kind: "updated" }],
      at: Date.now(),
    },
  ],
};

it("a feed entry for a known paragraph is clickable", async () => {
  const onselect = vi.fn();
  const { getByTestId } = render(AgentFeed, {
    status,
    paragraphLabel: (id: string) => (id === "p1" ? "Opening" : undefined),
    onselect,
  });
  expect(getByTestId("agent-feed-entry").textContent).toContain("updated ¶ Opening · just now");
  await fireEvent.click(getByTestId("agent-feed-focus"));
  expect(onselect).toHaveBeenCalledWith("p1");
});

it("an entry whose paragraph is unknown is not clickable", () => {
  const { queryByTestId } = render(AgentFeed, {
    status,
    paragraphLabel: () => undefined,
    onselect: () => {},
  });
  expect(queryByTestId("agent-feed-focus")).toBeNull();
});
