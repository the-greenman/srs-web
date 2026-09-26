/**
 * Unit tests for document-model.ts (srs-web#322):
 * - blueprintForComposition: UUID-chain-join matching, reusing documentViewsForBlueprint
 * - componentTypes: union of every ordered relation-group property's oneOf items
 * - loadDocument: container resolution + precedes-ordered block list
 */

import { describe, expect, it } from "vitest";
import {
  blueprintForComposition,
  componentTypes,
  loadDocument,
  typeNameLabel,
} from "../src/lib/editor/document-model.js";
import type {
  BlueprintListResult,
  BlueprintSummary,
  DocumentViewSummary,
  SrsRepository,
} from "../src/lib/srs-client.js";

const ROOT_TYPE = "11111111-0000-4000-8000-000000000001";
const OTHER_ROOT_TYPE = "22222222-0000-4000-8000-000000000002";
const HERO_TYPE = "33333333-0000-4000-8000-000000000003";
const PROSE_TYPE = "44444444-0000-4000-8000-000000000004";
const FEATURE_TYPE = "55555555-0000-4000-8000-000000000005";

function blueprintSummary(id: string): BlueprintSummary {
  return { id, namespace: "com.example", name: "page", version: 1, description: "", rootTypeCount: 1 };
}

/** Build a fake repo implementing only the methods document-model.ts calls. */
function fakeRepo(overrides: Partial<SrsRepository> = {}): SrsRepository {
  const notMocked = (name: string) => () => {
    throw new Error(`not mocked: ${name}`);
  };
  const base = {
    list_blueprints: notMocked("list_blueprints"),
    blueprint_schema: notMocked("blueprint_schema"),
    list_types: notMocked("list_types"),
    list_containers: notMocked("list_containers"),
    resolve_container_view: notMocked("resolve_container_view"),
    order_by_precedes: notMocked("order_by_precedes"),
  };
  return { ...base, ...overrides } as unknown as SrsRepository;
}

// ---------------------------------------------------------------------------
// blueprintForComposition
// ---------------------------------------------------------------------------

