/**
 * Lens — presentation-only wiring that says how the three panes (Collection, Focus, Context)
 * are populated and labelled for one way of looking at a repository (plans/ux-lenses.md §2).
 * No SRS semantics: every id here names an engine object the WASM bindings already resolve.
 */
import {
  type SrsRepository,
  find,
  listDocumentViews,
  listRelationTypes,
  listRelations,
  repositoryNavigation,
} from "$lib/srs-client.js";
import type { By, CtxBy } from "./lens-distinctions.js";

export type Layout = "trail" | "reader" | "board" | "graph";

export type Collection =
  /** A container's members in arranged order with depth; `also` adds sibling containers (board columns). */
  | { kind: "outline"; containerId: string; also?: string[] }
  /** A composition's sections, each listing its container's members. */
  | { kind: "composition"; compositionId: string }
  /** Every record of a type. */
  | { kind: "type"; typeId: string }
  /** A hand-drawn set ("My set"): these records, in this order. */
  | { kind: "ids"; ids: string[] }
  /** The root container's navigation sections. */
  | { kind: "navigation" }
  /** Everything: `find` over the repository. */
  | { kind: "find" };

/**
 * How Focus starts (switchable in its header). "read" = one record as prose. "document" = the whole set
 * as one continuous read: rendered from a composition when `compositionId` is set or the collection is
 * the navigation (site pages, spec Parts), else composed from the Collection's records (highlightable).
 */
export type Focus = { kind: "read" } | { kind: "document"; compositionId?: string };

export interface ContextGroupDef {
  label: string;
  relationType: string;
  /** Relative to the selected record: "in" = the neighbour points at it. */
  direction: "in" | "out";
  /** Only neighbours of these types, as `namespace/name` (presentation filter, see loadGroup). */
  types?: string[];
}

export interface Lens {
  id: string;
  label: string;
  collection: Collection;
  focus: Focus;
  /** Empty = the repository defaults (every used relation type, both directions). */
  context: ContextGroupDef[];
  layout: Layout;
  /** Table columns (board) by field name; else the container view's columns or the type's first fields. */
  columns?: string[];
  /** Default "Tell apart by" for the Collection (lens-distinctions.ts); else nesting for outlines, type otherwise. */
  by?: By;
  /** Default "Tell apart by" for Context. */
  ctxBy?: CtxBy;
}

const ctx = (
  label: string,
  relationType: string,
  direction: "in" | "out",
  types?: string[]
): ContextGroupDef => ({ label, relationType, direction, types });

/** A relation type key in user words: the `name` part, title-cased; never the namespace. */
export const relationLabel = (key: string): string =>
  key
    .slice(key.lastIndexOf("/") + 1)
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** The repository defaults: every installed relation type with at least one relation, both ways. */
export function defaultContext(repo: SrsRepository): ContextGroupDef[] {
  // ponytail: counts every relation once per load; a per-type count binding would avoid the full read.
  const used = new Map<string, number>();
  for (const r of listRelations(repo))
    used.set(r.relationType, (used.get(r.relationType) ?? 0) + 1);
  return listRelationTypes(repo)
    .filter((t) => (used.get(t.key) ?? 0) > 0)
    .sort((a, b) => (used.get(b.key) ?? 0) - (used.get(a.key) ?? 0))
    .flatMap((t) => {
      const l = relationLabel(t.key);
      return [ctx(`${l} →`, t.key, "out"), ctx(`← ${l}`, t.key, "in")];
    });
}

