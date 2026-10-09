/**
 * Unit tests for document-model.ts (srs-web#322):
 * - blueprintForComposition: UUID-chain-join matching, reusing documentViewsForBlueprint
 * - componentTypes: union of every ordered relation-group property's oneOf items,
 *   minus types that are only ever a `contains`-child of a non-root parent (step 4)
 * - childTypes: per-parent `contains` targets, inheritance-expanded on both sides
 * - loadDocument: container resolution + block tree taken from the JSON projection (step 3)
 */

import { describe, expect, it } from "vitest";
import {
  blueprintForComposition,
  childTypes,
  componentTypes,
  loadDocument,
} from "../src/lib/editor/document-model.js";
import { humanise } from "../src/lib/labels.js";
import type {
  BlueprintListResult,
  BlueprintSummary,
  DocumentViewSummary,
  ProjectedRecord,
  RelationSpec,
  SrsRepository,
} from "../src/lib/srs-client.js";

const ROOT_TYPE = "11111111-0000-4000-8000-000000000001";
const OTHER_ROOT_TYPE = "22222222-0000-4000-8000-000000000002";
const HERO_TYPE = "33333333-0000-4000-8000-000000000003";
const PROSE_TYPE = "44444444-0000-4000-8000-000000000004";
const FEATURE_TYPE = "55555555-0000-4000-8000-000000000005";
const FEATURE_GROUP_TYPE = "66666666-0000-4000-8000-000000000006";

function blueprintSummary(id: string): BlueprintSummary {
  return {
    id,
    namespace: "com.example",
    name: "page",
    version: 1,
    description: "",
    rootTypeCount: 1,
  };
}

/** Build a fake repo implementing only the methods document-model.ts calls. */
function fakeRepo(overrides: Partial<SrsRepository> = {}): SrsRepository {
  const notMocked = (name: string) => () => {
    throw new Error(`not mocked: ${name}`);
  };
  const base = {
    list_blueprints: notMocked("list_blueprints"),
    blueprint_schema: notMocked("blueprint_schema"),
    list_blueprint_structure: () => [] as RelationSpec[],
    list_types: notMocked("list_types"),
    list_containers: notMocked("list_containers"),
    resolve_container_view: notMocked("resolve_container_view"),
    render_composition: notMocked("render_composition"),
    get_type: () => null,
  };
  return { ...base, ...overrides } as unknown as SrsRepository;
}

