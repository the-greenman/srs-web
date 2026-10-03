import { expect, it } from "vitest";
import {
  actorHue,
  ago,
  observeSession,
  pushWrite,
  verb,
  writeFrom,
} from "../src/lib/agent-activity";

const call = (name: string, args: unknown) =>
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });

it("a tools/call becomes a write naming its agent, target and fields", () => {
  const w = writeFrom(
    "agent:a",
    call("record_update", { instanceId: "p1", fieldValues: { paragraph_title: "T" } }),
    "{}",
    5
  );
  expect(w).toMatchObject({
    agentId: "agent:a",
    tool: "record_update",
    instanceId: "p1",
    fields: ["paragraph_title"],
    at: 5,
  });
  expect(verb(w!)).toBe("titled");
});

it("a create takes its id from the result; a relation names its target", () => {
  const res = JSON.stringify({ result: { structuredContent: { instanceId: "new1" } } });
  expect(
    writeFrom("a", call("record_create", { fieldValues: { comment_text: "x" } }), res, 1)
      ?.instanceId
  ).toBe("new1");
  const r = writeFrom(
    "a",
    call("relation_create", { sourceInstanceId: "c", targetInstanceId: "p" }),
    "{}",
    1
  )!;
  expect([r.instanceId, verb(r)]).toEqual(["p", "linked"]);
});

it("non-tool and malformed requests are not writes", () => {
  expect(writeFrom("a", JSON.stringify({ method: "initialize" }), "{}", 1)).toBeUndefined();
  expect(writeFrom("a", "nope", undefined, 1)).toBeUndefined();
});

it("observeSession reports only requests the engine says mutated the store", () => {
  let epoch = 0;
  const session = {
    write_epoch: () => epoch,
    handle: (t: string) => (t.includes("record_update") ? (epoch++, "{}") : "{}"),
  };
  const seen: string[] = [];
  const h = observeSession(session, "agent:a", (w) => seen.push(w.tool));
  h.handle(call("find", {}));
  h.handle(call("record_update", { instanceId: "p" }));
  expect(seen).toEqual(["record_update"]);
});

it("the feed is newest first and capped", () => {
  const w = (at: number) => ({ seq: at, agentId: "a", tool: "t", fields: [], at });
  expect(pushWrite([w(1), w(2)], w(3), 2).map((x) => x.at)).toEqual([3, 1]);
});

it("hue is stable per actor id and ago reads naturally", () => {
  expect(actorHue("agent:x")).toBe(actorHue("agent:x"));
  expect(ago(0, 5000)).toBe("just now");
  expect(ago(0, 120000)).toBe("2 min ago");
});

it("observeSession reports the client's name from initialize", () => {
  const session = { write_epoch: () => 0, handle: () => "{}" };
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
  let epoch = 0;
  const session = { write_epoch: () => epoch, handle: () => (epoch++, "{}") };
  const seqs: number[] = [];
  const h = observeSession(session, "a", (w) => seqs.push(w.seq));
  h.handle(call("record_update", { instanceId: "p" }));
  h.handle(call("record_update", { instanceId: "p" }));
  expect(seqs[1]).toBeGreaterThan(seqs[0]);
});
