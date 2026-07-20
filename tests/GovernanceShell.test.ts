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
    validate: () => ({ instanceCount: 0, errorCount: 0, diagnostics: [], summary: { checked: 0, errors: 0, warnings: 0 } }),
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
        instanceCount: 1,
        errorCount: 0,
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
        instanceCount: 1,
        errorCount: 1,
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
        instanceCount: 2,
        errorCount: 0,
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

describe("GovernanceShell — addContainerMember failure branch", () => {
  it("transitions to edit mode and shows error when addContainerMember throws", async () => {
    const createdRecord = {
      instanceId: "rec-001",
      typeId: "com.test/article",
      typeVersion: 1,
      typeNamespace: "com.test",
      typeName: "Article",
      fieldValues: [],
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
