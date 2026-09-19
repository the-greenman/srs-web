// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { vi, describe, it, expect } from "vitest";
import GovernanceShell from "../src/lib/governance/GovernanceShell.svelte";
import type { SrsRepository } from "../src/lib/srs-client.js";

function mockRepo(overrides: Partial<SrsRepository>): SrsRepository {
  const base: SrsRepository = {
    validate: () => { throw new Error("not mocked"); },
    list_records: () => { throw new Error("not mocked"); },
    get_record: () => { throw new Error("not mocked"); },
    list_notes: () => { throw new Error("not mocked"); },
    create_record: () => { throw new Error("not mocked"); },
    update_record: () => { throw new Error("not mocked"); },
    delete_record: () => { throw new Error("not mocked"); },
    export_srsj: () => { throw new Error("not mocked"); },
    export_archive: () => { throw new Error("not mocked"); },
    list_relations: () => { throw new Error("not mocked"); },
    create_relation: () => { throw new Error("not mocked"); },
    delete_relation: () => { throw new Error("not mocked"); },
    set_lifecycle_state: () => { throw new Error("not mocked"); },
    transition_record: () => { throw new Error("not mocked"); },
    blueprint_schema: () => { throw new Error("not mocked"); },
    render_document_view: () => { throw new Error("not mocked"); },
    list_containers: () => { throw new Error("not mocked"); },
    get_container: () => { throw new Error("not mocked"); },
    add_container_member: () => { throw new Error("not mocked"); },
    remove_container_member: () => { throw new Error("not mocked"); },
    containers_for_instance: () => { throw new Error("not mocked"); },
    type_schema: () => { throw new Error("not mocked"); },
    list_types: () => { throw new Error("not mocked"); },
    list_blueprints: () => { throw new Error("not mocked"); },
    document_views_for_container: () => { throw new Error("not mocked"); },
    list_document_views: () => { throw new Error("not mocked"); },
    find: () => { throw new Error("not mocked"); },
    list_terms: () => { throw new Error("not mocked"); },
    create_record_successor: () => { throw new Error("not mocked"); },
    resolve_container_view: () => { throw new Error("not mocked"); },
    repository_navigation: () => { throw new Error("not mocked"); },
    scaffold_new_repository: () => { throw new Error("not mocked"); },
    get_allowed_lifecycle_transitions: () => { throw new Error("not mocked"); },
    available_migrations: () => [],
    apply_migration: () => { throw new Error("not mocked"); },
    order_by_precedes: () => { throw new Error("not mocked"); },
    get_field_value_by_name: () => { throw new Error("not mocked"); },
    list_attachments: () => { throw new Error("not mocked"); },
    add_attachment: () => { throw new Error("not mocked"); },
    link_attachment: () => { throw new Error("not mocked"); },
    get_attachment_bytes: () => { throw new Error("not mocked"); },
    get_record_attachments: () => { throw new Error("not mocked"); },
  };
  return { ...base, ...overrides };
}

function makeBaseRepo(overrides: Partial<SrsRepository> = {}): SrsRepository {
  return mockRepo({
    validate: () => ({ diagnostics: [], summary: { checked: 0, errors: 0, warnings: 0 } }),
    repository_navigation: () => ({
      rootContainerId: "c-root",
      identity: {
        instanceId: "identity-1",
        typeId: "com.test/identity",
        typeVersion: 1,
        typeNamespace: "com.test",
        typeName: "identity",
        displayLabel: "Test Repo",
      },
      sections: [
        {
          instanceId: "section-1",
          typeId: "com.test/article",
          typeVersion: 1,
          typeNamespace: "com.test",
          typeName: "Article",
          displayLabel: "Articles",
          sectionContainerId: "c-articles",
        },
      ],
      diagnostics: [],
    }),
    list_records: () => [],
    get_container: () => ({
      containerId: "c-articles",
      title: "Articles",
      memberInstanceIds: [],
      rootInstanceIds: [],
    }),
    type_schema: () => ({
      schema: {
        type: "object",
        properties: {
          title: { type: "string", title: "Title", "x-srs-field-id": "field-title-001" },
        },
      },
      diagnostics: [],
    }),
    export_srsj: () => "{}",
    get_allowed_lifecycle_transitions: () => {
      throw new Error("LifecycleNotDefined");
    },
    list_attachments: () => ({ sourceDocumentsPath: "source_documents", entries: [] }),
    ...overrides,
  });
}