/** One lens per navigation section, composition and used type, plus Everything. Labels are resolved titles. */
export function deriveLenses(repo: SrsRepository): Lens[] {
  const out: Lens[] = [];
  try {
    for (const s of repositoryNavigation(repo).sections) {
      if (s.sectionContainerId && (s.depth ?? 0) === 0)
        out.push({
          id: `nav:${s.sectionContainerId}`,
          label: s.displayLabel,
          collection: { kind: "outline", containerId: s.sectionContainerId },
          focus: { kind: "read" },
          context: [],
          layout: "trail",
        });
    }
  } catch {
    // A pre-RFC-013 repository has no navigation; the type lenses still work.
  }
  for (const c of listDocumentViews(repo))
    out.push({
      id: `comp:${c.id}`,
      label: c.description || c.name,
      collection: { kind: "composition", compositionId: c.id },
      focus: { kind: "document", compositionId: c.id },
      context: [],
      layout: "reader",
    });
  for (const t of find(repo, {}, { limit: 0, byTypeLimit: 0 }).facets.byType)
    out.push({
      id: `type:${t.typeId}`,
      label: t.value.slice(t.value.lastIndexOf("/") + 1).replaceAll(/[-_]/g, " "),
      collection: { kind: "type", typeId: t.typeId },
      focus: { kind: "read" },
      context: [],
      layout: "trail",
    });
  out.push({
    id: "find",
    label: "Everything",
    collection: { kind: "find" },
    focus: { kind: "read" },
    context: [],
    layout: "trail",
  });
  return out;
}

