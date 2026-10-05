import { describe, expect, it } from "vitest";
import { placeNextTo } from "../src/lib/components/popover-position";

const viewport = { width: 400, height: 300 };
const surface = { width: 120, height: 100 };
const anchor = (top: number, left: number, w = 24, h = 24) => ({
  top,
  left,
  right: left + w,
  bottom: top + h,
});

describe("placeNextTo", () => {
  it("opens below the anchor, left-aligned for bottom-start", () => {
    expect(placeNextTo(anchor(20, 50), surface, viewport, "bottom-start")).toEqual({
      top: 48,
      left: 50,
    });
  });
  it("right-aligns to the anchor for bottom-end", () => {
    expect(placeNextTo(anchor(20, 200), surface, viewport, "bottom-end")).toEqual({
      top: 48,
      left: 104,
    });
  });
  it("flips above when there is no room below", () => {
    const { top } = placeNextTo(anchor(250, 50), surface, viewport, "bottom-start");
    expect(top).toBe(250 - 4 - 100);
  });
  it("clamps into the viewport on the left and the right", () => {
    expect(placeNextTo(anchor(20, 2), surface, viewport, "bottom-end").left).toBe(4);
    expect(placeNextTo(anchor(20, 390), surface, viewport, "bottom-start").left).toBe(
      400 - 120 - 4
    );
  });
  it("stays on screen when it fits neither above nor below", () => {
    const tall = { width: 120, height: 280 };
    const { top } = placeNextTo(anchor(150, 50), tall, viewport, "bottom-start");
    expect(top).toBeGreaterThanOrEqual(4);
    expect(top + 280).toBeLessThanOrEqual(300 - 4);
  });
  describe("reading card", () => {
    const card = { min: 160, max: 240 };
    const big = { width: 100, height: 60 };
    it("keeps the placement edge when the card fits there", () => {
      expect(placeNextTo(anchor(20, 50), big, viewport, "bottom-start", card)).toEqual({
        top: 48,
        left: 50,
        width: 160,
      });
    });
    it("flips to the roomier side when the placement edge cannot hold it", () => {
      // anchor near the right edge: bottom-start would overflow, end-aligned fits
      expect(placeNextTo(anchor(20, 340), big, viewport, "bottom-start", card)).toEqual({
        top: 48,
        left: 364 - 160,
        width: 160,
      });
      // anchor near the left edge, bottom-end would overflow, start-aligned fits
      expect(placeNextTo(anchor(20, 10), big, viewport, "bottom-end", card)).toEqual({
        top: 48,
        left: 10,
        width: 160,
      });
    });
    it("widens to the max and never past the viewport", () => {
      expect(
        placeNextTo(anchor(20, 50), { width: 500, height: 60 }, viewport, "bottom-start", card)
          .width
      ).toBe(240);
      expect(
        placeNextTo(anchor(20, 50), big, { width: 150, height: 300 }, "bottom-start", card).width
      ).toBe(142);
    });
  });
});

import { placeBottomCentre } from "../src/lib/components/popover-position";

describe("placeBottomCentre", () => {
  const frame = { top: 0, left: 100, right: 500, bottom: 600 };
  it("centres on the frame, its bottom edge on the frame bottom", () => {
    expect(placeBottomCentre(frame, { width: 200, height: 40 }, { width: 800, height: 700 })).toEqual({
      top: 560,
      left: 200,
    });
  });
  it("takes the bottom edge from the visual viewport when it is higher (mobile keyboard)", () => {
    const r = placeBottomCentre(frame, { width: 200, height: 40 }, { width: 800, height: 300, offsetTop: 50 });
    expect(r.top).toBe(350 - 40);
  });
  it("clamps into the viewport width", () => {
    const r = placeBottomCentre({ top: 0, left: 0, right: 100, bottom: 600 }, { width: 300, height: 40 }, { width: 360, height: 700 });
    expect(r.left).toBe(4);
    const r2 = placeBottomCentre({ top: 0, left: 300, right: 700, bottom: 600 }, { width: 300, height: 40 }, { width: 360, height: 700 });
    expect(r2.left).toBe(360 - 300 - 4);
  });
  it("lifts by the offset", () => {
    expect(placeBottomCentre(frame, { width: 200, height: 40 }, { width: 800, height: 700 }, 16).top).toBe(544);
  });
});
