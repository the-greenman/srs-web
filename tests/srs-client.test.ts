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
  addContainerMember,
  containersForInstance,
  createRelation,
  deleteRelation,
  documentViewsForContainer,
  find,
  listBlueprints,
  listContainers,
  listDocumentViews,
  listRecords,
  listRelations,
  listTerms,
  repositoryNavigation,
  resolveContainerView,
  typeSchema,
  type ContainerListFilter,
  type DocumentViewListFilter,
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
    find: () => { throw new Error("not mocked"); },
    list_terms: () => { throw new Error("not mocked"); },
    create_record_successor: () => { throw new Error("not mocked"); },
    resolve_container_view: () => { throw new Error("not mocked"); },
    repository_navigation: () => { throw new Error("not mocked"); },
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

  it("passes a filter when provided", () => {
    const spy = vi.fn().mockReturnValue([]);
    const repo = mockRepo({ list_document_views: spy });
    const filter: DocumentViewListFilter = { namespace: "com.test" };

    listDocumentViews(repo, filter);

    expect(spy).toHaveBeenCalledWith(JSON.stringify(filter));
  });
});

// ---------------------------------------------------------------------------
// listContainers
// ---------------------------------------------------------------------------

describe("listContainers", () => {
  it("calls list_containers with serialised filter and returns ContainerSummary array", () => {
    const summaries = [
      { containerId: "c-dl-001", title: "Decision Log", containerType: "decision-log" },
    ];
    const spy = vi.fn().mockReturnValue(summaries);
    const repo = mockRepo({ list_containers: spy });

    const result = listContainers(repo, { containerType: "decision-log" });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ containerType: "decision-log" }));
    expect(result).toHaveLength(1);
    expect(result[0].containerId).toBe("c-dl-001");
    expect(result[0].containerType).toBe("decision-log");
  });

  it("passes an empty filter object when called with no arguments", () => {
    const spy = vi.fn().mockReturnValue([]);
    const repo = mockRepo({ list_containers: spy });

    listContainers(repo);

    expect(spy).toHaveBeenCalledWith("{}");
  });

  it("returns an empty array when no containers match the filter", () => {
    const repo = mockRepo({ list_containers: () => [] });
    const result = listContainers(repo, { containerType: "decision-log" });
    expect(result).toEqual([]);
  });

  it("passes arbitrary filter keys through serialisation", () => {
    const spy = vi.fn().mockReturnValue([]);
    const repo = mockRepo({ list_containers: spy });
    const filter: ContainerListFilter = { memberInstanceId: "inst-abc" };

    listContainers(repo, filter);

    expect(spy).toHaveBeenCalledWith(JSON.stringify(filter));
  });
});

// ---------------------------------------------------------------------------
// addContainerMember — srs-web#103: register new decisions in decision_log
// ---------------------------------------------------------------------------

describe("addContainerMember", () => {
  it("calls add_container_member with containerId and instanceId and returns the member list", () => {
    const memberIds = ["inst-abc", "inst-def"];
    const spy = vi.fn().mockReturnValue(memberIds);
    const repo = mockRepo({ add_container_member: spy });

    const result = addContainerMember(repo, "c-dl-001", "inst-abc");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("c-dl-001", "inst-abc");
    expect(result).toEqual(memberIds);
  });

  it("propagates WASM throw when the container does not exist", () => {
    const repo = mockRepo({
      add_container_member: () => { throw new Error("container not found"); },
    });
    expect(() => addContainerMember(repo, "nonexistent", "inst-abc")).toThrow("container not found");
  });

  it("returns an empty array when the container starts empty (idempotent first add)", () => {
    const repo = mockRepo({ add_container_member: () => ["inst-abc"] });
    const result = addContainerMember(repo, "c-dl-001", "inst-abc");
    expect(result).toEqual(["inst-abc"]);
  });
});

// ---------------------------------------------------------------------------
// listRecords — srs-web#91: unwrap RecordSummary.displayLabel from list_records
// ---------------------------------------------------------------------------

