// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import type { Comment } from "../src/lib/comments";
import CommentThread from "../src/lib/components/CommentThread.svelte";

vi.mock("../src/lib/srs-client.js", () => ({ renderMarkdown: (s: string) => `<p>${s}</p>` }));

const thread: Comment[] = [
  { id: "q", text: "Which year?", createdAt: "1", kind: "question" },
  {
    id: "t",
    text: "Cite the budget sheet.",
    createdAt: "2",
    kind: "task",
    task: { state: "open" },
  },
  {
    id: "x",
    text: "Done already.",
    createdAt: "3",
    kind: "task",
    task: { state: "rejected", reason: "not needed" },
  },
  { id: "p", text: "Plain.", createdAt: "4" },
];

it("labels each comment's kind and filters the thread by kind", async () => {
  const { getAllByTestId, getByTestId } = render(CommentThread, {
    comments: thread,
    onadd: () => {},
  });
  expect(getAllByTestId("comment-kind").map((e) => e.textContent)).toEqual([
    "question",
    "task",
    "task",
  ]);
  await fireEvent.click(getByTestId("comment-filter-task"));
  expect(getAllByTestId("comment")).toHaveLength(2);
  await fireEvent.click(getByTestId("comment-filter-task"));
  expect(getAllByTestId("comment")).toHaveLength(4);
});

it("a task offers Done and Reject with a reason; a settled one shows its state and Reopen", async () => {
  const onrespond = vi.fn();
  const { getByTestId, getByLabelText, getByText } = render(CommentThread, {
    comments: thread,
    onadd: () => {},
    onrespond,
  });
  expect(getByTestId("task-state").textContent).toBe("rejected");
  expect(getByText("not needed")).toBeTruthy();
  await fireEvent.click(getByTestId("task-reopen"));
  expect(onrespond).toHaveBeenLastCalledWith("x", "withdrawn");
  await fireEvent.click(getByTestId("task-done"));
  expect(onrespond).toHaveBeenLastCalledWith("t", "done");
  await fireEvent.click(getByTestId("task-reject"));
  await fireEvent.input(getByLabelText("Reason (optional)"), { target: { value: "out of scope" } });
  await fireEvent.click(getByTestId("task-reject-confirm"));
  expect(onrespond).toHaveBeenLastCalledWith("t", "rejected", "out of scope");
});

it("without onrespond there are no task controls; with kinds the reply carries the picked kind", async () => {
  const onadd = vi.fn();
  const { queryByTestId, getByTestId, getByLabelText } = render(CommentThread, {
    comments: thread,
    kinds: true,
    onadd,
  });
  expect(queryByTestId("task-done")).toBeNull();
  await fireEvent.change(getByTestId("comment-kind-pick"), { target: { value: "objection" } });
  await fireEvent.input(getByLabelText("Reply"), { target: { value: "Too strong." } });
  await fireEvent.keyDown(getByLabelText("Reply"), { key: "Enter", ctrlKey: true });
  expect(onadd).toHaveBeenCalledWith("Too strong.", undefined, "objection");
});
