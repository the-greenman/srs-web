import { describe, expect, it } from "vitest";
import { placeNextTo } from "../src/lib/components/popover-position";

const viewport = { width: 400, height: 300 };
const surface = { width: 120, height: 100 };
const anchor = (top: number, left: number, w = 24, h = 24) => ({ top, left, right: left + w, bottom: top + h });

describe("placeNextTo", () => {
  it("opens below the anchor, left-aligned for bottom-start", () => {
    expect(placeNextTo(anchor(20, 50), surface, viewport, "bottom-start")).toEqual({ top: 48, left: 50 });
  });
  it("right-aligns to the anchor for bottom-end", () => {
    expect(placeNextTo(anchor(20, 200), surface, viewport, "bottom-end")).toEqual({ top: 48, left: 104 });
  });
  it("flips above when there is no room below", () => {
    const { top } = placeNextTo(anchor(250, 50), surface, viewport, "bottom-start");
    expect(top).toBe(250 - 4 - 100);
  });
  it("clamps into the viewport on the left and the right", () => {
    expect(placeNextTo(anchor(20, 2), surface, viewport, "bottom-end").left).toBe(4);
    expect(placeNextTo(anchor(20, 390), surface, viewport, "bottom-start").left).toBe(400 - 120 - 4);
  });
  it("stays on screen when it fits neither above nor below", () => {
    const tall = { width: 120, height: 280 };
    const { top } = placeNextTo(anchor(150, 50), tall, viewport, "bottom-start");
    expect(top).toBeGreaterThanOrEqual(4);
    expect(top + 280).toBeLessThanOrEqual(300 - 4);
  });
});
