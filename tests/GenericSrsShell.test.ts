// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import GenericSrsShell from "../src/lib/generic/GenericSrsShell.svelte";

const mocks = vi.hoisted(() => ({
  // "1fcad6a2-…" is DECISION_TYPE_ID from governance/type-registry.ts, inlined (not
  // imported) because vi.hoisted() runs before this module's own imports resolve.
  // Governance availability is keyed on this type UUID, not package namespace.
  find: vi.fn(() => ({ hits: [
    { instanceId: "record-1", label: "First", typeNamespace: "com.example", typeName: "note", matchedFields: [] },
    { instanceId: "record-2", label: "Second", typeNamespace: "com.example", typeName: "note", matchedFields: [] },
  ], total: 2, diagnostics: [] })),
  getRecord: vi.fn((id: string) => ({ instanceId: id, displayLabel: id === "record-1" ? "First" : "Second", typeNamespace: "com.example", typeName: "note", fieldValues: {}, typeId: "type-1", typeVersion: 1 })),
  listContainers: vi.fn(() => [{ containerId: "container-1", title: "Foundation" }]),
  listDocumentViews: vi.fn(() => [{ id: "composition-1", namespace: "com.example", name: "reader", version: 1, description: "" }]),
  listPackages: vi.fn(() => [{ id: "gov", namespace: "com.mudemocracy.governance", name: "governance", version: "1", fieldCount: 0, typeCount: 0 }]),
  listRelations: vi.fn(() => []),
  listTypes: vi.fn(() => [
    { id: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3", namespace: "com.mudemocracy.governance", name: "decision", version: 1 },
  ]),
  renderDocumentView: vi.fn(() => ({ rendered: "<h1>Rendered document</h1>", diagnostics: [], projection: null })),
  resolveContainerView: vi.fn(() => ({ containerId: "container-1", members: [{ instanceId: "record-1", displayLabel: "First", record: {} }], columns: [], excludeLifecycleStates: [], diagnostics: [] })),
  repositoryNavigation: vi.fn(() => ({ rootContainerId: "root", identity: {}, sections: [], diagnostics: [] })),
  typeSchema: vi.fn(() => ({ schema: { type: "object", properties: { title: { type: "string", title: "Title" } } }, diagnostics: [] })),
}));

vi.mock("../src/lib/srs-client.js", () => mocks);

describe("GenericSrsShell", () => {
  it("opens the first composition as the repository's document entry point", async () => {
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onOpenGovernance: vi.fn(),
      },
    });

    expect(await screen.findByRole("button", { name: /reader/ })).toBeTruthy();
    expect(mocks.renderDocumentView).toHaveBeenCalledWith({}, "composition-1", "html");
    expect(screen.getByRole("button", { name: "Governance" })).toBeTruthy();
  });

  it("renders a relation map scoped by the engine to the active container", async () => {
    mocks.listRelations.mockReturnValueOnce([
      { relationId: "relation-1", relationType: "relates", sourceInstanceId: "record-1", targetInstanceId: "record-2" },
    ]);
    render(GenericSrsShell, {
      props: { repo: {} as never, repoName: "Example repository", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });

    await fireEvent.click(await screen.findByRole("button", { name: "Map" }));

    expect(screen.getByTestId("scoped-graph")).toBeTruthy();
    expect(screen.getByText("Relations resolved by the engine for the active container.")).toBeTruthy();
    expect(screen.getByText("relates")).toBeTruthy();
  });

  it("cancels an edit before selecting a different record", async () => {
    render(GenericSrsShell, {
      props: { repo: {} as never, repoName: "Example repository", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });

    await fireEvent.click(await screen.findByRole("button", { name: "Records" }));
    await fireEvent.click(screen.getByRole("button", { name: /First com\.example\/note/ }));
    await fireEvent.click(screen.getByRole("button", { name: "Edit fields" }));
    expect(screen.getByTestId("section-form")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: /Second com\.example\/note/ }));
    expect(screen.queryByTestId("section-form")).toBeNull();
    expect(screen.getByRole("heading", { name: "Second" })).toBeTruthy();
  });

  it("uses the engine-resolved display label for expanded container members", async () => {
    mocks.resolveContainerView.mockReturnValueOnce({ containerId: "container-1", members: [{ instanceId: "record-1", displayLabel: "A declared title", record: {} }], columns: [], excludeLifecycleStates: [], diagnostics: [] });
    render(GenericSrsShell, {
      props: { repo: {} as never, repoName: "Example repository", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });

    await fireEvent.click(await screen.findByRole("button", { name: "Toggle Foundation" }));

    expect(screen.getByRole("button", { name: "A declared title" })).toBeTruthy();
  });
});
