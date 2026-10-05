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

/** Reading-card width bounds in px (a card widens to its content within these, never past the viewport). */
export interface CardWidth {
  min: number;
  max: number;
}

/**
 * Below the anchor, aligned to the placement edge; flips above when it would overflow the bottom; clamped
 * into the viewport. With `card`, the width is clamped to its bounds and the alignment flips to whichever
 * side of the anchor has more room when the placement edge cannot hold the card.
 */
export function placeNextTo(
  anchor: Rect,
  surface: Size,
  viewport: Size,
  placementIn: Placement,
  card?: CardWidth
): { top: number; left: number; width?: number } {
  let placement = placementIn;
  const width = card
    ? Math.min(Math.max(surface.width, card.min), card.max, viewport.width - 2 * EDGE)
    : surface.width;
  if (card) {
    const roomRight = viewport.width - EDGE - anchor.left;
    const roomLeft = anchor.right - EDGE;
    const fitsStart = roomRight >= width;
    const fitsEnd = roomLeft >= width;
    if (placement === "bottom-start" && !fitsStart && fitsEnd) placement = "bottom-end";
    else if (placement === "bottom-end" && !fitsEnd && fitsStart) placement = "bottom-start";
    else if (!fitsStart && !fitsEnd)
      placement = roomLeft > roomRight ? "bottom-end" : "bottom-start";
  }
  let top = anchor.bottom + GAP;
  if (top + surface.height > viewport.height - EDGE && anchor.top - GAP - surface.height >= EDGE) {
    top = anchor.top - GAP - surface.height;
  }
  top = Math.max(EDGE, Math.min(top, viewport.height - surface.height - EDGE));
  const left = placement === "bottom-end" ? anchor.right - width : anchor.left;
  const clamped = Math.max(EDGE, Math.min(left, viewport.width - width - EDGE));
  return card ? { top, left: clamped, width } : { top, left: clamped };
}

/**
 * Bottom-centre of `frame` (the main column), `offset` px above its bottom edge, which is the lower of
 * the frame and the visual viewport (so a mobile keyboard does not cover it). Centred on the frame and
 * clamped into the viewport width. `viewport.offsetTop` is `visualViewport.offsetTop` (0 if absent).
 */
export function placeBottomCentre(
  frame: Rect,
  surface: Size,
  viewport: Size & { offsetTop?: number },
  offset = 0
): { top: number; left: number } {
  const bottom = Math.min(frame.bottom, (viewport.offsetTop ?? 0) + viewport.height);
  const top = Math.max(EDGE, bottom - offset - surface.height);
  const centre = (frame.left + frame.right - surface.width) / 2;
  const left = Math.max(EDGE, Math.min(centre, viewport.width - surface.width - EDGE));
  return { top, left };
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
  placement: Placement,
  card = false
): Record<string, string> {
  return {
    "position-anchor": anchorName,
    "position-area": placement === "bottom-end" ? "bottom span-left" : "bottom span-right",
    // A reading card must not shrink into a cramped area: after the flips it spans the whole row.
    "position-try-fallbacks": card
      ? "flip-inline, flip-block, flip-block flip-inline, bottom span-all, top span-all"
      : "flip-block, flip-inline",
  };
}