describe("GovernanceShell — size warning banner", () => {
  it("shows the warning banner when validate returns warning diagnostics and no errors", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [{ severity: "warning", message: "Attachment exceeds recommended size" }],
        summary: { checked: 1, errors: 0, warnings: 1 },
      }),
    });
    const { container } = render(GovernanceShell, {
      props: { repo, repoName: "test", documentProvider: "local", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });
    // Wait for mount to complete then check the banner by its specific class
    await screen.findByRole("button", { name: /Open another file/i });
    const banner = container.querySelector(".size-warning-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("1 size warning");
  });

  it("suppresses the warning banner when there are errors (errors take priority)", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [
          { severity: "error", message: "Validation error" },
          { severity: "warning", message: "Size warning" },
        ],
        summary: { checked: 1, errors: 1, warnings: 1 },
      }),
    });
    const { container } = render(GovernanceShell, {
      props: { repo, repoName: "test", documentProvider: "local", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });
    await screen.findByRole("button", { name: /Open another file/i });
    expect(container.querySelector(".size-warning-banner")).toBeNull();
  });

  it("shows plural form for multiple warnings", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [
          { severity: "warning", message: "Size warning 1" },
          { severity: "warning", message: "Size warning 2" },
        ],
        summary: { checked: 2, errors: 0, warnings: 2 },
      }),
    });
    const { container } = render(GovernanceShell, {
      props: { repo, repoName: "test", documentProvider: "local", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });
    await screen.findByRole("button", { name: /Open another file/i });
    const banner = container.querySelector(".size-warning-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("2 size warnings");
  });
});

describe("GovernanceShell — Repository inspector count", () => {
  // Regression: `report.instanceCount` isn't a field the WASM binding returns
  // (only `diagnostics` and `summary: { checked, errors, warnings }`) —
  // reading the non-existent flat field rendered "undefined" in the
  // Repository panel instead of the real count (caught against srs-rust
  // build.297's bindings, srs-web#pin-297).
  it("shows summary.checked as the record count, not 'undefined'", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 3, errors: 0, warnings: 0 },
      }),
    });
    const { container } = render(GovernanceShell, {
      props: { repo, repoName: "test", documentProvider: "local", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });
    await screen.findByRole("button", { name: /Open another file/i });
    const sections = Array.from(container.querySelectorAll(".inspector__section"));
    const repositorySection = sections.find((s) => s.querySelector(".inspector__title")?.textContent?.includes("Repository"));
    expect(repositorySection).toBeDefined();
    expect(repositorySection!.textContent).toContain("3");
    expect(repositorySection!.textContent).not.toContain("undefined");
  });
});

describe("GovernanceShell — addContainerMember failure branch", () => {
  it("transitions to edit mode and shows error when addContainerMember throws", async () => {
    const createdRecord = {
      instanceId: "rec-001",
      typeId: "com.test/article",
      typeVersion: 1,
      typeNamespace: "com.test",
      typeName: "Article",
      fieldValues: {},
    };

    const repo = makeBaseRepo({
      create_record: vi.fn(() => createdRecord),
      add_container_member: vi.fn(() => {
        throw new Error("container not found");
      }),
    });

    render(GovernanceShell, {
      props: {
        repo,
        repoName: "test.srsj",
        documentProvider: "local",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
      },
    });

    // Wait for onMount to complete — button appears once containerSchemas is built
    const newBtn = await screen.findByRole("button", { name: /New Article/i });
    fireEvent.click(newBtn);

    // RecordForm should mount in create mode
    const formContainer = await screen.findByTestId("record-form");
    const form = formContainer.querySelector("form");
    expect(form).not.toBeNull();

    // Submit the form — triggers handleFormSave → createRecord → addContainerMember throws
    fireEvent.submit(form!);

    // Error alert must be visible
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("container registration failed");

    // Form must transition to edit mode
    await screen.findByText("Edit Article");
  });
});

