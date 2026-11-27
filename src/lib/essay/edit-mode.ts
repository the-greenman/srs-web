/**
 * How essay paragraphs edit: `visual` (srs-web#749, #750) or `source` markdown, chosen with View >
 * Edit as markdown (srs-web#752, decision 3f6f215c). Per browser, in localStorage; visual when storage
 * is empty or blocked.
 */
import { safeStorage } from "../safe-storage.js";

export type EditMode = "source" | "visual";

const KEY = "srs-web.essay.edit-mode";

export function editMode(): EditMode {
  try {
    return safeStorage()?.getItem(KEY) === "source" ? "source" : "visual";
  } catch {
    return "visual";
  }
}

export function setEditMode(mode: EditMode): void {
  try {
    safeStorage()?.setItem(KEY, mode);
  } catch {}
}
