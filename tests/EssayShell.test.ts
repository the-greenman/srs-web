// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
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
  attachments: {},
  related: {},
  sharedIn: {},
};
vi.mock("../src/lib/srs-client.js", () => ({ renderMarkdown: (md: string) => `<p>${md}</p>` }));
const addParagraph = vi.hoisted(() => vi.fn());
const doc = vi.hoisted(() => ({
  listEssays: vi.fn(() => [{ id: "e", title: "Essay" }]),
  loadEssay: vi.fn(),
  setBody: vi.fn(),
  setEssayTitle: vi.fn(),
  copyEssay: vi.fn(),
  makeLocalCopy: vi.fn(),
  newEssay: vi.fn(),
}));
vi.mock("../src/lib/essay/essay-document.js", () => ({
  ...doc,
  addComment: vi.fn(),
  addParagraph,
  essayWriteGuard: vi.fn(),
  moveEntry: vi.fn(),
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
  container.querySelector<HTMLElement>(".block__render")?.focus(); // render state: focus swaps in the editor
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

it("the essay title edits inline: commit writes through setEssayTitle, a new revision re-renders", async () => {
  doc.loadEssay.mockReturnValue(model);
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const props = { repo: {} as never, repoName: "r", onExport: () => {}, documentRevision: 1 };
  const { container, rerender } = render(EssayShell, props);
  await tick();
  await fireEvent.click(container.querySelector<HTMLElement>("h1 .inline-text__view")!);
  const input = container.querySelector<HTMLInputElement>("h1 input")!;
  input.value = "Renamed";
  await fireEvent.keyDown(input, { key: "Enter" });
  expect(doc.setEssayTitle).toHaveBeenCalledWith(props.repo, model, "Renamed");

  doc.loadEssay.mockReturnValue({ ...model, title: "Renamed" });
  await rerender({ ...props, documentRevision: 2 });
  await tick();
  expect(container.querySelector("h1")?.textContent).toBe("Renamed");
});

const commented = {
  ...model,
  comments: { p: [{ id: "c1", text: "hi", author: { kind: "human", id: "a", name: "Ada" } }] },
};

it("threads are hidden by default; the badge opens one; comment mode shows all", async () => {
  doc.loadEssay.mockReturnValue(commented);
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const { container, getByTestId } = render(EssayShell, {
    repo: {} as never,
    repoName: "r",
    onExport: () => {},
    documentRevision: 1,
  });
  await tick();
  const thread = () => container.querySelectorAll("[data-testid=comment-thread]").length;
  const badge = container.querySelector<HTMLElement>("[data-testid=comment-badge]")!;
  expect(badge.textContent).toBe("1");
  expect(thread()).toBe(0);
  await fireEvent.click(badge);
  expect(thread()).toBe(1);
  await fireEvent.click(badge);
  expect(thread()).toBe(0);
  await fireEvent.click(getByTestId("comment-mode"));
  expect(thread()).toBe(1);
});

it("zoom renders only the zoomed paragraph, with its thread, until exited", async () => {
  doc.loadEssay.mockReturnValue({
    ...commented,
    entries: [...model.entries, { instanceId: "q", depth: 0, hasChildren: false } as never],
    paragraphs: { ...model.paragraphs, q: { id: "q", title: "", body: "Other" } },
  });
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const { container, getByTestId } = render(EssayShell, {
    repo: {} as never,
    repoName: "r",
    onExport: () => {},
    documentRevision: 1,
  });
  await tick();
  expect(container.querySelectorAll(".block")).toHaveLength(2);
  await fireEvent.click(container.querySelector<HTMLElement>("[aria-label^='Zoom to']")!);
  expect(container.querySelectorAll(".block")).toHaveLength(1);
  expect(container.querySelectorAll("[data-testid=comment-thread]")).toHaveLength(1);
  await fireEvent.click(getByTestId("zoom-exit"));
  expect(container.querySelectorAll(".block")).toHaveLength(2);
});

it("a relation indicator focuses the other paragraph; the variant toggle is remembered", async () => {
  doc.loadEssay.mockReturnValue({
    ...model,
    entries: [...model.entries, { instanceId: "q", depth: 0, hasChildren: false } as never],
    paragraphs: { ...model.paragraphs, q: { id: "q", title: "", body: "Other" } },
    related: {
      p: [
        { id: "r1", relationType: "derived-from", direction: "out", otherId: "q", label: "Other" },
      ],
    },
  });
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const { container, getByTestId } = render(EssayShell, {
    repo: {} as never,
    repoName: "r",
    onExport: () => {},
    documentRevision: 1,
  });
  await tick();
  await fireEvent.click(getByTestId("relation-indicator"));
  expect((document.activeElement as HTMLElement | null)?.dataset.focusKey).toBe("body:q");
  expect(container.querySelector(".margin--expanded")).toBeNull();
  await fireEvent.click(getByTestId("margin-variant"));
  expect(container.querySelector(".margin--expanded")).not.toBeNull();
});

it("a shared badge names the other documents; clicking it makes a local copy; New/Copy document go through the document ops", async () => {
  doc.loadEssay.mockReturnValue({ ...model, sharedIn: { p: [{ id: "e2", title: "Other essay" }] } });
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const { getByTestId } = render(EssayShell, {
    repo: {} as never,
    repoName: "r",
    onExport: () => {},
    documentRevision: 1,
  });
  await tick();
  const badge = getByTestId("shared-badge");
  expect(badge.getAttribute("aria-label")).toBe("Also in Other essay");
  await fireEvent.click(badge);
  expect(doc.makeLocalCopy).toHaveBeenCalledWith({}, expect.objectContaining({ essayId: "e" }), "p");
  await fireEvent.click(getByTestId("copy-document"));
  expect(doc.copyEssay).toHaveBeenCalledOnce();
  await fireEvent.click(getByTestId("new-document"));
  expect(doc.newEssay).toHaveBeenCalledOnce();
});

it("the Agents panel shows connected/total, and a feed click leaves zoom and focuses that paragraph (srs-web#372)", async () => {
  const two = {
    ...model,
    entries: [
      { instanceId: "p", depth: 0, hasChildren: false },
      { instanceId: "q", depth: 0, hasChildren: false },
    ] as EssayModel["entries"],
    paragraphs: { p: { id: "p", title: "One", body: "a" }, q: { id: "q", title: "Two", body: "b" } },
  };
  doc.loadEssay.mockReturnValue(two);
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const agentStatus = {
    connected: 1,
    total: 2,
    agents: [{ id: "agent:a", name: "alpha", status: "online" }],
    writes: [{ seq: 1, agentId: "agent:a", tool: "record_update", instanceId: "q", changed: [{ target: "instance", id: "q", kind: "updated" }], at: 1 }],
  };
  const { container, getByTestId, getByText } = render(EssayShell, {
    repo: {} as never,
    repoName: "r",
    onExport: () => {},
    agentPanel: createRawSnippet((ctx: () => { lastActivity(id: string): string } | undefined) => ({
      render: () => `<span>controls ${ctx()?.lastActivity("agent:a")}</span>`,
    })),
    agentStatus,
  });
  await tick();
  expect(getByText("1/2")).toBeTruthy();
  // zoom to p; q is hidden by the zoom
  await fireEvent.click(container.querySelector<HTMLElement>('[aria-label="Zoom to One"]') as HTMLElement);
  expect(container.querySelector('[data-focus-key="body:q"]')).toBeNull();
  await fireEvent.click(getByTestId("agent-feed-focus"));
  await tick();
  expect(getByText(/controls updated ¶ Two · /)).toBeTruthy();
  expect(container.querySelector('[data-focus-key="body:q"]')).not.toBeNull();
});

const two = () => ({
  ...model,
  entries: [...model.entries, { instanceId: "q", depth: 0, hasChildren: false } as never],
  paragraphs: { ...model.paragraphs, q: { id: "q", title: "", body: "Other" } },
});
async function mountAt(hash: string) {
  history.replaceState(null, "", "/" + hash);
  doc.loadEssay.mockReturnValue(two());
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const r = render(EssayShell, { repo: {} as never, repoName: "r", onExport: () => {}, documentRevision: 1 });
  await tick();
  return r;
}

it("addresses: z in the hash zooms, p focuses without editing, unknown ids fall back with a notice", async () => {
  let r = await mountAt("#e=e&z=q");
  expect(r.container.querySelectorAll(".block")).toHaveLength(1);
  expect(r.container.querySelector(".block")?.getAttribute("data-block-id")).toBe("q");
  r.unmount();
  r = await mountAt("#e=e&p=q");
  expect(r.container.querySelectorAll(".block")).toHaveLength(2);
  await tick();
  expect(document.activeElement?.getAttribute("data-focus-key")).toBe("handle:q");
  expect(r.container.querySelector(".block__body")).toBeNull(); // still rendered, not editing
  r.unmount();
  r = await mountAt("#e=e&z=gone");
  expect(r.container.querySelectorAll(".block")).toHaveLength(2);
  expect(r.getByTestId("address-notice").textContent).toContain("no longer here");
  await fireEvent.click(r.getByLabelText("Dismiss"));
  expect(r.queryByTestId("address-notice")).toBeNull();
});

it("zooming pushes the hash once and popstate leaves zoom", async () => {
  const r = await mountAt("");
  const before = history.length;
  await fireEvent.click(r.container.querySelector<HTMLElement>("[aria-label^='Zoom to']")!);
  expect(location.hash).toBe("#e=e&z=p");
  expect(history.length).toBe(before + 1);
  history.replaceState(null, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
  await tick();
  expect(r.container.querySelectorAll(".block")).toHaveLength(2);
  expect(history.length).toBe(before + 1); // applying the URL pushed nothing
});

it("the end-of-page Add paragraph button appends via addParagraph (all devices)", async () => {
  doc.loadEssay.mockReturnValue(model);
  const EssayShell = (await import("../src/lib/essay/EssayShell.svelte")).default;
  const { getByTestId } = render(EssayShell, { repo: {} as never, repoName: "r", onExport: () => {}, documentRevision: 1 });
  await tick();
  await fireEvent.click(getByTestId("add-paragraph"));
  expect(addParagraph).toHaveBeenCalledWith({}, expect.objectContaining({ essayId: "e" }));
});
