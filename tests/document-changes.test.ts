// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import ChangesPanel from "../src/lib/components/ChangesPanel.svelte";
import { groupChanges, markSaved, readChanges } from "../src/lib/document-changes.js";
import { DocumentChangesState } from "../src/lib/document-changes.svelte.js";
import type { SrsRepository } from "../src/lib/srs-client.js";
import Harness from "./UnsavedStatusHarness.svelte";

const RAW = {
  unsaved: true,
  instances: [
    { instanceId: "aaaaaaaa-1", change: "created", tier: 2, title: "New para", createdBy: { kind: "ai", id: "agent:x", name: "Agent X" } },
    { instanceId: "bbbbbbbb-2", change: "updated", tier: 0, typeName: "note" },
    { instanceId: "cccccccc-3", change: "deleted", tier: 2, title: "Gone" },
  ],
  relations: [{ relationId: "r1", change: "created", relationType: "evidences", sourceInstanceId: "aaaaaaaa-1", targetInstanceId: "zzzzzzzz-9" }],
  containers: [{ containerId: "k1", change: "updated", title: "Essay" }],
};

const fakeRepo = (raw: unknown, spy?: { saved: string[] }) =>
  ({
    changes: (since: string) => (since === "saved" ? JSON.stringify(raw) : "{}"),
    mark_saved: (at?: string) => spy?.saved.push(at ?? ""),
  }) as unknown as SrsRepository;

describe("groupChanges", () => {
  it("groups added, changed and removed with authors and relation labels", () => {
    const view = groupChanges(RAW, (id) => (id === "aaaaaaaa-1" ? "New para" : undefined));
    expect(view.total).toBe(5);
    expect(view.groups.map((g) => g.key)).toEqual(["added", "changed", "removed"]);
    const added = view.groups[0].items;
    expect(added[0]).toMatchObject({ title: "New para", by: "Agent X", kind: "record" });
    expect(added[1]).toMatchObject({ kind: "relation", title: "New para evidences zzzzzzzz" });
    expect(view.groups[1].items[0]).toMatchObject({ kind: "note", title: "note" });
    expect(view.groups[2].items[0].title).toBe("Gone");
  });
  it("is empty with no changes", () => {
    expect(groupChanges({ unsaved: false })).toEqual({ total: 0, unsaved: false, groups: [] });
  });
  it("tolerates an engine without the read", () => {
    const old = {} as SrsRepository;
    expect(readChanges(old).total).toBe(0);
    expect(() => markSaved(old)).not.toThrow();
  });
});

describe("DocumentChangesState", () => {
  it("lists a write, then empties when saved", () => {
    const spy = { saved: [] as string[] };
    const state = new DocumentChangesState();
    state.refresh(fakeRepo(RAW));
    expect(state.view.total).toBe(5);
    state.saved(fakeRepo({ unsaved: false }, spy));
    expect(spy.saved).toHaveLength(1);
    expect(state.view.total).toBe(0);
  });
  it("a failed read leaves the list empty", () => {
    const state = new DocumentChangesState();
    state.refresh({ changes: () => "not json" } as unknown as SrsRepository);
    expect(state.view.total).toBe(0);
  });
});

describe("ChangesPanel", () => {
  it("shows the empty state", () => {
    render(ChangesPanel, { changes: { total: 0, unsaved: false, groups: [] } });
    expect(screen.getByTestId("changes-empty")).toBeTruthy();
  });
  it("shows groups, kinds and authors, and opens an entry on click", async () => {
    const opened: string[] = [];
    render(ChangesPanel, { changes: groupChanges(RAW), onOpen: (id) => opened.push(id) });
    expect(screen.getByText("Added")).toBeTruthy();
    expect(screen.getByText("by Agent X")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "New para" }));
    expect(opened).toEqual(["aaaaaaaa-1"]);
    expect(screen.queryByRole("button", { name: "Gone" })).toBeNull();
  });
});

describe("UnsavedStatus", () => {
  it("opens the list from the status and shows the count", async () => {
    const state = new DocumentChangesState();
    state.refresh(fakeRepo(RAW));
    render(Harness, { state });
    expect(screen.getByTestId("document-dirty-status").textContent).toContain("Unsaved changes");
    expect(screen.getByTestId("changes-count").textContent).toContain("5");
    await fireEvent.click(screen.getByTestId("changes-toggle"));
    expect(screen.getByTestId("changes-panel")).toBeTruthy();
  });
  it("a host with no way to show a record gets plain titles, not links", async () => {
    const state = new DocumentChangesState();
    state.refresh(fakeRepo(RAW));
    render(Harness, { state });
    await fireEvent.click(screen.getByTestId("changes-toggle"));
    expect(screen.getByText("New para")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New para" })).toBeNull();
  });
  it("links only what the host can show, and a click opens it and closes the list", async () => {
    const state = new DocumentChangesState();
    state.refresh(fakeRepo(RAW));
    const opened: string[] = [];
    render(Harness, { state, onOpen: (id: string) => opened.push(id), canOpen: (id: string) => id === "aaaaaaaa-1" });
    await fireEvent.click(screen.getByTestId("changes-toggle"));
    expect(screen.getAllByRole("button").filter((b) => b.classList.contains("changes__link"))).toHaveLength(1);
    await fireEvent.click(screen.getByRole("button", { name: "New para" }));
    expect(opened).toEqual(["aaaaaaaa-1"]);
    expect(screen.queryByTestId("changes-panel")).toBeNull();
  });
});
