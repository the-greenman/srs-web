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
  buildBoard,
  methodWriteGuard,
  sourceHref,
} from "../src/lib/method/method-document.js";
import type { SrsRecord, SrsRelation } from "../src/lib/srs-client.js";

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
    expect(p1.personas).toMatchObject([{ id: "per", label: "Owner" }]);
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

describe("affirmed forks", () => {
  it("hide a Suggested original an Affirmed record is derived-from; others stay", () => {
    const b = buildBoard({
      records: [...records, rec("f1", PROBLEM_TYPE_ID, { problem_id: "SP-2", title: "Two" }), rec("f9", PROBLEM_TYPE_ID, { title: "Draft" })],
      relations: [...relations, rel("contains", "c1", "f1"), rel("derived-from", "f1", "p1"), rel("derived-from", "f9", "p4")],
      containers: { suggestions: "S", affirmed: "A" },
      members: { suggestions: ["p1", "p4"], affirmed: ["f1"] },
    });
    const ids = b.problems.map((p) => p.id);
    expect(ids).not.toContain("p1");
    expect(ids).toContain("p4"); // f9 is not in Affirmed
    expect(b.problems.find((p) => p.id === "f1")).toMatchObject({ status: "affirmed", cluster: { id: "c1" } });
  });
});

describe("commentCount", () => {
  const cm = (id: string) => ({ id, text: "", createdAt: "" });
  const board = buildBoard({
    records: [rec("a", PROBLEM_TYPE_ID, { title: "A" }), rec("b", PROBLEM_TYPE_ID, { title: "B" }), rec("c", PROBLEM_TYPE_ID, { title: "C" }), rec("b2", PROBLEM_TYPE_ID, { title: "B" })],
    relations: [rel("derived-from", "b2", "b")],
    containers: { suggestions: "S", affirmed: "A" },
    members: { suggestions: ["a", "b", "c"], affirmed: ["b2"] },
    // c1 is on the suggestion b and its affirmed fork b2 (both packages may link it twice)
    comments: { a: [cm("c0")], b: [cm("c1")], b2: [cm("c1"), cm("c1"), cm("c2")] },
  });
  const count = (id: string) => board.problems.find((p) => p.id === id)?.commentCount;
  it("counts distinct comments per record, 0 when none", () => {
    expect(count("a")).toBe(1);
    expect(count("b2")).toBe(2);
    expect(count("c")).toBe(0);
  });
});

describe("remedies, clusters and personas", () => {
  const REMEDY = "edd84bf8-6c07-4133-87c6-4ab540ac2a14";
  const answers = "com.semanticops.method/answers";
  const recs = [
    ...records,
    rec("r1", REMEDY, { title: "Fix", move: "M", does_not_fix: "D", falsifier: "F", return_when: "R" }),
    { ...rec("r2", REMEDY, { title: "Other" }), createdBy: agent },
  ];
  const base = [...relations, rel(answers, "r1", "p1"), rel(answers, "r1", "p3"), rel(answers, "r2", "p1")];

  it("lists a remedy under each problem it answers, one record", () => {
    const b = buildBoard({ records: recs, relations: base, containers: { suggestions: "S", affirmed: "A" }, members: { suggestions: ["p1", "p3", "r1", "r2"] } });
    const under = (id: string) => b.problems.find((p) => p.id === id)?.remedies?.map((r) => r.id);
    expect(under("p1")).toEqual(["r1", "r2"]);
    expect(under("p3")).toEqual(["r1"]);
    expect(b.remedies.find((r) => r.id === "r1")).toMatchObject({ move: "M", doesNotFix: "D", falsifier: "F", returnWhen: "R", status: "suggested" });
    expect(b.remedies).toHaveLength(2);
    expect(b.byId.get("r2")).toMatchObject({ createdBy: agent });
  });

  it("follows the Affirmed fork of the problem and hides an affirmed remedy's original", () => {
    const b = buildBoard({
      records: [...recs, rec("f1", PROBLEM_TYPE_ID, { problem_id: "SP-2", title: "Two" }), rec("fr", REMEDY, { title: "Fix" })],
      relations: [...base, rel("derived-from", "f1", "p1"), rel("derived-from", "fr", "r1"), rel(answers, "fr", "p1")],
      containers: { suggestions: "S", affirmed: "A" },
      members: { suggestions: ["p1", "r1", "r2"], affirmed: ["f1", "fr"] },
    });
    expect(b.problems.find((p) => p.id === "f1")?.remedies?.map((r) => r.id)).toEqual(["fr", "r2"]);
    expect(b.remedies.map((r) => r.id)).not.toContain("r1");
    expect(b.remedies.find((r) => r.id === "fr")?.answers.map((a) => a.id)).toEqual(["f1", "p3"]); // the original's other answers stand until the engine re-points (srs-rust#1377)
  });

  it("an affirmed cluster and persona stand for their originals; set aside hides only that record", () => {
    const b = buildBoard({
      records: [...recs, rec("fc", CLUSTER_TYPE_ID, { title: "Leaving the editor" }), rec("fp", PERSONA_TYPE_ID, { title: "Owner" })],
      relations: [...relations, rel("contains", "d1", "fc"), rel("contains", "fc", "p1"), rel("derived-from", "fc", "c1"), rel("derived-from", "fp", "per"), rel(HELD_BY, "p1", "fp")],
      containers: { suggestions: "S", affirmed: "A", setAside: "X" },
      members: { suggestions: ["c1", "per", "p1", "p2", "c2"], affirmed: ["fc", "fp"], setAside: ["c2"] },
    });
    const p1 = b.problems.find((p) => p.id === "p1");
    expect(p1?.cluster).toMatchObject({ id: "fc", status: "affirmed" });
    expect(p1?.personas.map((p) => [p.id, p.status])).toEqual([["fp", "affirmed"]]);
    expect(b.clusters.map((c) => c.id)).not.toContain("c1");
    expect(b.byId.get("c2")).toMatchObject({ status: "set-aside" });
    expect(b.problems.find((p) => p.id === "p3")).toBeDefined(); // its cluster c2 is set aside; the problem is not
  });

  it("the write guard covers Affirmed and Set aside whatever the kind", () => {
    expect(methodWriteGuard({ containers: { suggestions: "S", affirmed: "A", setAside: "X" } } as never)?.containerIds).toEqual(["A", "X"]);
  });
});
