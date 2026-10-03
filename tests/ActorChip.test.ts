// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it } from "vitest";
import ActorChip from "../src/lib/components/ActorChip.svelte";

it("shows name and kind, falling back to the id; same id, same hue", () => {
  const a = render(ActorChip, { actor: { kind: "ai", id: "agent:1", name: "alpha" } });
  expect(a.getByTestId("actor-name").textContent).toBe("alpha");
  expect(a.getByTestId("actor-kind").textContent).toBe("ai");
  const hue = (a.getByTestId("actor-chip") as HTMLElement).style.getPropertyValue("--actor-hue");
  const b = render(ActorChip, { actor: { kind: "human", id: "agent:1" } });
  expect(b.getAllByTestId("actor-name")[1].textContent).toBe("agent:1");
  expect(
    (b.getAllByTestId("actor-chip")[1] as HTMLElement).style.getPropertyValue("--actor-hue")
  ).toBe(hue);
});
