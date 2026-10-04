/**
 * Nav and inspector column widths, remembered per viewer. Global by design: one pair for every editor
 * and repository, like Wide (#424). Defaults and limits come from the `--nav-width`, `--inspector-width`
 * and `--shell-*-min|max` tokens (read as rem or px, so a skin can re-point them); the constants below
 * are only the fallback when no stylesheet is present (tests).
 */
export type Column = "nav" | "inspector";
export interface Columns {
  nav: number;
  inspector: number;
}

const KEY = "srs-web.columns";
const FALLBACK = {
  nav: { def: 264, min: 192, max: 384 },
  inspector: { def: 320, min: 224, max: 640 },
} as const;
const TOKENS = {
  nav: { def: "--nav-width", min: "--shell-nav-min", max: "--shell-nav-max" },
  inspector: {
    def: "--inspector-width",
    min: "--shell-inspector-min",
    max: "--shell-inspector-max",
  },
} as const;

/** A `rem` or `px` token value as pixels; `undefined` when absent or in another unit. */
function tokenPx(name: string): number | undefined {
  if (typeof document === "undefined") return undefined;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^(-?\d*\.?\d+)(rem|px)$/.exec(raw);
  if (!m) return undefined;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

export function limits(kind: Column): { def: number; min: number; max: number } {
  const t = TOKENS[kind];
  const f = FALLBACK[kind];
  return {
    def: tokenPx(t.def) ?? f.def,
    min: tokenPx(t.min) ?? f.min,
    max: tokenPx(t.max) ?? f.max,
  };
}

export function clampColumn(kind: Column, px: number): number {
  const { min, max } = limits(kind);
  return Math.round(Math.min(max, Math.max(min, px)));
}

export function loadColumns(): Columns {
  const out: Columns = { nav: limits("nav").def, inspector: limits("inspector").def };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    for (const k of ["nav", "inspector"] as const) {
      if (typeof stored?.[k] === "number" && Number.isFinite(stored[k]))
        out[k] = clampColumn(k, stored[k]);
    }
  } catch {}
  return out;
}

export function saveColumns(c: Columns): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
}
