import { expect, it } from "vitest";
import {
  type AgentWrite,
  ago,
  observeSession,
  pushWrite,
  verb,
} from "../src/lib/agent-activity";

const summary = (tool: string, changed: unknown[]) => JSON.stringify({ tool, changed });
/** A session whose next handle reports `sum` once (drains, like the engine). */
const fake = (sum?: string) => {
  let pending: string | undefined;
  return {
    handle: () => ((pending = sum), "{}"),
    take_write_summary: () => {
      const s = pending;
      pending = undefined;
      return s;
    },
  };
};

it("a handled request's write summary becomes a write naming its agent and target", () => {
  const seen: AgentWrite[] = [];
  observeSession(
    fake(summary("record_update", [{ target: "instance", id: "p1", kind: "updated" }])),
    "agent:a",
    (w) => seen.push(w)
  ).handle("{}");
  expect(seen[0]).toMatchObject({ agentId: "agent:a", tool: "record_update", instanceId: "p1" });
  expect(verb(seen[0])).toBe("updated");
});

it("indirect changes (fork) are reported; a relation is attributed to its target", () => {
  const seen: AgentWrite[] = [];
  const h = (sum: string) =>
    observeSession(
      fake(sum),
      "a",
      (w) => seen.push(w),
      undefined,
      (id) => (id === "r1" ? "p" : undefined)
    ).handle("{}");
  h(
    summary("record_fork", [
      { target: "instance", id: "f", kind: "created" },
      { target: "relation", id: "r0", kind: "created" },
    ])
  );
  h(summary("relation_create", [{ target: "relation", id: "r1", kind: "created" }]));
  expect([seen[0].instanceId, seen[0].changed.length, verb(seen[0])]).toEqual(["f", 2, "added"]);
  expect([seen[1].instanceId, verb(seen[1])]).toEqual(["p", "linked"]);
});

it("requests that wrote nothing are not reported", () => {
  const seen: AgentWrite[] = [];
  observeSession(fake(undefined), "a", (w) => seen.push(w)).handle("{}");
  expect(seen).toEqual([]);
});

it("the feed is newest first and capped", () => {
  const w = (at: number) => ({ seq: at, agentId: "a", tool: "t", changed: [], at });
  expect(pushWrite([w(1), w(2)], w(3), 2).map((x) => x.at)).toEqual([3, 1]);
});

it("ago reads naturally", () => {
  expect(ago(0, 5000)).toBe("just now");
  expect(ago(0, 120000)).toBe("2 min ago");
});

it("observeSession reports the client's name from initialize", () => {
  const session = fake();
  let name = "";
  observeSession(
    session,
    "a",
    () => {},
    (n) => (name = n)
  ).handle(JSON.stringify({ method: "initialize", params: { clientInfo: { name: "alpha" } } }));
  expect(name).toBe("alpha");
});

it("each observed write gets a larger seq than the one before", () => {
  const seqs: number[] = [];
  const h = observeSession(
    fake(summary("record_update", [{ target: "instance", id: "p", kind: "updated" }])),
    "a",
    (w) => seqs.push(w.seq)
  );
  h.handle("{}");
  h.handle("{}");
  expect(seqs[1]).toBeGreaterThan(seqs[0]);
});
