/**
 * Wide: the one per-viewer layout switch (owner D5, #424). On widens the content cap and the margin
 * column (`data-margin="expanded"` on `.app` is the CSS hook). This is the ONE setter; the storage key
 * stays `srs-web.margin` (values `expanded` / `compact`) so existing viewers keep their setting.
 * Storage may be unavailable: off is the default.
 */
const KEY = "srs-web.margin";

export function loadWide(): boolean {
  try {
    return localStorage.getItem(KEY) === "expanded";
  } catch {
    return false;
  }
}

export function saveWide(w: boolean): void {
  try {
    localStorage.setItem(KEY, w ? "expanded" : "compact");
  } catch {}
}
