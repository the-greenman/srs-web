import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  MUTATING_METHODS,
  NON_MUTATING_METHODS,
  readOnlyGuard,
  readOnlyRepo,
} from "../src/lib/read-only";
import type { SrsRepository } from "../src/lib/srs-client";

describe("method classification", () => {
  // A new binding must be classified (mutating or not) before it can ship: read-only never leaks a writer.
  const dts = readFileSync("src/lib/srs_bindings/srs_bindings.d.ts", "utf8");
  const cls = dts.slice(
    dts.indexOf("export class SrsRepository"),
    dts.indexOf("export type InitInput")
  );
  const methods = [...cls.matchAll(/^ {4}([a-z_0-9]+)\(/gm)].map((m) => m[1]);

  it("covers every SrsRepository binding exactly once", () => {
    expect(methods.length).toBeGreaterThan(80);
    const unclassified = methods.filter(
      (m) => !MUTATING_METHODS.has(m) && !NON_MUTATING_METHODS.has(m)
    );
    expect(unclassified).toEqual([]);
    expect([...MUTATING_METHODS].filter((m) => NON_MUTATING_METHODS.has(m))).toEqual([]);
  });
});

describe("readOnlyRepo", () => {
  const raw = {
    update_record: vi.fn(() => "wrote"),
    get_record: vi.fn(() => "read"),
    set_actor: vi.fn(),
  };
  const repo = raw as unknown as SrsRepository;

  it("refuses writes, passes reads, until the flag clears", () => {
    let ro = true;
    const guarded = readOnlyRepo(repo, () => ro);
    expect(() => guarded.update_record("i", "{}")).toThrow(/read-only/);
    expect(raw.update_record).not.toHaveBeenCalled();
    expect(guarded.get_record("i")).toBe("read");
    guarded.set_actor("{}");
    expect(raw.set_actor).toHaveBeenCalled();
    ro = false;
    expect(guarded.update_record("i", "{}")).toBe("wrote");
  });
});

describe("readOnlyGuard", () => {
  it("guards every container, record and note", () => {
    const repo = {
      list_containers: () => [{ containerId: "c1" }, { containerId: "c2" }],
      list_records: () => [
        {
          instanceId: "r1",
          record: { instanceId: "r1", typeId: "t", typeVersion: 1, fieldValues: {} },
        },
      ],
      list_notes: () => ({ notes: [{ instanceId: "n1" }] }),
    } as unknown as SrsRepository;
    const g = readOnlyGuard(repo);
    expect(g.containerIds).toEqual(["c1", "c2"]);
    expect(g.instanceIds).toEqual(["r1", "n1"]);
    expect(g.fillOnlyFields).toEqual([]);
  });
});
