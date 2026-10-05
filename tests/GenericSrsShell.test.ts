// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GenericSrsShell from "../src/lib/generic/GenericSrsShell.svelte";
import { resetNotices } from "../src/lib/notices.svelte.js";

const mocks = vi.hoisted(() => ({
  // "1fcad6a2-…" is DECISION_TYPE_ID from governance/type-registry.ts, inlined (not
  // imported) because vi.hoisted() runs before this module's own imports resolve.
  // Governance availability is keyed on this type UUID, not package namespace.
  find: vi.fn(() => ({
    hits: [
      {
        instanceId: "record-1",
        label: "First",
        typeNamespace: "com.example",
        typeName: "note",
        matchedFields: [],
      },
      {
        instanceId: "record-2",
        label: "Second",
        typeNamespace: "com.example",
        typeName: "note",
        matchedFields: [],
      },
    ],
    total: 2,
    diagnostics: [],
  })),
  getRecord: vi.fn((id: string) => ({
    instanceId: id,
    displayLabel: id === "record-1" ? "First" : "Second",
    typeNamespace: "com.example",
    typeName: "note",
    fieldValues: {},
    typeId: "type-1",
    typeVersion: 1,
  })),
  listContainers: vi.fn(() => [{ containerId: "container-1", title: "Foundation" }]),
  listDocumentViews: vi.fn(() => [
    { id: "composition-1", namespace: "com.example", name: "reader", version: 1, description: "" },
  ]),
  listPackages: vi.fn(() => [
    {
      id: "gov",
      namespace: "com.mudemocracy.governance",
      name: "governance",
      version: "1",
      fieldCount: 0,
      typeCount: 0,
    },
  ]),
  documentViewsForContainer: vi.fn(() => []),
  listRelations: vi.fn(() => []),
  listTypes: vi.fn(() => [
    {
      id: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
      namespace: "com.mudemocracy.governance",
      name: "decision",
      version: 1,
    },
  ]),
  renderDocumentView: vi.fn(() => ({
    rendered: "<h1>Rendered document</h1>",
    diagnostics: [],
    projection: null,
  })),
  resolveContainerView: vi.fn(() => ({
    containerId: "container-1",
    members: [{ instanceId: "record-1", displayLabel: "First", record: {} }],
    columns: [],
    excludeLifecycleStates: [],
    diagnostics: [],
  })),
  repositoryNavigation: vi.fn(() => ({
    rootContainerId: "root",
    identity: {},
    sections: [],
    diagnostics: [],
  })),
  typeSchema: vi.fn(() => ({
    schema: { type: "object", properties: { title: { type: "string", title: "Title" } } },
    diagnostics: [],
  })),
}));

vi.mock("../src/lib/srs-client.js", () => mocks);

