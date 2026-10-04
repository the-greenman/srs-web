/**
 * The margin's width mode, remembered per viewer. `data-margin="compact|expanded"` on the shell sets
 * the `--margin-width` token and the margin's look reacts to it; this is the ONE setter (the header
 * action today, #424's Wide toggle later). Storage may be unavailable: compact is the default.
 */
export type MarginMode = "compact" | "expanded";
const KEY = "srs-web.margin";

export function loadMargin(): MarginMode {
  try {
    return localStorage.getItem(KEY) === "expanded" ? "expanded" : "compact";
  } catch {
    return "compact";
  }
}

export function saveMargin(m: MarginMode): void {
  try {
    localStorage.setItem(KEY, m);
  } catch {}
}
