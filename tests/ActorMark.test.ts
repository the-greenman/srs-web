// @vitest-environment happy-dom
import { render, within } from "@testing-library/svelte";
import { expect, it } from "vitest";
import ActorMark from "../src/lib/components/ActorMark.svelte";

it("names the actor and its kind; shape class tells agent from human", () => {
  const a = render(ActorMark, { actor: { kind: "ai", id: "agent:1", name: "Scribe" } });
  const mark = within(a.container).getByTestId("actor-mark");
  expect(mark.getAttribute("aria-label")).toBe("Scribe (agent)");
  expect(mark.classList.contains("actor-mark--ai")).toBe(true);
  expect(mark.textContent).toBe("S");
  const h = render(ActorMark, { actor: { kind: "human", id: "h:1", name: "Ada" } });
  expect(within(h.container).getByTestId("actor-mark").classList.contains("actor-mark--ai")).toBe(false);
});

it("same id, same hue; no actor is the unattributed neutral state", () => {
  const hue = (id: string) =>
    (
      render(ActorMark, { actor: { kind: "ai", id } })
        .getAllByTestId("actor-mark")
        .at(-1) as HTMLElement
    ).style.getPropertyValue("--actor-hue");
  expect(hue("agent:x")).toBe(hue("agent:x"));
  expect(hue("agent:x")).not.toBe("");
  const u = render(ActorMark, {});
  const mark = within(u.container).getByTestId("actor-mark");
  expect(mark.getAttribute("aria-label")).toBe("Unattributed");
  expect(mark.classList.contains("hue-pill--neutral")).toBe(true);
  expect(mark.style.getPropertyValue("--actor-hue")).toBe("");
});
