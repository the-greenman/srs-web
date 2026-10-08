import { describe, expect, it } from "vitest";
import {
  CLUSTER_TYPE_ID,
  CONCERNS,
  DOMAIN_TYPE_ID,
  HELD_BY,
  PERSONA_TYPE_ID,
  POLE_TYPE_ID,
  PROBLEM_TYPE_ID,
  TENSION_TYPE_ID,
  affirmSupported,
  buildBoard,
  methodWriteGuard,
  sourceHref,
} from "../src/lib/method/method-document.js";
import type { SrsRecord, SrsRelation, SrsRepository } from "../src/lib/srs-client.js";

const rec = (instanceId: string, typeId: string, fieldValues: Record<string, unknown> = {}): SrsRecord =>
  ({ instanceId, typeId, typeVersion: 1, fieldValues, displayLabel: String(fieldValues.title ?? instanceId) }) as SrsRecord;
const rel = (relationType: string, sourceInstanceId: string, targetInstanceId: string): SrsRelation => ({
  relationId: `${relationType}:${sourceInstanceId}:${targetInstanceId}`,
  relationType,
  sourceInstanceId,
  targetInstanceId,
});
const agent = { kind: "ai" as const, id: "agent:scout", name: "Scout" };

const records = [
  rec("d1", DOMAIN_TYPE_ID, { title: "Writing" }),
  rec("c1", CLUSTER_TYPE_ID, { title: "Leaving the editor" }),
  rec("c2", CLUSTER_TYPE_ID, { title: "Orphan cluster" }),
  rec("per", PERSONA_TYPE_ID, { title: "Owner" }),
  rec("ten", TENSION_TYPE_ID, { title: "Testimony and authority" }),
  rec("pole", POLE_TYPE_ID, { title: "Testimony" }),
  { ...rec("p2", PROBLEM_TYPE_ID, { problem_id: "SP-10", title: "Ten", statement: "S10", source_ref: ["srs#1", "x"] }), createdBy: agent },
  rec("p1", PROBLEM_TYPE_ID, { problem_id: "SP-2", title: "Two", kind: "belief", imbalance: "missing" }),
  rec("p3", PROBLEM_TYPE_ID, { problem_id: "SP-3", title: "Three" }),
  rec("p4", PROBLEM_TYPE_ID, { problem_id: "SP-4", title: "Four" }),
];
const relations = [
  rel("contains", "d1", "c1"),
  rel("contains", "c1", "p1"),
  rel("contains", "c1", "p2"),
  rel("contains", "c2", "p3"),
  rel("contains", "ten", "pole"),
  rel(HELD_BY, "p1", "per"),
  rel(CONCERNS, "p1", "pole"),
];

describe("buildBoard", () => {
  const board = buildBoard({
    records,
    relations,
    containers: { suggestions: "S", affirmed: "A", setAside: "X" },
    members: { suggestions: ["p1", "p2", "p3"], affirmed: ["p3"], setAside: ["p2"] },
  });

  it("groups domain > cluster > problem; unplaced groups sort last", () => {
    expect(board.domains.map((d) => d.title)).toEqual(["Writing", "No domain"]);
    expect(board.domains[0].clusters.map((c) => c.title)).toEqual(["Leaving the editor"]);
    expect(board.domains[0].clusters[0].problems.map((p) => p.problemId)).toEqual(["SP-2", "SP-10"]);
    expect(board.domains[1].clusters.map((c) => c.title)).toEqual(["Orphan cluster", "No cluster"]);
    expect(board.domains[1].clusters.find((c) => c.title === "No cluster")?.problems.map((p) => p.id)).toEqual(["p4"]);
  });

  it("derives status from membership: Affirmed beats Set aside beats Suggestions", () => {
    const status = Object.fromEntries(board.problems.map((p) => [p.id, p.status]));
    expect(status).toEqual({ p1: "suggested", p2: "set-aside", p3: "affirmed", p4: null });
  });

  it("carries persona, side with its trade-off, sources and createdBy", () => {
    const p1 = board.problems.find((p) => p.id === "p1")!;
    expect(p1.personas).toEqual([{ id: "per", label: "Owner" }]);
    expect(p1.side).toEqual({ id: "pole", label: "Testimony", tradeOff: { id: "ten", label: "Testimony and authority" } });
    expect(p1.imbalance).toBe("missing");
    const p2 = board.problems.find((p) => p.id === "p2")!;
    expect(p2.sources).toEqual(["srs#1", "x"]);
    expect(p2.createdBy).toEqual(agent);
  });

  it("tolerates a missing Set aside container", () => {
    const b = buildBoard({ records, relations, containers: { suggestions: "S" }, members: { suggestions: ["p2"] } });
    expect(b.problems.find((p) => p.id === "p2")?.status).toBe("suggested");
    expect(methodWriteGuard(b)).toBeNull();
  });
});

describe("methodWriteGuard", () => {
  it("guards Affirmed and Set aside, never Suggestions", () => {
    const g = methodWriteGuard({ domains: [], problems: [], containers: { suggestions: "S", affirmed: "A", setAside: "X" } });
    expect(g).toEqual({ containerIds: ["A", "X"], instanceIds: [], fillOnlyFields: [] });
  });
});

describe("sourceHref", () => {
  it("links URLs and public repo#n refs only", () => {
    expect(sourceHref("semanticops.com#29")).toBe("https://github.com/the-greenman/semanticops.com/issues/29");
    expect(sourceHref("the-greenman/srs-rust#1354")).toBe("https://github.com/the-greenman/srs-rust/issues/1354");
    expect(sourceHref("https://example.org/a")).toBe("https://example.org/a");
    expect(sourceHref("muDemocracy.org#36")).toBeNull(); // private
    expect(sourceHref("srs-context:a note")).toBeNull();
  });
});

describe("affirmSupported", () => {
  it("reads the fork binding's arity", () => {
    const two = { fork_record: (_a: string, _b: string) => null } as unknown as SrsRepository;
    const three = { fork_record: (_a: string, _b: string, _c: string) => null } as unknown as SrsRepository;
    expect(affirmSupported(two)).toBe(false);
    expect(affirmSupported(three)).toBe(true);
  });
});