// The frame turns the inspector into a closed drawer at <= 1100px (happy-dom is 1024 wide): these tests
// exercise the desktop frame, so stub a wide viewport (#424).
const store = new Map<string, string>();
beforeEach(() => {
  resetNotices();
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: Number(/max-width:\s*(\d+)px/.exec(q)?.[1]) >= 1440,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe("GenericSrsShell", () => {
  it("supplies the container whose root type matches the composition (srs-web#384)", async () => {
    mocks.listDocumentViews.mockReturnValueOnce([
      {
        id: "composition-1",
        namespace: "com.example",
        name: "reader",
        version: 1,
        description: "",
        rootTypeRefs: [{ typeId: "root-type", typeVersion: 1 }],
      },
    ]);
    mocks.resolveContainerView.mockReturnValueOnce({
      containerId: "container-1",
      root: { instanceId: "r", record: { typeId: "root-type" } },
      members: [],
      columns: [],
      excludeLifecycleStates: [],
      diagnostics: [],
    });
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onOpenEditor: vi.fn(),
      },
    });
    await screen.findByRole("button", { name: /reader/ });
    expect(mocks.renderDocumentView).toHaveBeenCalledWith(
      {},
      "composition-1",
      "html",
      "container-1"
    );
  });

  it("opens the first composition as the repository's document entry point", async () => {
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onOpenEditor: vi.fn(),
        packageEditors: [
          { editor: { id: "governance", label: "Governance", description: "d" }, unmet: null },
        ] as never,
      },
    });

    expect(await screen.findByRole("button", { name: /reader/ })).toBeTruthy();
    expect(mocks.renderDocumentView).toHaveBeenCalledWith({}, "composition-1", "html", null);
    expect(screen.getAllByRole("button", { name: "Governance" })).toHaveLength(1); // one picker, in the nav (a drawer on a phone)
  });

  it("renders an unmet editor disabled with the reason (srs-web#399)", async () => {
    const onOpenEditor = vi.fn();
    const governance = { id: "g", label: "Governance", description: "d" };
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "r",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onOpenEditor,
        packageEditors: [
          { editor: governance, unmet: { reason: "Needs essay package 1.3.0 (you have 1.0.0)" } },
        ] as never,
      },
    });
    const [btn] = await screen.findAllByRole("button", { name: "Governance" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(
      (await screen.findAllByText("Needs essay package 1.3.0 (you have 1.0.0)")).length
    ).toBeGreaterThan(0);
  });

  it("renders a relation map scoped by the engine to the active container", async () => {
    mocks.listRelations.mockReturnValueOnce([
      {
        relationId: "relation-1",
        relationType: "relates",
        sourceInstanceId: "record-1",
        targetInstanceId: "record-2",
      },
    ]);
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
      },
    });

    await fireEvent.click(await screen.findByRole("button", { name: "Map" }));

    expect(screen.getByTestId("scoped-graph")).toBeTruthy();
    expect(
      screen.getByText("Relations resolved by the engine for the active container.")
    ).toBeTruthy();
    expect(screen.getByText("relates")).toBeTruthy();
  });

  it("cancels an edit before selecting a different record", async () => {
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
      },
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
    mocks.resolveContainerView.mockReturnValueOnce({
      containerId: "container-1",
      members: [{ instanceId: "record-1", displayLabel: "A declared title", record: {} }],
      columns: [],
      excludeLifecycleStates: [],
      diagnostics: [],
    });
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
      },
    });

    await fireEvent.click(await screen.findByRole("button", { name: "Toggle Foundation" }));

    expect(screen.getByRole("button", { name: "A declared title" })).toBeTruthy();
  });
});

describe("GenericSrsShell read-only note", () => {
  it("shows the read-only reason, not Save, when onSave is undefined", async () => {
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onSave: undefined,
        readOnlyReason: "This folder was opened read-only. Use Export to save your changes.",
      },
    });

    expect((await screen.findByTestId("read-only-note")).textContent).toMatch(/read-only/);
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  });

  it("shows Save, not the reason, when onSave is set", async () => {
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onSave: vi.fn(),
        readOnlyReason: "should not render",
      },
    });

    expect(await screen.findByTestId("save-document")).toBeTruthy();
    expect(screen.queryByTestId("read-only-note")).toBeNull();
  });

  it("Save is the Toolbar primary: disabled when clean, enabled when dirty; Export and Open another live in the bar", async () => {
    const onExport = vi.fn();
    const onOpenAnother = vi.fn();
    const props = { repo: {} as never, repoName: "r", onExport, onOpenAnother, onSave: vi.fn() };
    const { rerender } = render(GenericSrsShell, { props });
    expect((await screen.findByTestId("save-document")).hasAttribute("disabled")).toBe(true);
    await rerender({ ...props, documentDirty: true });
    expect(screen.getByTestId("save-document").hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("document-dirty-status").textContent).toMatch(/Unsaved/);
    await fireEvent.click(screen.getByTestId("toolbar-export"));
    await fireEvent.click(screen.getByTestId("toolbar-other"));
    expect([onExport.mock.calls.length, onOpenAnother.mock.calls.length]).toEqual([1, 1]);
  });

  it("View > Wide is present (the Wide capability) and toggles the one data-margin carrier", async () => {
    const { container } = render(GenericSrsShell, {
      props: { repo: {} as never, repoName: "r", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });
    await fireEvent.click(await screen.findByTestId("toolbar-menu-view"));
    expect(screen.getByTestId("margin-variant").getAttribute("aria-checked")).toBe("false");
    await fireEvent.click(screen.getByTestId("margin-variant"));
    expect(container.querySelector(".app")!.getAttribute("data-margin")).toBe("expanded");
    expect(store.get("srs-web.margin")).toBe("expanded");
  });
});