describe("listRecords", () => {
  const baseInner = { instanceId: "r1", typeId: "t1", typeVersion: 1, fieldValues: [], tags: [] };

  it("populates displayLabel from the RecordSummary wrapper and propagates inner record fields", () => {
    const innerRecord = { instanceId: "r1", typeId: "t1", typeVersion: 1, fieldValues: [{ fieldId: "f1", value: "hello" }], tags: [] };
    const summaries = [{ instanceId: "r1", displayLabel: "My Label", record: innerRecord }];
    const repo = mockRepo({ list_records: () => summaries });

    const result = listRecords(repo, {});

    expect(result).toHaveLength(1);
    expect(result[0].instanceId).toBe("r1");
    expect(result[0].displayLabel).toBe("My Label");
    expect(result[0].typeId).toBe("t1");
    // Verify inner record's fieldValues reach the caller (backward-compat for existing callers)
    expect(result[0].fieldValues).toEqual([{ fieldId: "f1", value: "hello" }]);
  });

  it("accepts display_label snake_case (defensive dual-lookup, consistent with normalizeRecord convention)", () => {
    // RecordSummary uses #[serde(rename_all = "camelCase")] so real WASM always emits displayLabel.
    // The snake_case branch exists defensively, consistent with the dual-lookup pattern in normalizeRecord.
    const summaries = [{ instanceId: "r2", display_label: "Snake Label", record: { ...baseInner, instanceId: "r2" } }];
    const repo = mockRepo({ list_records: () => summaries });

    const result = listRecords(repo, {});

    expect(result[0].instanceId).toBe("r2");
    expect(result[0].displayLabel).toBe("Snake Label");
  });

  it("falls back gracefully for a bare Record shape (no wrapper); displayLabel is undefined", () => {
    const bare = [{ instanceId: "r3", typeId: "t1", typeVersion: 1, fieldValues: [], tags: [] }];
    const repo = mockRepo({ list_records: () => bare });

    const result = listRecords(repo, {});

    expect(result[0].instanceId).toBe("r3");
    expect(result[0].displayLabel).toBeUndefined();
  });

  it("passes the filter JSON to list_records", () => {
    const spy = vi.fn().mockReturnValue([]);
    const repo = mockRepo({ list_records: spy });

    listRecords(repo, { typeNamespace: "com.example", typeName: "decision" });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ typeNamespace: "com.example", typeName: "decision" }));
  });
});

// ---------------------------------------------------------------------------
// listRelations — srs-web#106: load relations for a decision record
// ---------------------------------------------------------------------------

describe("listRelations", () => {
  it("calls list_relations with JSON-serialised filter and returns normalised relations", () => {
    const raw = [
      {
        relationId: "rel-001",
        relationType: "supersedes",
        sourceInstanceId: "inst-a",
        targetInstanceId: "inst-b",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    const spy = vi.fn().mockReturnValue(raw);
    const repo = mockRepo({ list_relations: spy });

    const result = listRelations(repo, { source: "inst-a" });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ source: "inst-a" }));
    expect(result).toHaveLength(1);
    expect(result[0].relationId).toBe("rel-001");
    expect(result[0].relationType).toBe("supersedes");
    expect(result[0].sourceInstanceId).toBe("inst-a");
    expect(result[0].targetInstanceId).toBe("inst-b");
  });

  it("normalises snake_case fields from WASM (dual-lookup: relation_id, source_instance_id, target_instance_id)", () => {
    const raw = [
      {
        relation_id: "rel-002",
        relation_type: "depends-on",
        source_instance_id: "inst-c",
        target_instance_id: "inst-d",
      },
    ];
    const repo = mockRepo({ list_relations: () => raw });

    const result = listRelations(repo, { target: "inst-d" });

    expect(result[0].relationId).toBe("rel-002");
    expect(result[0].relationType).toBe("depends-on");
    expect(result[0].sourceInstanceId).toBe("inst-c");
    expect(result[0].targetInstanceId).toBe("inst-d");
  });

  it("accepts RelationSummary sourceId / targetId aliases", () => {
    const raw = [{ relation_id: "rel-003", relation_type: "precedes", sourceId: "inst-e", targetId: "inst-f" }];
    const repo = mockRepo({ list_relations: () => raw });

    const result = listRelations(repo, {});

    expect(result[0].sourceInstanceId).toBe("inst-e");
    expect(result[0].targetInstanceId).toBe("inst-f");
  });

  it("returns an empty array when no relations match the filter", () => {
    const repo = mockRepo({ list_relations: () => [] });
    expect(listRelations(repo, { source: "orphan" })).toEqual([]);
  });

  it("uses an empty filter object when called with no filter argument", () => {
    const spy = vi.fn().mockReturnValue([]);
    const repo = mockRepo({ list_relations: spy });

    listRelations(repo);

    expect(spy).toHaveBeenCalledWith("{}");
  });
});