describe("blueprintForComposition", () => {
  const bpMatch = blueprintSummary("bp-match");
  const bpOther = blueprintSummary("bp-other");

  function repoWithBlueprints(): SrsRepository {
    return fakeRepo({
      list_blueprints: () => ({ summaries: [bpOther, bpMatch] }) as BlueprintListResult,
      blueprint_schema: (blueprintId: string) => {
        const rootType = blueprintId === bpMatch.id ? ROOT_TYPE : OTHER_ROOT_TYPE;
        return { schema: { properties: { root: { $ref: `#/definitions/${rootType}` } }, definitions: {} }, diagnostics: [] };
      },
    });
  }

  it("returns the blueprint whose root type matches the composition's rootTypeRefs", () => {
    const composition: DocumentViewSummary = {
      id: "comp-1",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      rootTypeRefs: [{ typeId: ROOT_TYPE, typeVersion: 1 }],
    };
    const found = blueprintForComposition(repoWithBlueprints(), composition);
    expect(found?.id).toBe(bpMatch.id);
  });

  it("returns null when no installed blueprint's root type matches", () => {
    const composition: DocumentViewSummary = {
      id: "comp-2",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      rootTypeRefs: [{ typeId: "no-such-type", typeVersion: 1 }],
    };
    expect(blueprintForComposition(repoWithBlueprints(), composition)).toBeNull();
  });

  it("returns null when the composition declares no rootTypeRefs", () => {
    const composition: DocumentViewSummary = {
      id: "comp-3",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
    };
    expect(blueprintForComposition(repoWithBlueprints(), composition)).toBeNull();
  });

  it("skips a blueprint whose schema fails to resolve rather than throwing", () => {
    const repo = fakeRepo({
      list_blueprints: () => ({ summaries: [bpMatch] }) as BlueprintListResult,
      blueprint_schema: () => {
        throw new Error("malformed blueprint");
      },
    });
    const composition: DocumentViewSummary = {
      id: "comp-4",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      rootTypeRefs: [{ typeId: ROOT_TYPE, typeVersion: 1 }],
    };
    expect(blueprintForComposition(repo, composition)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// componentTypes — inheritance schema (RFC-041 oneOf expansion)
// ---------------------------------------------------------------------------

describe("componentTypes", () => {
  it("unions every ordered relation-group property's oneOf items, deduplicated, labelled from listTypes", () => {
    const repo = fakeRepo({
      blueprint_schema: () => ({
        schema: {
          properties: {
            root: { $ref: `#/definitions/${ROOT_TYPE}` },
            // `contains` groups the page's direct children (RFC-041 oneOf expansion over extendsTypeId).
            contains: { items: { oneOf: [{ $ref: `#/definitions/${HERO_TYPE}` }, { $ref: `#/definitions/${PROSE_TYPE}` }] } },
            // `precedes` includes source types too — same PROSE_TYPE appears in both groups.
            precedes: { items: { oneOf: [{ $ref: `#/definitions/${PROSE_TYPE}` }, { $ref: `#/definitions/${FEATURE_TYPE}` }] } },
          },
          definitions: {},
        },
        diagnostics: [],
      }),
      list_types: () => [
        { id: HERO_TYPE, namespace: "com.example", name: "hero", version: 2, description: "Hero banner" },
        { id: PROSE_TYPE, namespace: "com.example", name: "prose", version: 1 },
        { id: FEATURE_TYPE, namespace: "com.example", name: "feature", version: 3, description: "Feature card" },
      ],
    });

    const types = componentTypes(repo, blueprintSummary("bp"));

    expect(types.map((t) => t.typeId).sort()).toEqual([FEATURE_TYPE, HERO_TYPE, PROSE_TYPE].sort());
    expect(types.find((t) => t.typeId === PROSE_TYPE)).toBeDefined();
    // deduplicated — prose appears in two groups but only once in the result
    expect(types.filter((t) => t.typeId === PROSE_TYPE)).toHaveLength(1);
    // label is the humanised type name; description rides along as a hint
    expect(types.find((t) => t.typeId === HERO_TYPE)?.label).toBe("Hero");
    expect(types.find((t) => t.typeId === HERO_TYPE)?.description).toBe("Hero banner");
    expect(types.find((t) => t.typeId === PROSE_TYPE)?.label).toBe("Prose");
    // typeVersion resolved from listTypes()
    expect(types.find((t) => t.typeId === FEATURE_TYPE)?.typeVersion).toBe(3);
  });

  it("humanises dotted and kebab type names", () => {
    expect(typeNameLabel("homepage-hero")).toBe("Homepage hero");
    expect(typeNameLabel("section.text")).toBe("Section text");
  });

  it("excludes the root property from the union", () => {
    const repo = fakeRepo({
      blueprint_schema: () => ({
        schema: {
          properties: { root: { $ref: `#/definitions/${ROOT_TYPE}` } },
          definitions: {},
        },
        diagnostics: [],
      }),
      list_types: () => [],
    });

    expect(componentTypes(repo, blueprintSummary("bp"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadDocument — container resolution + precedes ordering
// ---------------------------------------------------------------------------

describe("loadDocument", () => {
  function member(instanceId: string, tier: number, typeId = HERO_TYPE) {
    return {
      instanceId,
      tier,
      displayLabel: `Label ${instanceId}`,
      record: { instanceId, typeId, typeVersion: 1, fieldValues: {} },
    };
  }

  it("resolves a fixed container-subset containerId from the composition's sections", () => {
    const root = member("root-1", 0);
    const a = member("a", 1);
    const b = member("b", 1);
    const repo = fakeRepo({
      resolve_container_view: (containerId: string) => {
        expect(containerId).toBe("container-fixed");
        return { containerId, root, members: [root, a, b], columns: [], excludeLifecycleStates: [], diagnostics: [] };
      },
      order_by_precedes: (inputJson: string) => {
        const { instanceIds } = JSON.parse(inputJson);
        expect(new Set(instanceIds)).toEqual(new Set(["a", "b"]));
        return { orderedIds: ["b", "a"] };
      },
    });

    const composition = {
      id: "comp",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      createdAt: "",
      sections: [
        { sectionId: "s1", order: 0, source: { type: "container-subset", containerId: "container-fixed" } },
      ],
    };

    const doc = loadDocument(repo, composition);

    expect(doc?.containerId).toBe("container-fixed");
    expect(doc?.blocks.map((b) => b.instanceId)).toEqual(["b", "a"]);
    expect(doc?.root?.instanceId).toBe("root-1");
  });

  it("falls back to resolving a container by matching rootTypeRefs when no fixed containerId is declared", () => {
    const root = member("root-2", 0, ROOT_TYPE);
    const repo = fakeRepo({
      list_containers: () => [{ containerId: "c-other" }, { containerId: "c-match" }],
      resolve_container_view: (containerId: string) => {
        if (containerId === "c-other") {
          return { containerId, root: member("x", 0, OTHER_ROOT_TYPE), members: [], columns: [], excludeLifecycleStates: [], diagnostics: [] };
        }
        return { containerId, root, members: [root], columns: [], excludeLifecycleStates: [], diagnostics: [] };
      },
      order_by_precedes: () => ({ orderedIds: [] }),
    });

    const composition: DocumentViewSummary = {
      id: "comp",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      rootTypeRefs: [{ typeId: ROOT_TYPE, typeVersion: 1 }],
    };

    const doc = loadDocument(repo, composition);

    expect(doc?.containerId).toBe("c-match");
    expect(doc?.blocks).toEqual([]);
  });

  it("returns null when neither a fixed containerId nor a matching root-type container resolves", () => {
    const repo = fakeRepo({ list_containers: () => [] });
    const composition: DocumentViewSummary = {
      id: "comp",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      rootTypeRefs: [{ typeId: ROOT_TYPE, typeVersion: 1 }],
    };
    expect(loadDocument(repo, composition)).toBeNull();
  });
});
