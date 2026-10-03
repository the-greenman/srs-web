// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import CommentBadge from "../src/lib/components/CommentBadge.svelte";

it("shows the count, labels it, and reports expanded", async () => {
  const onclick = vi.fn();
  const { getByTestId } = render(CommentBadge, { count: 3, label: "Opening", open: true, onclick });
  const b = getByTestId("comment-badge");
  expect(b.textContent).toBe("3");
  expect(b.getAttribute("aria-label")).toBe("3 comments on Opening");
  expect(b.getAttribute("aria-expanded")).toBe("true");
  await fireEvent.click(b);
  expect(onclick).toHaveBeenCalledOnce();
});

it("at zero it is a + that offers to add a comment", () => {
  const { getByTestId } = render(CommentBadge, { count: 0, label: "Opening", onclick: () => {} });
  const b = getByTestId("comment-badge");
  expect(b.textContent).toBe("+");
  expect(b.getAttribute("aria-label")).toBe("Add a comment on Opening");
  expect(b.getAttribute("aria-expanded")).toBe("false");
});
