/**
 * Unit tests for srs-client.ts — new WASM wrappers added in srs-web#52.
 *
 * The WASM build artifact is absent in the test environment; tests mock the
 * `SrsRepository` interface directly and verify that each wrapper:
 *   1. calls the correct underlying WASM method with the correct arguments,
 *   2. returns the WASM output typed as the documented return type.
 *
 * Semantic correctness of the WASM methods is tested in srs-rust/crates/srs-bindings/.
 */

import { describe, expect, it, vi } from "vitest";
import type { SrsRepository } from "../src/lib/srs-client.js";
import {
  containersForInstance,
  documentViewsForContainer,
  listBlueprints,
  listDocumentViews,
  typeSchema,
} from "../src/lib/srs-client.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a minimal SrsRepository mock where every method throws unless overridden. */
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
    list_relations: () => { throw new Error("not mocked"); },
    create_relation: () => { throw new Error("not mocked"); },
    delete_relation: () => { throw new Error("not mocked"); },
    set_lifecycle_state: () => { throw new Error("not mocked"); },
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
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// containersForInstance
// ---------------------------------------------------------------------------

describe("containersForInstance", () => {
  it("calls containers_for_instance with the given instance id", () => {
    const summaries = [{ containerId: "c1", title: "Log" }];
    const spy = vi.fn().mockReturnValue(summaries);
    const repo = mockRepo({ containers_for_instance: spy });

    const result = containersForInstance(repo, "inst-abc");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("inst-abc");
    expect(result[0].containerId).toBe("c1");
    expect(result[0].title).toBe("Log");
  });

  it("returns an empty array when the instance belongs to no container", () => {
    const repo = mockRepo({ containers_for_instance: () => [] });
    expect(containersForInstance(repo, "orphan")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// typeSchema
// ---------------------------------------------------------------------------

describe("typeSchema", () => {
  it("calls type_schema with typeId only when typeVersion is omitted", () => {
    const schemaResult = { schema: { type: "object", properties: {} }, diagnostics: [] };
    const spy = vi.fn().mockReturnValue(schemaResult);
    const repo = mockRepo({ type_schema: spy });

    const result = typeSchema(repo, "type-uuid-001");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("type-uuid-001", undefined);
    expect(result.schema).toEqual(schemaResult.schema);
    expect(result.diagnostics).toEqual([]);
  });

  it("passes typeVersion when provided", () => {
    const schemaResult = { schema: { type: "object" }, diagnostics: [] };
    const spy = vi.fn().mockReturnValue(schemaResult);
    const repo = mockRepo({ type_schema: spy });

    typeSchema(repo, "type-uuid-002", 3);

    expect(spy).toHaveBeenCalledWith("type-uuid-002", 3);
  });

  it("surfaces non-fatal diagnostics from the WASM result", () => {
    const schemaResult = { schema: { type: "object" }, diagnostics: ["warn: dangling fieldId x"] };
    const repo = mockRepo({ type_schema: () => schemaResult });

    const result = typeSchema(repo, "type-uuid-003");

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toContain("dangling fieldId");
  });

  it("propagates WASM throw when the type cannot be resolved", () => {
    const repo = mockRepo({ type_schema: () => { throw new Error("type not found"); } });
    expect(() => typeSchema(repo, "nonexistent-type")).toThrow("type not found");
  });
});

// ---------------------------------------------------------------------------
// listBlueprints
// ---------------------------------------------------------------------------

describe("listBlueprints", () => {
  it("calls list_blueprints and returns the summaries envelope", () => {
    const blueprintResult = {
      summaries: [
        {
          id: "bp-001",
          namespace: "com.test",
          name: "decision-log",
          version: 1,
          description: "Decision log blueprint",
          rootTypeCount: 1,
        },
      ],
      diagnostics: [],
    };
    const spy = vi.fn().mockReturnValue(blueprintResult);
    const repo = mockRepo({ list_blueprints: spy });

    const result = listBlueprints(repo);

    expect(spy).toHaveBeenCalledOnce();
    expect(result.summaries).toHaveLength(1);
    expect(result.summaries[0].id).toBe("bp-001");
    expect(result.summaries[0].rootTypeCount).toBe(1);
    expect(result.diagnostics).toEqual([]);
  });

  it("returns empty summaries and empty diagnostics when no blueprints are registered", () => {
    const repo = mockRepo({ list_blueprints: () => ({ summaries: [], diagnostics: [] }) });

    const result = listBlueprints(repo);

    expect(result.summaries).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("exposes sourcePackage on sub-package blueprints", () => {
    const repo = mockRepo({
      list_blueprints: () => ({
        summaries: [
          {
            id: "bp-ext",
            namespace: "com.ext",
            name: "ext-bp",
            version: 1,
            description: "ext",
            rootTypeCount: 0,
            sourcePackage: "package/ext",
          },
        ],
        diagnostics: [],
      }),
    });

    const result = listBlueprints(repo);
    expect(result.summaries[0].sourcePackage).toBe("package/ext");
  });
});

// ---------------------------------------------------------------------------
// documentViewsForContainer
// ---------------------------------------------------------------------------

describe("documentViewsForContainer", () => {
  it("calls document_views_for_container with the container id and returns full views", () => {
    const views = [
      {
        id: "view-001",
        namespace: "com.test",
        name: "decision-log-view",
        version: 1,
        description: "Decision log document view",
        rootTypeRefs: [{ typeId: "type-dl-001", typeVersion: 1 }],
        sections: [
          {
            sectionId: "body",
            title: "Decisions",
            order: 0,
            source: { type: "container-subset", containerId: "cont-001" },
          },
        ],
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    const spy = vi.fn().mockReturnValue(views);
    const repo = mockRepo({ document_views_for_container: spy });

    const result = documentViewsForContainer(repo, "cont-001");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("cont-001");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("view-001");
    expect(result[0].rootTypeRefs?.[0].typeId).toBe("type-dl-001");
    expect(result[0].sections).toHaveLength(1);
  });

  it("returns an empty array when no views match the container root type", () => {
    const repo = mockRepo({ document_views_for_container: () => [] });

    const result = documentViewsForContainer(repo, "unbound-container");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listDocumentViews
// ---------------------------------------------------------------------------

describe("listDocumentViews", () => {
  it("calls list_document_views with an empty filter and returns summaries", () => {
    const summaries = [
      {
        id: "dv-001",
        namespace: "com.test",
        name: "decision-log-view",
        version: 1,
        description: "Decision log document view",
        containerType: "decision-log",
      },
    ];
    const spy = vi.fn().mockReturnValue(summaries);
    const repo = mockRepo({ list_document_views: spy });

    const result = listDocumentViews(repo);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("{}");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("dv-001");
    expect(result[0].containerType).toBe("decision-log");
  });

  it("returns an empty array when no document views are registered", () => {
    const repo = mockRepo({ list_document_views: () => [] });

    const result = listDocumentViews(repo);

    expect(result).toEqual([]);
  });

  it("exposes rootTypeRefs when present on a view", () => {
    const repo = mockRepo({
      list_document_views: () => ([
        {
          id: "dv-002",
          namespace: "com.test",
          name: "typed-view",
          version: 1,
          description: "view with type refs",
          containerType: "typed-container",
          rootTypeRefs: [{ typeId: "type-abc", typeVersion: 2 }],
        },
      ]),
    });

    const result = listDocumentViews(repo);

    expect(result[0].rootTypeRefs).toHaveLength(1);
    expect(result[0].rootTypeRefs?.[0].typeId).toBe("type-abc");
    expect(result[0].rootTypeRefs?.[0].typeVersion).toBe(2);
  });

  it("propagates WASM throw when the binding fails", () => {
    const repo = mockRepo({ list_document_views: () => { throw new Error("wasm error"); } });
    expect(() => listDocumentViews(repo)).toThrow("wasm error");
  });
});
