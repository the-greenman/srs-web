/**
 * Native HTML5 drag-and-drop helpers shared by BlockStack / LayersPanel / DraftTray
 * (no dependency). `dataTransfer.getData` is unreadable during dragover, so the in-flight
 * payload is also kept in a module variable.
 */
import type { Zone } from "../essay/essay-model.js";

export const DRAG_MIME = "application/x-srs-block";
export interface DragPayload {
  id: string;
  /** Which list the drag started in (e.g. "essay" | "draft"). */
  from: string;
}
export type { Zone };

let current: DragPayload | null = null;
export const dragging = (): DragPayload | null => current;

export function startDrag(e: DragEvent, payload: DragPayload): void {
  current = payload;
  e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload));
  e.dataTransfer?.setData("text/plain", payload.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
export const endDrag = (): void => {
  current = null;
};

/** Which part of `el` the pointer is over: top/bottom quarter = before/after, middle = into (if nest). */
export function zoneOf(e: DragEvent, el: HTMLElement, nest: boolean): Zone {
  const r = el.getBoundingClientRect();
  const y = (e.clientY - r.top) / (r.height || 1);
  if (nest) return y < 0.25 ? "before" : y > 0.75 ? "after" : "into";
  return y < 0.5 ? "before" : "after";
}

export type KeyMove = "up" | "down" | "in" | "out";
/** Alt+Arrow keyboard alternative to dragging. */
export function keyMove(e: KeyboardEvent): KeyMove | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  return (
    ({ ArrowUp: "up", ArrowDown: "down", ArrowRight: "in", ArrowLeft: "out" } as const)[
      e.key as "ArrowUp"
    ] ?? null
  );
}
