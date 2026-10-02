// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { expect, it, vi } from "vitest";
import type { EssayModel } from "../src/lib/essay/essay-document.js";

const model: EssayModel = {
  essayId: "e",
  title: "Essay",
  containerId: "c",
  entries: [{ instanceId: "p", depth: 0, hasChildren: false } as EssayModel["entries"][number]],
  paragraphs: { p: { id: "p", title: "", body: "Hello" } },
  stateId: null,
  hidden: [],
  draftContainerId: null,
  draftEntries: [],
  comments: {},
};
const doc = vi.hoisted(() => ({
  listEssays: vi.fn(() => [{ id: "e", title: "Essay" }]),
  loadEssay: vi.fn(),
  setBody: vi.fn(),
}));
vi.mock("../src/lib/essay/essay-document.js", () => ({
  ...doc,
  addComment: vi.fn(),
  addParagraph: vi.fn(),
  essayWriteGuard: vi.fn(),
  moveEntry: vi.fn(),
  newEssay: vi.fn(),
  shiftEntry: vi.fn(),
  setHidden: vi.fn(),
  setTitle: vi.fn(),
  transfer: vi.fn(),
}));

it("a typing commit reloads the essay once, via documentRevision (essay typing freeze)", async () => {
  doc.loadEssay.mockReturnValue(model);
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const props = { repo: {} as never, repoName: "r", onExport: () => {}, documentRevision: 1 };
  const { container, rerender } = render(EssayShell, props);
  await tick();
  const body = container.querySelector<HTMLElement>(".block__body");
  if (!body) throw new Error("no paragraph body rendered");
  doc.loadEssay.mockClear();

  body.textContent = "Hello there";
  await fireEvent.blur(body); // the commit; App's write observer then bumps the revision
  expect(doc.setBody).toHaveBeenCalledOnce();
  await rerender({ ...props, documentRevision: 2 });
  await tick();

  // Every reload reads the whole essay from the engine; a large repository makes each one
  // costly, so a commit must not reload twice.
  expect(doc.loadEssay).toHaveBeenCalledOnce();
});
