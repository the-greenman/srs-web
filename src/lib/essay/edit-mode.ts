/**
 * How essay paragraphs edit: `visual` (srs-web#749, #750) or `source` markdown. Per browser, in
 * localStorage; source until srs-web#752 makes visual the default and adds the Edit as markdown switch.
 */
export type EditMode = "source" | "visual";

const KEY = "srs-web.essay.edit-mode";

export function editMode(): EditMode {
  try {
    return localStorage.getItem(KEY) === "visual" ? "visual" : "source";
  } catch {
    return "source";
  }
}
