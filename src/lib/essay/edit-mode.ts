/**
 * How essay text edits: `visual` (the default, decision 3f6f215c) or `source` markdown, which a writer
 * chooses with View > Edit as markdown. Per browser, in localStorage; storage may be unavailable.
 */
export type EditMode = "source" | "visual";

const KEY = "srs-web.essay.edit-mode";

export function loadEditMode(): EditMode {
  try {
    return localStorage.getItem(KEY) === "source" ? "source" : "visual";
  } catch {
    return "visual";
  }
}

export function saveEditMode(mode: EditMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
}
