// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it } from "vitest";
import ActorStack from "../src/lib/components/ActorStack.svelte";

const ai = (n: number) => ({ kind: "ai" as const, id: `agent:${n}`, name: `A${n}` });

it("summarises kinds and shows at most max marks", () => {
  const { getByTestId, getAllByTestId } = render(ActorStack, {
    actors: [ai(1), ai(2), ai(3), { kind: "human", id: "h", name: "Ada" }],
    max: 3,
  });
  expect(getByTestId("actor-stack").getAttribute("aria-label")).toBe("3 agents and 1 person");
  expect(getAllByTestId("actor-mark")).toHaveLength(3);
});

it("+N opens the list of the rest", async () => {
  const { getByLabelText, getAllByTestId, queryByText } = render(ActorStack, {
    actors: [ai(1), ai(2), ai(3), ai(4), undefined],
    max: 3,
  });
  await fireEvent.click(getByLabelText("2 more"));
  expect(getAllByTestId("actor-chip")).toHaveLength(2);
  expect(queryByText("Unattributed")).toBeTruthy();
});