// ---------------------------------------------------------------------------
// createRelation — srs-web#106: link two decisions via a typed relation
// ---------------------------------------------------------------------------

describe("createRelation", () => {
  it("calls create_relation with JSON-serialised input and returns the normalised relation", () => {
    const raw = {
      relationId: "rel-new-001",
      relationType: "supersedes",
      sourceInstanceId: "inst-src",
      targetInstanceId: "inst-tgt",
      createdAt: "2026-07-01T00:00:00Z",
    };
    const spy = vi.fn().mockReturnValue(raw);
    const repo = mockRepo({ create_relation: spy });

    const result = createRelation(repo, {
      relationType: "supersedes",
      sourceInstanceId: "inst-src",
      targetInstanceId: "inst-tgt",
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      JSON.stringify({ relationType: "supersedes", sourceInstanceId: "inst-src", targetInstanceId: "inst-tgt" })
    );
    expect(result.relationId).toBe("rel-new-001");
    expect(result.relationType).toBe("supersedes");
    expect(result.sourceInstanceId).toBe("inst-src");
    expect(result.targetInstanceId).toBe("inst-tgt");
  });

  it("normalises snake_case fields from WASM (relation_id, relation_type, source_instance_id, target_instance_id)", () => {
    const raw = {
      relation_id: "rel-new-002",
      relation_type: "depends-on",
      source_instance_id: "inst-x",
      target_instance_id: "inst-y",
    };
    const repo = mockRepo({ create_relation: () => raw });

    const result = createRelation(repo, {
      relationType: "depends-on",
      sourceInstanceId: "inst-x",
      targetInstanceId: "inst-y",
    });

    expect(result.relationId).toBe("rel-new-002");
    expect(result.relationType).toBe("depends-on");
    expect(result.sourceInstanceId).toBe("inst-x");
    expect(result.targetInstanceId).toBe("inst-y");
  });

  it("propagates WASM throw when the relation cannot be created", () => {
    const repo = mockRepo({ create_relation: () => { throw new Error("duplicate relation"); } });
    expect(() =>
      createRelation(repo, { relationType: "supersedes", sourceInstanceId: "a", targetInstanceId: "b" })
    ).toThrow("duplicate relation");
  });
});

// ---------------------------------------------------------------------------
// deleteRelation — srs-web#116 (UI deferred); binding tested here
// ---------------------------------------------------------------------------

describe("deleteRelation", () => {
  it("calls delete_relation with the given relation ID", () => {
    const spy = vi.fn();
    const repo = mockRepo({ delete_relation: spy });

    deleteRelation(repo, "rel-to-delete");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("rel-to-delete");
  });

  it("propagates WASM throw when the relation ID does not exist", () => {
    const repo = mockRepo({ delete_relation: () => { throw new Error("relation not found"); } });
    expect(() => deleteRelation(repo, "nonexistent")).toThrow("relation not found");
  });
});

// ---------------------------------------------------------------------------
// find (srs-rust#218)
// ---------------------------------------------------------------------------

describe("find", () => {
  it("serialises the query as JSON and passes it to repo.find", () => {
    const rawResult = {
      hits: [],
      total: 0,
      diagnostics: [],
    };
    const spy = vi.fn().mockReturnValue(rawResult);
    const repo = mockRepo({ find: spy });

    find(repo, { contentMatch: "foo" });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ contentMatch: "foo" }));
  });

  it("returns a DiscoveryResult with normalised camelCase hit fields", () => {
    const rawResult = {
      hits: [
        {
          instance_id: "inst-001",
          label: "Decision 1",
          type_namespace: "com.test",
          type_name: "decision",
          matched_fields: ["title"],
        },
      ],
      total: 1,
      diagnostics: [],
    };
    const repo = mockRepo({ find: () => rawResult });

    const result = find(repo, { contentMatch: "foo" });

    expect(result.total).toBe(1);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0].instanceId).toBe("inst-001");
    expect(result.hits[0].typeNamespace).toBe("com.test");
    expect(result.hits[0].typeName).toBe("decision");
    expect(result.hits[0].matchedFields).toEqual(["title"]);
  });

  it("also normalises camelCase hits (serde_wasm_bindgen honours camelCase)", () => {
    const rawResult = {
      hits: [
        {
          instanceId: "inst-002",
          label: "Decision 2",
          typeNamespace: "com.test",
          typeName: "decision",
          matchedFields: ["body"],
        },
      ],
      total: 1,
      diagnostics: [],
    };
    const repo = mockRepo({ find: () => rawResult });

    const result = find(repo, {});

    expect(result.hits[0].instanceId).toBe("inst-002");
    expect(result.hits[0].matchedFields).toEqual(["body"]);
  });

  it("returns empty hits and diagnostics when the WASM result is empty", () => {
    const repo = mockRepo({ find: () => ({ hits: [], total: 0, diagnostics: [] }) });

    const result = find(repo, {});

    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("propagates WASM throw", () => {
    const repo = mockRepo({ find: () => { throw new Error("find failed"); } });
    expect(() => find(repo, { contentMatch: "x" })).toThrow("find failed");
  });
});

