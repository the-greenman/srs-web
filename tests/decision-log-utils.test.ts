/**
 * Unit tests for decision-log-utils.ts — pure helpers for DecisionLogView.
 *
 * Tests verify:
 *   - computeSearchHitIds: calls find() with contentMatch, returns hit ID set,
 *     returns null for empty query or absent repo
 *   - sortByCreatedAt: newest-first / oldest-first ISO 8601 ordering
 */

import { describe, expect, it, vi } from "vitest";
import type { SrsRepository, SrsRecord } from "../src/lib/srs-client.js";
import { computeSearchHitIds, matchesTopicFilter, sortByCreatedAt } from "../src/lib/components/decision-log-utils.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

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
  };
  return { ...base, ...overrides };
}

function makeRecord(instanceId: string, createdAt: string): SrsRecord {
  return { instanceId, typeId: "t1", typeVersion: 1, fieldValues: [], createdAt };
}

// ---------------------------------------------------------------------------
// matchesTopicFilter
// ---------------------------------------------------------------------------

describe("matchesTopicFilter", () => {
  function makeTaggedRecord(tags: string[]): SrsRecord {
    return { instanceId: "i1", typeId: "t1", typeVersion: 1, fieldValues: [], tags };
  }

  it("returns true for topicFilter 'all' regardless of tags", () => {
    expect(matchesTopicFilter(makeTaggedRecord([]), "all")).toBe(true);
    expect(matchesTopicFilter(makeTaggedRecord(["exhibitions"]), "all")).toBe(true);
  });

  it("returns true when the record has the matching tag", () => {
    expect(matchesTopicFilter(makeTaggedRecord(["exhibitions", "governance"]), "exhibitions")).toBe(true);
  });

  it("returns false when the record does not have the tag", () => {
    expect(matchesTopicFilter(makeTaggedRecord(["governance"]), "exhibitions")).toBe(false);
  });

  it("returns false when the record has no tags", () => {
    expect(matchesTopicFilter(makeTaggedRecord([]), "exhibitions")).toBe(false);
  });

  it("returns false when record.tags is undefined", () => {
    const record: SrsRecord = { instanceId: "i1", typeId: "t1", typeVersion: 1, fieldValues: [] };
    expect(matchesTopicFilter(record, "exhibitions")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeSearchHitIds
// ---------------------------------------------------------------------------

describe("computeSearchHitIds", () => {
  it("calls find with contentMatch and returns a Set of matching instanceIds", () => {
    const rawResult = {
      hits: [
        { instanceId: "inst-001", label: "D1", typeNamespace: "com.test", typeName: "decision", matchedFields: [] },
        { instanceId: "inst-002", label: "D2", typeNamespace: "com.test", typeName: "decision", matchedFields: [] },
      ],
      total: 2,
      diagnostics: [],
    };
    const spy = vi.fn().mockReturnValue(rawResult);
    const repo = mockRepo({ find: spy });

    const result = computeSearchHitIds(repo, "foo");

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ contentMatch: "foo" }));
    expect(result).toBeInstanceOf(Set);
    expect(result?.has("inst-001")).toBe(true);
    expect(result?.has("inst-002")).toBe(true);
    expect(result?.size).toBe(2);
  });

  it("trims the query before passing to find", () => {
    const spy = vi.fn().mockReturnValue({ hits: [], total: 0, diagnostics: [] });
    const repo = mockRepo({ find: spy });

    computeSearchHitIds(repo, "  bar  ");

    expect(spy).toHaveBeenCalledWith(JSON.stringify({ contentMatch: "bar" }));
  });

  it("returns null and does NOT call find when searchQuery is empty", () => {
    const spy = vi.fn();
    const repo = mockRepo({ find: spy });

    const result = computeSearchHitIds(repo, "");

    expect(spy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("returns null and does NOT call find when searchQuery is whitespace only", () => {
    const spy = vi.fn();
    const repo = mockRepo({ find: spy });

    const result = computeSearchHitIds(repo, "   ");

    expect(spy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("returns null when repo is undefined", () => {
    const result = computeSearchHitIds(undefined, "something");
    expect(result).toBeNull();
  });

  it("returns an empty Set when find returns no hits", () => {
    const repo = mockRepo({ find: () => ({ hits: [], total: 0, diagnostics: [] }) });

    const result = computeSearchHitIds(repo, "noresults");

    expect(result).toBeInstanceOf(Set);
    expect(result?.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sortByCreatedAt
// ---------------------------------------------------------------------------

describe("sortByCreatedAt", () => {
  const records = [
    makeRecord("inst-a", "2026-01-03T10:00:00Z"),
    makeRecord("inst-b", "2026-01-01T10:00:00Z"),
    makeRecord("inst-c", "2026-01-02T10:00:00Z"),
  ];

  it("returns newest-first by default", () => {
    const sorted = sortByCreatedAt(records, "newest");
    expect(sorted.map((r) => r.instanceId)).toEqual(["inst-a", "inst-c", "inst-b"]);
  });

  it("returns oldest-first when order is oldest", () => {
    const sorted = sortByCreatedAt(records, "oldest");
    expect(sorted.map((r) => r.instanceId)).toEqual(["inst-b", "inst-c", "inst-a"]);
  });

  it("does not mutate the input array", () => {
    const input = [...records];
    sortByCreatedAt(input, "newest");
    expect(input.map((r) => r.instanceId)).toEqual(["inst-a", "inst-b", "inst-c"]);
  });

  it("handles records with missing createdAt (treated as empty string, sorts last in newest-first)", () => {
    const withMissing = [
      makeRecord("inst-dated", "2026-01-01T10:00:00Z"),
      { instanceId: "inst-nodates", typeId: "t1", typeVersion: 1, fieldValues: [] } as SrsRecord,
    ];
    const sorted = sortByCreatedAt(withMissing, "newest");
    expect(sorted[0].instanceId).toBe("inst-dated");
    expect(sorted[1].instanceId).toBe("inst-nodates");
  });

  it("is stable for equal createdAt values", () => {
    const equalDates = [
      makeRecord("inst-x", "2026-01-01T10:00:00Z"),
      makeRecord("inst-y", "2026-01-01T10:00:00Z"),
    ];
    const sorted = sortByCreatedAt(equalDates, "newest");
    expect(sorted.map((r) => r.instanceId)).toEqual(["inst-x", "inst-y"]);
  });
});
