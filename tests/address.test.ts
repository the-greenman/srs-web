// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Address,
  COLLECTION_BY,
  CONTEXT_BY,
  LENS_ID,
  formatAddress,
  parseAddress,
  pushAddress,
  readTrail,
  replaceAddress,
} from "$lib/address.js";

describe("address", () => {
  it("round-trips", () => {
    for (const a of [
      {},
      { essayId: "a" },
      { essayId: "a", paragraphId: "b" },
      { essayId: "a", zoomId: "c" },
    ]) {
      expect(parseAddress(formatAddress(a))).toEqual(a);
    }
    expect(formatAddress({ essayId: "a", zoomId: "c" })).toBe("#e=a&z=c");
  });
  it("tolerates junk", () => {
    for (const h of ["", "#", "#&&=", "#nonsense", "#e=", "#%E0%A4%A", "#e=a=b&z"]) {
      expect(() => parseAddress(h)).not.toThrow();
    }
    expect(parseAddress("#e=&p=")).toEqual({});
    expect(parseAddress("#x=1&e=a")).toEqual({ essayId: "a" });
  });
  it("round-trips lens keys", () => {
    const a: Address = {
      lens: "nav:97838af7-50f8-4da2-9d8f-d7dbf9296c80",
      instanceId: "006a853f-7e58-4842-85e4-ad75d4b0fe5d",
      by: "field:00000000-0000-4000-8000-000000000001",
      ctxBy: "boundary",
    };
    expect(parseAddress(formatAddress(a))).toEqual(a);
    expect(formatAddress(a)).toContain("lens=nav%3A97838af7");
    for (const lens of ["nav:x", "comp:x", "type:x", "pkg:x", "find", "set"] as const) {
      expect(parseAddress(formatAddress({ lens }))).toEqual({ lens });
    }
  });
  it("accepts a raw colon", () => {
    expect(parseAddress("#lens=nav:abc&by=field:def")).toEqual({ lens: "nav:abc", by: "field:def" });
  });
  it("drops invalid lens, by and ctxby values", () => {
    expect(parseAddress("#lens=bogus&by=colour&ctxby=x")).toEqual({});
    expect(parseAddress("#lens=nav:&by=field:&ctxby=")).toEqual({});
    for (const v of ["nav:a", "comp:a", "type:a", "pkg:a", "find", "set"]) expect(LENS_ID.test(v)).toBe(true);
    for (const v of ["nav", "nav:a b", "found", "sets", "x:a"]) expect(LENS_ID.test(v)).toBe(false);
    for (const v of ["none", "type", "nesting", "container", "state", "created-by", "field:a"]) {
      expect(COLLECTION_BY.test(v)).toBe(true);
    }
    for (const v of ["nothing", "createdBy", "field:", "types"]) expect(COLLECTION_BY.test(v)).toBe(false);
    for (const v of ["link-type", "none", "boundary"]) expect(CONTEXT_BY.test(v)).toBe(true);
    for (const v of ["link", "nothing", "boundaryx"]) expect(CONTEXT_BY.test(v)).toBe(false);
  });
  it("essay and lens keys coexist", () => {
    const a: Address = { essayId: "e1", paragraphId: "p1", zoomId: "z1", lens: "find", instanceId: "i1", by: "type", ctxBy: "none" };
    expect(formatAddress(a)).toBe("#e=e1&p=p1&z=z1&lens=find&id=i1&by=type&ctxby=none");
    expect(parseAddress(formatAddress(a))).toEqual(a);
  });
  it("unknown keys are ignored", () => {
    expect(parseAddress("#repo=x&lens=set&foo=bar&id=i")).toEqual({ lens: "set", instanceId: "i" });
  });
});

describe("history writes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, "", "/");
  });
  const stub = () => ({
    push: vi.spyOn(history, "pushState"),
    replace: vi.spyOn(history, "replaceState"),
  });

  it("pushAddress pushes once and is a no-op for the same hash and trail", () => {
    history.replaceState(null, "", "/");
    const { push } = stub();
    pushAddress({ lens: "find", instanceId: "a" });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenLastCalledWith(null, "", "#lens=find&id=a");
    pushAddress({ lens: "find", instanceId: "a" });
    expect(push).toHaveBeenCalledTimes(1);
    const trail = [{ id: "a", label: "A" }];
    pushAddress({ lens: "find", instanceId: "b" }, trail);
    pushAddress({ lens: "find", instanceId: "b" }, trail);
    expect(push).toHaveBeenCalledTimes(2);
  });
  it("pushAddress with the same hash but a new trail pushes", () => {
    history.replaceState({ trail: [{ id: "a", label: "A" }] }, "", "/#lens=find&id=b");
    const { push } = stub();
    pushAddress({ lens: "find", instanceId: "b" }, [{ id: "c", label: "C" }]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(readTrail()).toEqual([{ id: "c", label: "C" }]);
    pushAddress({ lens: "find", instanceId: "b" });
    expect(push).toHaveBeenCalledTimes(2);
    expect(readTrail()).toEqual([]);
  });
  it("replaceAddress replaces, keeping the trail", () => {
    history.replaceState(null, "", "/");
    const { push, replace } = stub();
    const trail = [{ id: "a", label: "A" }];
    replaceAddress({ lens: "find", instanceId: "b", by: "type" }, trail);
    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenLastCalledWith({ trail }, "", "#lens=find&id=b&by=type");
    expect(location.hash).toBe("#lens=find&id=b&by=type");
    expect(readTrail()).toEqual(trail);
    replaceAddress({});
    expect(location.hash).toBe("");
  });
  it("readTrail returns [] for null, junk and a missing trail", () => {
    for (const s of [null, 3, "x", {}, { trail: "x" }, { trail: [{ id: 1 }] }, { trail: [null] }]) {
      expect(readTrail(s)).toEqual([]);
    }
    expect(readTrail({ trail: [{ id: "a", label: "A" }] })).toEqual([{ id: "a", label: "A" }]);
  });
});
