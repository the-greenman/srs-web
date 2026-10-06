import { describe, expect, it } from "vitest";
import { formatAddress, parseAddress } from "$lib/essay/address.js";

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
});