describe("GovernanceShell — sections sharing one container", () => {
  it("renders every root-level section as a distinct nav item (no duplicate-key blank-out)", async () => {
    // Regression: muSrs has several sections that are direct members of the root
    // container, so repository_navigation returns sections sharing a
    // sectionContainerId. Keying the sidebar {#each} by containerId collided on the
    // duplicate key and blanked the whole Governance nav ("0 records"). Each section
    // must render as its own nav item.
    const section = (instanceId: string, label: string, containerId: string) => ({
      instanceId,
      typeId: "com.test/guide",
      typeVersion: 1,
      typeNamespace: "com.test",
      typeName: "guide",
      displayLabel: label,
      sectionContainerId: containerId,
    });
    const repo = makeBaseRepo({
      repository_navigation: () => ({
        rootContainerId: "c-root",
        identity: {
          instanceId: "id-1",
          typeId: "com.test/identity",
          typeVersion: 1,
          typeNamespace: "com.test",
          typeName: "identity",
          displayLabel: "Repo",
        },
        sections: [
          // Two sections share the root container id — the duplicate-key trigger.
          section("guide-a", "Guide A", "c-root"),
          section("guide-b", "Guide B", "c-root"),
          section("decision-log", "Decision Log", "c-decision"),
        ],
        diagnostics: [],
      }),
      get_container: (id: string) => ({
        containerId: id,
        title: id,
        memberInstanceIds: [],
        rootInstanceIds: [],
      }),
      list_records: () => [],
    });
    render(GovernanceShell, {
      props: { repo, repoName: "test", documentProvider: "local", onExport: vi.fn(), onOpenAnother: vi.fn() },
    });
    await screen.findByRole("button", { name: /Open another file/i });
    // All three sections must be present — the shared containerId must not collapse them.
    expect(await screen.findByRole("link", { name: /Guide A/i })).toBeDefined();
    expect(await screen.findByRole("link", { name: /Guide B/i })).toBeDefined();
    expect(await screen.findByRole("link", { name: /Decision Log/i })).toBeDefined();
  });
});

describe("GovernanceShell — Repository nav group", () => {
  it("renders Migrations NavItem in the Repository nav group", async () => {
    const repo = makeBaseRepo();
    render(GovernanceShell, {
      props: {
        repo,
        repoName: "test.srsj",
        documentProvider: "local",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
      },
    });
    const item = await screen.findByRole("link", { name: /Migrations/i });
    expect(item).toBeDefined();
  });
});

// -----------------------------------------------------------------------------
// srs-web#312 — document-mutation save-state gaps from PR #311
// -----------------------------------------------------------------------------

describe("GovernanceShell — local-save-failure reflection (srs-web#312 bug 1)", () => {
  const createdRecord = {
    instanceId: "rec-001",
    typeId: "com.test/article",
    typeVersion: 1,
    typeNamespace: "com.test",
    typeName: "Article",
    fieldValues: {},
  };

  function repoWithCreatableRecord(overrides: Partial<SrsRepository> = {}): SrsRepository {
    return makeBaseRepo({
      create_record: vi.fn(() => createdRecord),
      add_container_member: vi.fn(() => []),
      ...overrides,
    });
  }

  /** Create a record via the "New" flow — this also drives persistWorkingCopy(). */
  async function createRecordViaNewFlow(): Promise<void> {
    const newBtn = await screen.findByRole("button", { name: /New Article/i });
    fireEvent.click(newBtn);
    const formContainer = await screen.findByTestId("record-form");
    const form = formContainer.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
  }

  it("shows the local-save-failed message, not 'Saved', when onDocumentMutation returns false", async () => {
    const onDocumentMutation = vi.fn(() => false);
    const repo = repoWithCreatableRecord();
    render(GovernanceShell, {
      props: {
        repo,
        repoName: "test.srsj",
        documentProvider: "local",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onDocumentMutation,
      },
    });
    await createRecordViaNewFlow();

    expect(onDocumentMutation).toHaveBeenCalled();
    const failureMessage = await screen.findByTestId("local-save-failed");
    expect(failureMessage.textContent).toContain("could not be saved");

    const savedIndicator = screen.getByText("Saved");
    expect(savedIndicator.classList.contains("topbar__save-indicator--visible")).toBe(false);
  });

  it("shows 'Saved' and no failure message when onDocumentMutation returns true", async () => {
    const onDocumentMutation = vi.fn(() => true);
    const repo = repoWithCreatableRecord();
    render(GovernanceShell, {
      props: {
        repo,
        repoName: "test.srsj",
        documentProvider: "local",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        onDocumentMutation,
      },
    });
    await createRecordViaNewFlow();

    expect(onDocumentMutation).toHaveBeenCalled();
    const savedIndicator = await screen.findByText("Saved");
    expect(savedIndicator.classList.contains("topbar__save-indicator--visible")).toBe(true);
    expect(screen.queryByTestId("local-save-failed")).toBeNull();
  });

  it("defaults onDocumentMutation to a no-op success so callers that don't care can omit it", async () => {
    const repo = repoWithCreatableRecord();
    render(GovernanceShell, {
      props: {
        repo,
        repoName: "test.srsj",
        documentProvider: "local",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        // onDocumentMutation intentionally omitted
      },
    });
    await createRecordViaNewFlow();
    const savedIndicator = await screen.findByText("Saved");
    expect(savedIndicator.classList.contains("topbar__save-indicator--visible")).toBe(true);
  });
});