// ---------------------------------------------------------------------------
// listTerms (srs-rust#303, RFC-006)
// ---------------------------------------------------------------------------

describe("listTerms", () => {
  it("calls list_terms with no arguments and returns normalised Term[]", () => {
    const rawTerms = [
      { id: "term-001", label: "Risk", description: "A potential issue", aliases: ["hazard"], roles: ["governance"] },
      { id: "term-002", label: "Decision" },
    ];
    const spy = vi.fn().mockReturnValue(rawTerms);
    const repo = mockRepo({ list_terms: spy });

    const result = listTerms(repo);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("term-001");
    expect(result[0].label).toBe("Risk");
    expect(result[0].description).toBe("A potential issue");
    expect(result[0].aliases).toEqual(["hazard"]);
    expect(result[0].roles).toEqual(["governance"]);
  });

  it("returns a term with undefined optional fields when they are absent", () => {
    const repo = mockRepo({ list_terms: () => [{ id: "term-003" }] });

    const result = listTerms(repo);

    expect(result[0].label).toBeUndefined();
    expect(result[0].description).toBeUndefined();
    expect(result[0].aliases).toBeUndefined();
    expect(result[0].roles).toBeUndefined();
  });

  it("returns an empty array when no terms are registered", () => {
    const repo = mockRepo({ list_terms: () => [] });
    expect(listTerms(repo)).toEqual([]);
  });

  it("propagates WASM throw", () => {
    const repo = mockRepo({ list_terms: () => { throw new Error("terms failed"); } });
    expect(() => listTerms(repo)).toThrow("terms failed");
  });
});

// ---------------------------------------------------------------------------
// resolveContainerView (srs-rust#254, srs-web#96)
// ---------------------------------------------------------------------------

