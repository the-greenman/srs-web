// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import ParagraphMargin from "../src/lib/components/ParagraphMargin.svelte";
import type { Annotation } from "../src/lib/annotations.js";

const rel = (i: number): Annotation => ({
  kind: "relation",
  key: `r${i}`,
  label: `Other ${i}`,
  icon: "derived-from",
  direction: "out",
  targetId: `t${i}`,
});
const comments: Annotation = { kind: "comments", key: "comments:p", count: 2, label: "P" };

it("renders each kind with its testid and reports the clicked annotation", async () => {
  const onopen = vi.fn();
  const att: Annotation = { kind: "attachment", key: "a", label: "Src", icon: "note", text: "t" };
  const { getByTestId, container } = render(ParagraphMargin, {
    annotations: [rel(1), att, comments],
    onopen,
  });
  await fireEvent.click(getByTestId("comment-badge"));
  await fireEvent.click(getByTestId("relation-indicator"));
  await fireEvent.click(container.querySelector(".glyph")!);
  expect(onopen.mock.calls.map((c) => c[0].kind)).toEqual(["comments", "relation", "attachment"]);
  // order: comments, attachment, relation regardless of input order
  expect(
    [...container.querySelectorAll(".margin__item > *:first-child")].map(
      (e) => e.className.split(" ")[0]
    )
  ).toEqual(["comment-badge", "glyph-wrap", "margin__relation"]);
});

it("overflows past max into a +N list that holds the rest", async () => {
  const onopen = vi.fn();
  const { getByTestId, queryByTestId } = render(ParagraphMargin, {
    annotations: [comments, rel(1), rel(2), rel(3), rel(4), rel(5)],
    max: 4,
    onopen,
  });
  expect(queryByTestId("margin-overflow")).toBeNull();
  const more = getByTestId("margin-more");
  expect(more.textContent).toBe("+2");
  await fireEvent.click(more);
  const list = getByTestId("margin-overflow");
  expect(list.querySelectorAll("li")).toHaveLength(2);
  await fireEvent.click(list.querySelector("button")!);
  expect(onopen).toHaveBeenCalledWith(expect.objectContaining({ key: "r4" }));
});

it("expanded shows text chips for relations; compact does not", () => {
  const compact = render(ParagraphMargin, { annotations: [rel(1)], onopen: () => {} });
  expect(compact.container.querySelector(".margin__text")).toBeNull();
  const expanded = render(ParagraphMargin, {
    annotations: [rel(1)],
    variant: "expanded",
    onopen: () => {},
  });
  expect(expanded.container.querySelector(".margin__text")?.textContent).toBe(
    "derived-from · Other 1"
  );
});