describe("GovernanceShell — saving-state mutation guard (srs-web#312 bug 2)", () => {
  const createdRecord = {
    instanceId: "rec-001",
    typeId: "com.test/article",
    typeVersion: 1,
    typeNamespace: "com.test",
    typeName: "Article",
    fieldValues: {},
  };

  function repoWithSelectedRecordSupport(overrides: Partial<SrsRepository> = {}): SrsRepository {
    return makeBaseRepo({
      create_record: vi.fn(() => createdRecord),
      add_container_member: vi.fn(() => []),
      // The fake create_record doesn't feed back into list_records/get_container, so
      // return the created record as an existing member directly — loadContainerNav()
      // re-reads both right after creation and selectedRecord needs to resolve for
      // Edit/Delete/transition buttons to render. list_records returns the wrapped
      // RecordSummary shape ({ instanceId, displayLabel, record }), matching the real
      // WASM contract (srs-rust#293) rather than a bare Record.
      list_records: () => [
        { instanceId: createdRecord.instanceId, displayLabel: "Untitled", record: createdRecord },
      ],
      get_container: () => ({
        containerId: "c-articles",
        title: "Articles",
        memberInstanceIds: ["rec-001"],
        rootInstanceIds: [],
      }),
      resolve_container_view: () => ({
        containerId: "c-articles",
        members: [],
        columns: [],
        excludeLifecycleStates: [],
        diagnostics: [],
      }),
      get_allowed_lifecycle_transitions: () => ({
        currentState: "draft",
        isImmutable: false,
        transitions: [{ name: "propose", to: "proposed", toIsFinal: false }],
      }),
      ...overrides,
    });
  }

  async function createAndSelectRecord(): Promise<void> {
    const newBtn = await screen.findByRole("button", { name: /New Article/i });
    fireEvent.click(newBtn);
    const formContainer = await screen.findByTestId("record-form");
    const form = formContainer.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
  }

  it("disables Edit, Delete, and lifecycle-transition buttons while saving is true, and re-enables them once false", async () => {
    const repo = repoWithSelectedRecordSupport();
    const { rerender } = render(GovernanceShell, {
      props: {
        repo,
        repoName: "test.srsj",
        documentProvider: "local",
        onExport: vi.fn(),
        onOpenAnother: vi.fn(),
        saving: false,
      },
    });
    await createAndSelectRecord();

    const editBtn = (await screen.findByRole("button", { name: "Edit" })) as HTMLButtonElement;
    const deleteBtn = (await screen.findByRole("button", { name: "Delete" })) as HTMLButtonElement;
    const transitionBtn = (await screen.findByRole("button", {
      name: /→ propose/,
    })) as HTMLButtonElement;
    expect(editBtn.disabled).toBe(false);
    expect(deleteBtn.disabled).toBe(false);
    expect(transitionBtn.disabled).toBe(false);

    await rerender({ saving: true });
    expect(editBtn.disabled).toBe(true);
    expect(deleteBtn.disabled).toBe(true);
    expect(transitionBtn.disabled).toBe(true);

    await rerender({ saving: false });
    expect(editBtn.disabled).toBe(false);
    expect(deleteBtn.disabled).toBe(false);
    expect(transitionBtn.disabled).toBe(false);
  });
});