/** Hand-declared lenses for the four surveyed corpora (plans/ux-lenses.md §3), keyed by repositoryId. */
export const curatedLenses: Record<string, Lens[]> = {
  // muSrs
  "9aa1d3bf-8988-4f38-a380-aa188ef8e443": [
    {
      id: "case",
      label: "The case",
      collection: { kind: "outline", containerId: "4fd725af-72f2-45d8-8a95-14f0d22af181" },
      focus: { kind: "document" },
      context: [
        ctx("Evidence", "evidences", "in", [
          "com.mudemocracy.argument/source",
          "com.mudemocracy.argument/quotation",
        ]),
        ctx("Challenged by", "challenges", "in"),
        ctx("Depends on", "depends-on", "out"),
        ctx("Answers", "answers", "out", ["com.mudemocracy.argument/problem"]),
        ctx("Refines", "refines", "out"),
        ctx("Refined by", "refines", "in"),
        ctx("Authored by", "com.mudemocracy.stewardship/authored-by", "out"),
      ],
      layout: "trail",
    },
    {
      id: "research",
      label: "Research",
      collection: {
        kind: "type",
        typeId: "36e85cff-989b-4c6d-9361-3c8906cff87b",
      },
      by: "field:source_kind",
      focus: { kind: "read" },
      context: [
        ctx("Quotes pulled", "derived-from", "in", ["com.mudemocracy.argument/quotation"]),
        ctx("Supports", "evidences", "out", ["com.mudemocracy/claim"]),
        ctx("Challenges", "challenges", "out"),
        ctx("Problems raised", "derived-from", "in", ["com.mudemocracy.argument/problem"]),
      ],
      layout: "trail",
    },
    {
      id: "problem-grid",
      label: "Problem grid",
      collection: { kind: "composition", compositionId: "e0c42424-536c-466e-8586-1cb53144e0df" },
      focus: { kind: "read" },
      context: [
        ctx("Scoped by boundary", "com.mudemocracy.argument/scopes-problem", "in"),
        ctx("Answered by", "answers", "in", ["com.mudemocracy/claim"]),
        ctx("Sources", "derived-from", "out"),
      ],
      layout: "board",
      columns: ["persona", "scale", "kind"],
    },
    {
      id: "stewardship",
      label: "Stewardship",
      collection: { kind: "outline", containerId: "8c75d1ef-07f2-4b1c-99d3-fea93287b3a3" },
      focus: { kind: "read" },
      context: [
        ctx("Runs", "derived-from", "in", ["com.mudemocracy.stewardship/run-report"]),
        ctx("Authorised by", "com.mudemocracy.stewardship/authorised-by", "out"),
        ctx("Standing jobs", "contains", "out", ["com.mudemocracy.stewardship/standing-job"]),
      ],
      layout: "trail",
    },
    {
      id: "guides",
      label: "Guides",
      collection: { kind: "outline", containerId: "a623c62d-794e-4e84-9732-a6076a768ec3" },
      focus: { kind: "document", compositionId: "2aba4d85-317b-44e1-a600-d38a743b4cb4" },
      context: [],
      layout: "reader",
    },
  ],
  // srs spec
  "4172fada-bc38-5479-ac18-4be3194a68ca": [
    {
      id: "specification",
      label: "Specification",
      collection: { kind: "navigation" },
      focus: { kind: "document", compositionId: "3a000001-0000-4000-a000-000000000001" },
      context: [
        ctx("Prerequisites", "depends-on", "out"),
        ctx("Contains", "contains", "out"),
        ctx("Invariants", "contains", "out", ["com.semanticops.spec/invariant"]),
      ],
      layout: "reader",
    },
    {
      id: "concepts",
      label: "Concepts",
      collection: { kind: "type", typeId: "2a000004-0000-4000-a000-000000000004" },
      focus: { kind: "read" },
      context: [
        ctx("Depends on", "depends-on", "out"),
        ctx("Required by", "depends-on", "in"),
        ctx("Contains", "contains", "out"),
      ],
      layout: "graph",
    },
    {
      id: "decisions",
      label: "Decisions",
      collection: { kind: "type", typeId: "6a000004-0000-4000-a000-000000000004" },
      focus: { kind: "read" },
      context: [
        ctx("Refines", "refines", "out"),
        ctx("Supersedes", "supersedes", "out"),
        ctx("Superseded by", "supersedes", "in"),
        ctx("Carried by RFC", "contains", "in"),
      ],
      layout: "board",
      columns: ["project_phase", "decision_date", "accepted_revision"],
    },
  ],
  // srs-programme
  "fb8429db-ee67-4439-9656-0f36f17ab98b": [
    {
      id: "roadmap",
      label: "Roadmap",
      collection: { kind: "outline", containerId: "9de24607-812e-4ea0-ae52-089931da03ce" },
      focus: { kind: "read" },
      context: [
        ctx("Serves objective", "com.semanticops.programme/serves", "out"),
        ctx("Requires contract", "com.semanticops.programme/requires-contract", "out"),
        ctx("Assessed by", "com.semanticops.programme/assesses", "in"),
      ],
      layout: "trail",
    },
    {
      id: "problems",
      label: "Problems",
      collection: {
        kind: "outline",
        containerId: "219dc999-b667-4088-aae6-4c180ad03c90",
        also: ["5e28aa7e-4b35-4474-8f62-cf8dcae1e506", "17006e00-6a2c-44ff-8565-047b57fb00da"],
      },
      focus: { kind: "read" },
      context: [
        ctx("Held by persona", "com.semanticops.method/held-by", "in"),
        ctx("Concerns pole", "com.semanticops.method/concerns", "out"),
        ctx("Comments", "com.semanticops.comments/comments-on", "in"),
        ctx("Derived from", "derived-from", "out"),
        ctx("Answered by", "com.semanticops.method/answers", "in"),
      ],
      layout: "board",
      columns: ["kind", "imbalance"],
    },
    {
      id: "work-log",
      label: "Work log",
      collection: {
        kind: "outline",
        containerId: "9124978b-fbf9-4463-b62a-3f47e774dda2",
        also: [
          "eac9410e-e8eb-4603-9d71-62a381581319",
          "c212a489-679f-493d-b194-aef2e47df914",
          "934a984d-c4be-401f-a241-80bd1db952a1",
          "b12e33c2-c9ef-4de5-96e8-bb22a373502b",
        ],
      },
      focus: { kind: "read" },
      context: [
        ctx("Findings", "contains", "out"),
        ctx("Carried context", "contains", "out"),
        ctx("Depends on unit", "depends-on", "out"),
      ],
      layout: "trail",
    },
  ],
  // semanticops.com source
  "0dbab76e-7f8e-4276-8791-c00a8627965d": [
    {
      id: "pages",
      label: "Pages",
      collection: { kind: "navigation" },
      focus: { kind: "document" },
      context: [ctx("Prerequisite concept", "depends-on", "out")],
      layout: "reader",
    },
    {
      id: "inventory",
      label: "Inventory",
      collection: { kind: "find" },
      focus: { kind: "read" },
      context: [],
      layout: "board",
    },
    {
      id: "concept-map",
      label: "Concept map",
      collection: { kind: "type", typeId: "0d32838e-6eef-4648-a5dd-3d16bd93c584" },
      focus: { kind: "read" },
      context: [ctx("Depends on", "depends-on", "out"), ctx("Required by", "depends-on", "in")],
      layout: "graph",
    },
  ],
};
