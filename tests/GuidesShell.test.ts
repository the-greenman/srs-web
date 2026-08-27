// @vitest-environment happy-dom
import { render, screen } from "@testing-library/svelte";
import { vi, describe, it, expect } from "vitest";
import GuidesShell from "../src/lib/guides/GuidesShell.svelte";
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

/**
 * Minimal repo mock for GuidesShell banner tests.
 * list_blueprints returns no summaries so onMount exits early (schemaError path),
 * then refreshValidation() runs unconditionally after the try/catch.
 */
function makeBaseRepo(overrides: Partial<SrsRepository> = {}): SrsRepository {
  return mockRepo({
    list_blueprints: () => ({ summaries: [] }),
    validate: () => ({
      diagnostics: [],
      summary: { checked: 0, errors: 0, warnings: 0 },
    }),
    ...overrides,
  });
}

const defaultProps = {
  repoName: "test.srsj",
  documentProvider: "local",
  onExport: vi.fn(),
  onOpenAnother: vi.fn(),
};

describe("GuidesShell — size warning banner", () => {
  it("shows the warning banner when validate returns warnings and no errors", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 5, errors: 0, warnings: 1 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    // Wait for mount — the "Open another file" button is always rendered
    await screen.findByRole("button", { name: /Open another file/i });
    const banner = container.querySelector(".size-warning-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("1 size warning");
  });

  it("suppresses the warning banner when errors are present (safety interlock)", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 5, errors: 1, warnings: 2 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });
    expect(container.querySelector(".size-warning-banner")).toBeNull();
  });

  it("shows no banner when there are no warnings", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 0, errors: 0, warnings: 0 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });
    expect(container.querySelector(".size-warning-banner")).toBeNull();
  });

  it("shows plural form for multiple warnings", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 5, errors: 0, warnings: 3 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });
    const banner = container.querySelector(".size-warning-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("3 size warnings");
  });
});

describe("GuidesShell — blueprint schema with non-fatal diagnostics", () => {
  const GUIDE_TYPE_ID = "8f138dd6-11d2-42a5-99ec-3d6e23bed54f";

  /** A usable guide blueprint schema (root $ref resolves; no section types). */
  function guideSchema() {
    return {
      properties: {
        root: { $ref: `#/definitions/${GUIDE_TYPE_ID}` },
        contains: { type: "array", items: { oneOf: [] } },
      },
      definitions: {
        [GUIDE_TYPE_ID]: { type: "object", properties: {} },
      },
    };
  }

  function guidesRepo(diagnostics: string[]): SrsRepository {
    return makeBaseRepo({
      list_blueprints: () => ({
        summaries: [
          { id: "bp-guide", namespace: "com.mudemocracy", name: "guide", version: 1 },
        ],
      }),
      blueprint_schema: () => ({ schema: guideSchema(), diagnostics }),
      list_types: () => [
        { id: GUIDE_TYPE_ID, namespace: "com.mudemocracy", name: "guide", version: 1 },
      ],
      list_document_views: () => [],
      list_records: () => [
        {
          instanceId: "guide-1",
          displayLabel: "My Guide",
          record: {
            instanceId: "guide-1",
            typeId: GUIDE_TYPE_ID,
            typeVersion: 1,
            typeNamespace: "com.mudemocracy",
            typeName: "guide",
            fieldValues: {},
          },
        },
      ],
      list_containers: () => [],
      order_by_precedes: (ids: string[]) => ids,
    });
  }

  it("still lists guides when blueprintSchema returns a non-fatal warning", async () => {
    // Regression: muSrs's guide blueprint uses cardinality "one-to-many", which the
    // WASM projection can't map to minItems/maxItems — it warns but still returns a
    // usable schema. The boot used to treat any diagnostic as fatal and return early,
    // blanking the editor ("No guides yet"). It must now log and continue.
    const repo = guidesRepo([
      "cardinality 'one-to-many' on relation 'contains' could not be parsed; minItems/maxItems omitted",
    ]);
    render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });

    const items = await screen.findAllByTestId("guides-guide-item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("My Guide");
    expect(screen.queryByText("No guides yet")).toBeNull();
  });
});