describe("GenericSrsShell document revision refresh", () => {
  it("keeps the selected composition when a mutation bumps documentRevision", async () => {
    mocks.listDocumentViews.mockReturnValue([
      { id: "composition-1", namespace: "com.example", name: "first", version: 1, description: "" },
      {
        id: "composition-2",
        namespace: "com.example",
        name: "second",
        version: 1,
        description: "",
      },
    ]);
    const props = {
      repo: {} as never,
      repoName: "Example",
      onExport: vi.fn(),
      onOpenAnother: vi.fn(),
    };
    const { rerender } = render(GenericSrsShell, { props: { ...props, documentRevision: 0 } });

    await fireEvent.click(await screen.findByRole("button", { name: /second/ }));
    await rerender({ ...props, documentRevision: 1 });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("second");
    expect(mocks.renderDocumentView).toHaveBeenLastCalledWith({}, "composition-2", "html", null);
    mocks.listDocumentViews.mockReset();
  });
});

describe("GenericSrsShell at drawer width", () => {
  it("choosing a record opens the inspector drawer so the record is shown", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: Number(/max-width:\s*(\d+)px/.exec(q)?.[1]) >= 1000,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(GenericSrsShell, {
      props: {
        repo: {} as never,
        repoName: "Example repository",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
      },
    });
    const drawer = (await screen.findByTestId("shell-drawer-inspector")) as HTMLDialogElement;
    expect(drawer.open).toBe(false);
    await fireEvent.click(await screen.findByRole("button", { name: "Records" }));
    await fireEvent.click(screen.getByRole("button", { name: /First com\.example\/note/ }));
    await waitFor(() => expect(drawer.open).toBe(true));
    expect(drawer.textContent).toContain("Edit fields");
  });
});

describe("GenericSrsShell diagnostics notices (#441)", () => {
  const R23 = "[R23] computed heading level 7 exceeds 6 for format 'html'; clamped to 6";
  const views = ["composition-1", "composition-2"].map((id, i) => ({
    id,
    namespace: "com.example",
    name: `reader${i + 1}`,
    version: 1,
    description: "",
  }));
  const mount = () =>
    render(GenericSrsShell, {
      props: { repo: {} as never, repoName: "Example repository", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });
  const renderWith = (diagnostics: string[]) =>
    mocks.renderDocumentView.mockReturnValue({ rendered: "<h1>x</h1>", diagnostics, projection: null });
  beforeEach(() => {
    mocks.listDocumentViews.mockReturnValue(views);
  });
  const restore = () => {
    renderWith([]);
  };

  it("groups three identical warnings into one collapsed line with a count", async () => {
    renderWith([R23, R23, R23]);
    const { container } = mount();
    await screen.findByText(/3 warnings/);
    expect(container.querySelectorAll('[data-part="group"]')).toHaveLength(1);
    expect(container.querySelector('[data-part="count"]')?.textContent).toBe("x3");
    expect((container.querySelector(".diag-list") as HTMLElement).hidden).toBe(true);
    await fireEvent.click(screen.getByRole("button", { name: "Show diagnostics" }));
    expect((container.querySelector(".diag-list") as HTMLElement).hidden).toBe(false);
    expect(container.querySelector(".diag__msg")?.textContent).toContain(R23);
    restore();
  });

  it("dismiss hides it for that composition only; another composition still shows its own", async () => {
    renderWith([R23, R23]);
    mount();
    await fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/2 warnings/)).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /reader2/ }));
    expect(await screen.findByText(/2 warnings/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /reader1/ }));
    await waitFor(() => expect(screen.queryByText(/2 warnings/)).toBeNull());
    restore();
  });

  it("a thrown render shows an error Notice, not a diagnostics list", async () => {
    mocks.renderDocumentView.mockImplementation(() => {
      throw new Error("engine exploded");
    });
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("engine exploded"));
    expect(container.querySelector(".diag-notice")).toBeNull();
    mocks.renderDocumentView.mockReset();
    restore();
  });
});