describe("resolveContainerView", () => {
  const baseRecord = { instanceId: "r1", typeId: "t1", typeVersion: 1, fieldValues: [], tags: [] };
  const rawMemberCamel = {
    instanceId: "m1",
    tier: 2,
    displayLabel: "Section One",
    record: baseRecord,
  };
  const rawColumnCamel = {
    fieldId: "f1",
    fieldName: "Title",
    displayLabel: "Title",
    order: 0,
    required: true,
  };

  it("calls resolve_container_view with containerId and null when viewId is omitted", () => {
    const rawView = { containerId: "c1", members: [], columns: [], excludeLifecycleStates: [], diagnostics: [] };
    const spy = vi.fn().mockReturnValue(rawView);
    const repo = mockRepo({ resolve_container_view: spy });

    resolveContainerView(repo, "c1");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("c1", null);
  });

  it("passes viewId when provided", () => {
    const rawView = { containerId: "c1", members: [], columns: [], excludeLifecycleStates: [], diagnostics: [] };
    const spy = vi.fn().mockReturnValue(rawView);
    const repo = mockRepo({ resolve_container_view: spy });

    resolveContainerView(repo, "c1", "view-abc");

    expect(spy).toHaveBeenCalledWith("c1", "view-abc");
  });

  it("normalises camelCase ContainerView fields", () => {
    const rawView = {
      containerId: "c1",
      documentViewId: "dv-001",
      root: rawMemberCamel,
      members: [rawMemberCamel],
      columns: [rawColumnCamel],
      excludeLifecycleStates: ["archived"],
      diagnostics: ["warn: no view found"],
    };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.containerId).toBe("c1");
    expect(result.documentViewId).toBe("dv-001");
    expect(result.excludeLifecycleStates).toEqual(["archived"]);
    expect(result.diagnostics).toEqual(["warn: no view found"]);
  });

  it("normalises snake_case ContainerView fields", () => {
    const rawView = {
      container_id: "c2",
      document_view_id: "dv-002",
      members: [],
      columns: [],
      exclude_lifecycle_states: ["draft"],
      diagnostics: [],
    };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c2");

    expect(result.containerId).toBe("c2");
    expect(result.documentViewId).toBe("dv-002");
    expect(result.excludeLifecycleStates).toEqual(["draft"]);
  });

  it("normalises camelCase ResolvedMember fields including nested record", () => {
    const rawView = {
      containerId: "c1",
      members: [rawMemberCamel],
      columns: [],
      excludeLifecycleStates: [],
      diagnostics: [],
    };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.members).toHaveLength(1);
    expect(result.members[0].instanceId).toBe("m1");
    expect(result.members[0].tier).toBe(2);
    expect(result.members[0].displayLabel).toBe("Section One");
    expect(result.members[0].record.instanceId).toBe("r1");
    expect(result.members[0].record.typeId).toBe("t1");
  });

  it("normalises snake_case ResolvedMember fields", () => {
    const rawMemberSnake = {
      instance_id: "m2",
      tier: 1,
      display_label: "Root Guide",
      record: { instance_id: "r2", type_id: "t2", type_version: 1, field_values: [], tags: [] },
    };
    const rawView = {
      containerId: "c1",
      members: [rawMemberSnake],
      columns: [],
      excludeLifecycleStates: [],
      diagnostics: [],
    };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.members[0].instanceId).toBe("m2");
    expect(result.members[0].displayLabel).toBe("Root Guide");
    expect(result.members[0].record.instanceId).toBe("r2");
    expect(result.members[0].record.typeId).toBe("t2");
  });

  it("normalises camelCase ColumnSpec fields", () => {
    const rawView = {
      containerId: "c1",
      members: [],
      columns: [rawColumnCamel],
      excludeLifecycleStates: [],
      diagnostics: [],
    };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].fieldId).toBe("f1");
    expect(result.columns[0].fieldName).toBe("Title");
    expect(result.columns[0].displayLabel).toBe("Title");
    expect(result.columns[0].order).toBe(0);
    expect(result.columns[0].required).toBe(true);
  });

  it("normalises snake_case ColumnSpec fields", () => {
    const rawColumnSnake = {
      field_id: "f2",
      field_name: "Heading",
      display_label: "Heading",
      order: 1,
      required: false,
    };
    const rawView = {
      containerId: "c1",
      members: [],
      columns: [rawColumnSnake],
      excludeLifecycleStates: [],
      diagnostics: [],
    };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.columns[0].fieldId).toBe("f2");
    expect(result.columns[0].fieldName).toBe("Heading");
    expect(result.columns[0].required).toBe(false);
  });

  it("sets root to undefined when absent from WASM response", () => {
    const rawView = { containerId: "c1", members: [], columns: [], excludeLifecycleStates: [], diagnostics: [] };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.root).toBeUndefined();
  });

  it("normalises root when present", () => {
    const rawView = {
      containerId: "c1",
      root: rawMemberCamel,
      members: [rawMemberCamel],
      columns: [],
      excludeLifecycleStates: [],
      diagnostics: [],
    };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.root).toBeDefined();
    expect(result.root?.instanceId).toBe("m1");
    expect(result.root?.displayLabel).toBe("Section One");
  });

  it("returns empty arrays for members, columns, excludeLifecycleStates, and diagnostics when absent", () => {
    const rawView = { containerId: "c1" };
    const repo = mockRepo({ resolve_container_view: () => rawView });

    const result = resolveContainerView(repo, "c1");

    expect(result.members).toEqual([]);
    expect(result.columns).toEqual([]);
    expect(result.excludeLifecycleStates).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("propagates WASM throw", () => {
    const repo = mockRepo({ resolve_container_view: () => { throw new Error("container not found"); } });
    expect(() => resolveContainerView(repo, "missing")).toThrow("container not found");
  });
});