function projectedRecord(
  instanceId: string,
  typeId: string,
  children: ProjectedRecord[] = []
): ProjectedRecord {
  return {
    instanceId,
    typeId,
    typeVersion: 1,
    typeNamespace: "com.example",
    typeName: "block",
    fields: {},
    orderedFieldKeys: [],
    ...(children.length > 0 ? { children } : {}),
  };
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
        return {
          schema: { properties: { root: { $ref: `#/definitions/${rootType}` } }, definitions: {} },
          diagnostics: [],
        };
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
// componentTypes — inheritance schema (RFC-041 oneOf expansion) + step 4 exclusion
// ---------------------------------------------------------------------------

describe("componentTypes", () => {
  function schemaRepo(overrides: Partial<SrsRepository> = {}): SrsRepository {
    return fakeRepo({
      blueprint_schema: () => ({
        schema: {
          properties: {
            root: { $ref: `#/definitions/${ROOT_TYPE}` },
            // `contains` groups the page's direct children (RFC-041 oneOf expansion over extendsTypeId).
            contains: {
              items: {
                oneOf: [
                  { $ref: `#/definitions/${HERO_TYPE}` },
                  { $ref: `#/definitions/${PROSE_TYPE}` },
                ],
              },
            },
            // `precedes` includes source types too — same PROSE_TYPE appears in both groups.
            precedes: {
              items: {
                oneOf: [
                  { $ref: `#/definitions/${PROSE_TYPE}` },
                  { $ref: `#/definitions/${FEATURE_TYPE}` },
                ],
              },
            },
          },
          definitions: {},
        },
        diagnostics: [],
      }),
      list_types: () => [
        {
          id: HERO_TYPE,
          namespace: "com.example",
          name: "hero",
          version: 2,
          description: "Hero banner",
        },
        { id: PROSE_TYPE, namespace: "com.example", name: "prose", version: 1 },
        {
          id: FEATURE_TYPE,
          namespace: "com.example",
          name: "feature",
          version: 3,
          description: "Feature card",
        },
      ],
      ...overrides,
    });
  }

  it("unions every ordered relation-group property's oneOf items, deduplicated, labelled from listTypes", () => {
    const types = componentTypes(schemaRepo(), blueprintSummary("bp"));

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
    expect(humanise("homepage-hero")).toBe("Homepage hero");
    expect(humanise("section.text")).toBe("Section text");
  });

  it("hides an abstract base that an offered type extends", () => {
    const repo = fakeRepo({
      blueprint_schema: () => ({
        schema: {
          properties: {
            precedes: {
              items: {
                oneOf: [
                  { $ref: `#/definitions/${ROOT_TYPE}` },
                  { $ref: `#/definitions/${HERO_TYPE}` },
                ],
              },
            },
          },
          definitions: {},
        },
        diagnostics: [],
      }),
      list_types: () => [
        { id: ROOT_TYPE, namespace: "com.example", name: "section", version: 1 },
        { id: HERO_TYPE, namespace: "com.example", name: "hero", version: 1 },
      ],
      get_type: (id: string) => (id === HERO_TYPE ? { id, extendsTypeId: ROOT_TYPE } : { id }),
    });
    expect(componentTypes(repo, blueprintSummary("bp")).map((t) => t.typeId)).toEqual([HERO_TYPE]);
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

  it("excludes a type that is only ever a contains-child of a non-root parent (srs-web#322 step 4)", () => {
    // FEATURE_TYPE is offered by the `precedes` group's oneOf, but the blueprint's
    // structure declares it a contains-child of FEATURE_GROUP_TYPE (not the root) —
    // it must not appear in the top-level picker.
    const repo = schemaRepo({
      list_blueprint_structure: () => [
        { relationType: "contains", sourceTypeId: FEATURE_GROUP_TYPE, targetTypeId: FEATURE_TYPE },
      ],
    });
    const types = componentTypes(repo, blueprintSummary("bp"));
    expect(types.map((t) => t.typeId)).not.toContain(FEATURE_TYPE);
    expect(types.map((t) => t.typeId).sort()).toEqual([HERO_TYPE, PROSE_TYPE].sort());
  });

  it("keeps a type whose only declared contains-parent is the blueprint's own root type (guide root→sections)", () => {
    const repo = schemaRepo({
      list_blueprint_structure: () => [
        { relationType: "contains", sourceTypeId: ROOT_TYPE, targetTypeId: HERO_TYPE },
      ],
    });
    const types = componentTypes(repo, blueprintSummary("bp"));
    expect(types.map((t) => t.typeId)).toContain(HERO_TYPE);
  });
});

// ---------------------------------------------------------------------------
// childTypes — per-parent contains targets (srs-web#322 step 4)
// ---------------------------------------------------------------------------

describe("childTypes", () => {
  it("returns contains-targets whose source is the parent type, expanded to the target's own subtypes", () => {
    const CARD_SUBTYPE = "77777777-0000-4000-8000-000000000007";
    const repo = fakeRepo({
      list_blueprint_structure: () => [
        { relationType: "contains", sourceTypeId: FEATURE_GROUP_TYPE, targetTypeId: FEATURE_TYPE },
      ],
      list_types: () => [
        { id: FEATURE_TYPE, namespace: "com.example", name: "feature", version: 1 },
        { id: CARD_SUBTYPE, namespace: "com.example", name: "feature-highlight", version: 1 },
      ],
      get_type: (id: string) =>
        id === CARD_SUBTYPE ? { id, extendsTypeId: FEATURE_TYPE } : { id },
    });

    const types = childTypes(repo, blueprintSummary("bp"), FEATURE_GROUP_TYPE);
    expect(types.map((t) => t.typeId).sort()).toEqual([CARD_SUBTYPE, FEATURE_TYPE].sort());
  });

  it("matches a spec whose source is an ancestor of the parent type (inheritance on the source side)", () => {
    const GROUP_SUBTYPE = "88888888-0000-4000-8000-000000000008";
    const repo = fakeRepo({
      list_blueprint_structure: () => [
        { relationType: "contains", sourceTypeId: FEATURE_GROUP_TYPE, targetTypeId: FEATURE_TYPE },
      ],
      list_types: () => [
        { id: FEATURE_TYPE, namespace: "com.example", name: "feature", version: 1 },
      ],
      get_type: (id: string) =>
        id === GROUP_SUBTYPE ? { id, extendsTypeId: FEATURE_GROUP_TYPE } : { id },
    });

    // GROUP_SUBTYPE extends FEATURE_GROUP_TYPE, so it inherits the same contains spec.
    const types = childTypes(repo, blueprintSummary("bp"), GROUP_SUBTYPE);
    expect(types.map((t) => t.typeId)).toEqual([FEATURE_TYPE]);
  });

  it("returns an empty list for a leaf type with no declared contains spec", () => {
    const repo = fakeRepo({ list_blueprint_structure: () => [], list_types: () => [] });
    expect(childTypes(repo, blueprintSummary("bp"), HERO_TYPE)).toEqual([]);
  });

  it("ignores non-contains relation specs", () => {
    const repo = fakeRepo({
      list_blueprint_structure: () => [
        { relationType: "precedes", sourceTypeId: FEATURE_GROUP_TYPE, targetTypeId: FEATURE_TYPE },
      ],
      list_types: () => [
        { id: FEATURE_TYPE, namespace: "com.example", name: "feature", version: 1 },
      ],
    });
    expect(childTypes(repo, blueprintSummary("bp"), FEATURE_GROUP_TYPE)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadDocument — container resolution + block tree from the JSON projection
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

  it("resolves a fixed container-subset containerId and takes order + nesting from the JSON projection", () => {
    const root = member("root-1", 0);
    const repo = fakeRepo({
      resolve_container_view: (containerId: string) => {
        expect(containerId).toBe("container-fixed");
        return {
          containerId,
          root,
          members: [root],
          columns: [],
          excludeLifecycleStates: [],
          diagnostics: [],
        };
      },
      render_composition: (viewId: string, format: string, containerId?: string | null) => {
        expect(viewId).toBe("comp");
        expect(format).toBe("json");
        expect(containerId).toBe("container-fixed");
        return {
          rendered: "{}",
          diagnostics: [],
          projection: {
            $schema: "",
            compositionId: "comp",
            containerId: "container-fixed",
            generatedAt: "",
            containerTitle: "Page",
            sections: [
              {
                sectionId: "s1",
                order: 0,
                // Group "b" nests card "b1" — the same shape the HTML preview nests under it.
                records: [
                  projectedRecord("b", FEATURE_GROUP_TYPE, [projectedRecord("b1", FEATURE_TYPE)]),
                  projectedRecord("a", HERO_TYPE),
                ],
              },
            ],
          },
        };
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
        {
          sectionId: "s1",
          order: 0,
          source: { type: "container-subset", containerId: "container-fixed" },
        },
      ],
    };

    const doc = loadDocument(repo, composition);

    expect(doc?.containerId).toBe("container-fixed");
    // Top-level order is exactly the projection's own order — "b" (the group) before "a".
    expect(doc?.blocks.map((b) => b.instanceId)).toEqual(["b", "a"]);
    // The group's child is nested under it, not flattened to the top level.
    expect(doc?.blocks[0].children.map((c) => c.instanceId)).toEqual(["b1"]);
    expect(doc?.blocks[1].children).toEqual([]);
    expect(doc?.root?.instanceId).toBe("root-1");
  });

  it("excludes the container's own root/anchor record from the block tree (it renders separately as the page-root form)", () => {
    const root = member("root-1", 0);
    const repo = fakeRepo({
      resolve_container_view: (containerId: string) => ({
        containerId,
        root,
        members: [root],
        columns: [],
        excludeLifecycleStates: [],
        diagnostics: [],
      }),
      render_composition: () => ({
        rendered: "{}",
        diagnostics: [],
        projection: {
          $schema: "",
          compositionId: "comp",
          containerId: "container-fixed",
          generatedAt: "",
          containerTitle: "Page",
          // The engine's own projection includes the root record among the
          // section's top-level records (it is a direct container member).
          sections: [
            {
              sectionId: "s1",
              order: 0,
              records: [projectedRecord("root-1", ROOT_TYPE), projectedRecord("a", HERO_TYPE)],
            },
          ],
        },
      }),
    });
    const composition = {
      id: "comp",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      createdAt: "",
      sections: [
        {
          sectionId: "s1",
          order: 0,
          source: { type: "container-subset", containerId: "container-fixed" },
        },
      ],
    };

    const doc = loadDocument(repo, composition);
    expect(doc?.blocks.map((b) => b.instanceId)).toEqual(["a"]);
  });

  it("falls back to resolving a container by matching rootTypeRefs when no fixed containerId is declared", () => {
    const root = member("root-2", 0, ROOT_TYPE);
    const repo = fakeRepo({
      list_containers: () => [{ containerId: "c-other" }, { containerId: "c-match" }],
      compositions_for_container: () => [],
      resolve_container_view: (containerId: string) => {
        if (containerId === "c-other") {
          return {
            containerId,
            root: member("x", 0, OTHER_ROOT_TYPE),
            members: [],
            columns: [],
            excludeLifecycleStates: [],
            diagnostics: [],
          };
        }
        return {
          containerId,
          root,
          members: [root],
          columns: [],
          excludeLifecycleStates: [],
          diagnostics: [],
        };
      },
      render_composition: () => ({ rendered: "{}", diagnostics: [], projection: null }),
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

  it("skips a container whose root is a Tier-0 note (no record) while matching by rootTypeRefs (srs-web#483)", () => {
    const root = member("root-3", 0, ROOT_TYPE);
    const note = { instanceId: "n1", tier: 0, displayLabel: "A note" };
    const view = (containerId: string, r: unknown) => ({
      containerId,
      root: r,
      members: [r, note],
      columns: [],
      excludeLifecycleStates: [],
      diagnostics: [],
    });
    const repo = fakeRepo({
      list_containers: () => [{ containerId: "c-note" }, { containerId: "c-match" }],
      compositions_for_container: () => [],
      resolve_container_view: (id: string) => view(id, id === "c-note" ? note : root),
      render_composition: () => ({ rendered: "{}", diagnostics: [], projection: null }),
    });
    const composition: DocumentViewSummary = {
      id: "comp",
      namespace: "com.example",
      name: "page",
      version: 1,
      description: "",
      rootTypeRefs: [{ typeId: ROOT_TYPE, typeVersion: 1 }],
    };

    expect(loadDocument(repo, composition)?.containerId).toBe("c-match");
  });

  it("resolves a summary's own container-subset container, not the first sibling sharing its root type", () => {
    // Two homepage variants share a root type; the summary (from listDocumentViews)
    // carries no sections, so the full composition must be recovered to pick B's container.
    const rootA = member("root-a", 0, ROOT_TYPE);
    const rootB = member("root-b", 0, ROOT_TYPE);
    const variantB = {
      id: "comp-b",
      namespace: "com.example",
      name: "variant-b",
      version: 1,
      description: "",
      createdAt: "",
      rootTypeRefs: [{ typeId: ROOT_TYPE, typeVersion: 1 }],
      sections: [
        { sectionId: "page", order: 0, source: { type: "container-subset", containerId: "c-b" } },
      ],
    };
    const repo = fakeRepo({
      list_containers: () => [{ containerId: "c-a" }, { containerId: "c-b" }],
      compositions_for_container: (containerId: string) =>
        containerId === "c-b" ? [variantB] : [],
      resolve_container_view: (containerId: string) => {
        const root = containerId === "c-a" ? rootA : rootB;
        return {
          containerId,
          root,
          members: [root],
          columns: [],
          excludeLifecycleStates: [],
          diagnostics: [],
        };
      },
      render_composition: () => ({ rendered: "{}", diagnostics: [], projection: null }),
    });
    const summary: DocumentViewSummary = {
      id: "comp-b",
      namespace: "com.example",
      name: "variant-b",
      version: 1,
      description: "",
      rootTypeRefs: [{ typeId: ROOT_TYPE, typeVersion: 1 }],
    };

    const doc = loadDocument(repo, summary);

    expect(doc?.containerId).toBe("c-b");
    expect(doc?.root?.instanceId).toBe("root-b");
  });

  it("returns null when neither a fixed containerId nor a matching root-type container resolves", () => {
    const repo = fakeRepo({ list_containers: () => [], compositions_for_container: () => [] });
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
