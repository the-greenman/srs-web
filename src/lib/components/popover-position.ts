/**
 * Popover placement, written once (ADR-020 e). Where CSS anchor positioning exists the browser does
 * the work (`anchorStyle`); otherwise `placeNextTo` computes a fixed position from the anchor's rect.
 * `placeNextTo` is pure so it is unit-tested directly.
 */

export type Placement = "bottom-start" | "bottom-end";

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}
export interface Size {
  width: number;
  height: number;
}

const GAP = 4;
const EDGE = 4;

/** Below the anchor, aligned to the placement edge; flips above when it would overflow the bottom; clamped into the viewport. */
export function placeNextTo(
  anchor: Rect,
  surface: Size,
  viewport: Size,
  placement: Placement
): { top: number; left: number } {
  let top = anchor.bottom + GAP;
  if (top + surface.height > viewport.height - EDGE && anchor.top - GAP - surface.height >= EDGE) {
    top = anchor.top - GAP - surface.height;
  }
  top = Math.max(EDGE, Math.min(top, viewport.height - surface.height - EDGE));
  const left = placement === "bottom-end" ? anchor.right - surface.width : anchor.left;
  return { top, left: Math.max(EDGE, Math.min(left, viewport.width - surface.width - EDGE)) };
}

/** True where CSS anchor positioning is available (guarded: happy-dom has no `CSS.supports`). */
export function supportsAnchor(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("anchor-name: --x");
  } catch {
    return false;
  }
}

/** `:popover-open`, tolerating engines and test DOMs that do not know the selector. */
export function isShown(el: HTMLElement): boolean {
  try {
    return el.matches(":popover-open");
  } catch {
    return false;
  }
}

/** Inline style props that anchor `surface` to `anchorName` below the anchor (placement picks the span side). */
export function anchorSurfaceStyle(
  anchorName: string,
  placement: Placement
): Record<string, string> {
  return {
    "position-anchor": anchorName,
    "position-area": placement === "bottom-end" ? "bottom span-left" : "bottom span-right",
    "position-try-fallbacks": "flip-block, flip-inline",
  };
}