// ---------------------------------------------------------------------------
// repositoryNavigation (srs-rust#268, RFC-013)
// ---------------------------------------------------------------------------

describe("repositoryNavigation", () => {
  const rawNode = (instanceId: string, displayLabel: string, sectionContainerId?: string) => ({
    instanceId,
    typeId: `type-${instanceId}`,
    typeVersion: 1,
    typeNamespace: "com.test",
    typeName: "section",
    displayLabel,
    ...(sectionContainerId !== undefined && { sectionContainerId }),
  });

  it("calls repository_navigation and returns normalised RepositoryNavigation", () => {
    const rawNav = {
      rootContainerId: "root-c-1",
      identity: rawNode("id-1", "Example Governance"),
      sections: [
        rawNode("s-1", "Articles", "c-articles"),
        rawNode("s-2", "Decision Log", "c-decisions"),
      ],
      diagnostics: [],
    };
    const spy = vi.fn().mockReturnValue(rawNav);
    const repo = mockRepo({ repository_navigation: spy });

    const result = repositoryNavigation(repo);

    expect(spy).toHaveBeenCalledOnce();
    expect(result.rootContainerId).toBe("root-c-1");
    expect(result.identity.instanceId).toBe("id-1");
    expect(result.identity.displayLabel).toBe("Example Governance");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].displayLabel).toBe("Articles");
    expect(result.sections[0].sectionContainerId).toBe("c-articles");
    expect(result.sections[1].displayLabel).toBe("Decision Log");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("normalises snake_case NavigationNode fields from WASM", () => {
    const rawNav = {
      root_container_id: "root-c-2",
      identity: {
        instance_id: "id-2",
        type_id: "type-id-2",
        type_version: 1,
        type_namespace: "com.test",
        type_name: "gov-repo",
        display_label: "Governance Repo",
      },
      sections: [
        {
          instance_id: "s-3",
          type_id: "type-s-3",
          type_version: 1,
          type_namespace: "com.test",
          type_name: "Articles",
          display_label: "Articles",
          section_container_id: "c-articles-2",
        },
      ],
      diagnostics: [],
    };
    const repo = mockRepo({ repository_navigation: () => rawNav });

    const result = repositoryNavigation(repo);

    expect(result.rootContainerId).toBe("root-c-2");
    expect(result.identity.instanceId).toBe("id-2");
    expect(result.identity.displayLabel).toBe("Governance Repo");
    expect(result.sections[0].instanceId).toBe("s-3");
    expect(result.sections[0].sectionContainerId).toBe("c-articles-2");
  });

  it("returns empty sections and diagnostic for pre-RFC-013 repo (no manifest.container)", () => {
    const rawNav = {
      rootContainerId: "",
      identity: { instanceId: "", typeId: "", typeVersion: 0, typeNamespace: "", typeName: "", displayLabel: "" },
      sections: [],
      diagnostics: ["repository-navigation: manifest.container is absent; repo predates RFC-013 root container (epic #95)"],
    };
    const repo = mockRepo({ repository_navigation: () => rawNav });

    const result = repositoryNavigation(repo);

    expect(result.sections).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toContain("manifest.container is absent");
  });

  it("sectionContainerId is undefined when absent on a section node", () => {
    const rawNav = {
      rootContainerId: "r",
      identity: rawNode("id-x", "X"),
      sections: [rawNode("s-no-container", "Orphan Section")],
      diagnostics: [],
    };
    const repo = mockRepo({ repository_navigation: () => rawNav });

    const result = repositoryNavigation(repo);

    expect(result.sections[0].sectionContainerId).toBeUndefined();
  });

  it("propagates WASM throw", () => {
    const repo = mockRepo({ repository_navigation: () => { throw new Error("nav failed"); } });
    expect(() => repositoryNavigation(repo)).toThrow("nav failed");
  });
});
