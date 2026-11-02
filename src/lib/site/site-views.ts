/**
 * A website, read from its own package (ADR-029, srs-web#680): the Composition tagged `site` names
 * the page type (`rootTypeRefs`) and, through `typeDispatch`, the View that draws each block type.
 * A View's field views say the order and whether a field is on the site (`visible`, `displayHint`:
 * brief, setting or key). Generic: no site is named here.
 */
import {
  type SrsRepository,
  getComposition,
  getView,
  listDocumentViews,
  listFields,
} from "$lib/srs-client.js";

export interface FieldSlot {
  fieldId: string;
  name: string;
  order: number;
  visible: boolean;
  hint?: string;
}

export interface BlockView {
  viewId: string;
  viewName: string;
  types: string[];
  fields: FieldSlot[];
}

export interface Site {
  compositionId: string;
  pageTypeId: string;
  /** Type key (`namespace/name`) to the View that draws it. */
  dispatch: Map<string, BlockView>;
}

export const SITE_TAG = "site";

/** The repository's site, or null when no Composition is tagged `site`. */
export function findSite(repo: SrsRepository): Site | null {
  // Summaries carry no tags, so each candidate is read whole; a repository has few Compositions.
  for (const summary of listDocumentViews(repo)) {
    const c = getComposition(repo, summary.id);
    if (!c?.tags?.includes(SITE_TAG)) continue;
    const pageTypeId = c.rootTypeRefs?.[0]?.typeId;
    if (!pageTypeId) continue;
    const names = new Map(listFields(repo).map((f) => [f.id, f.name]));
    const views = new Map<string, BlockView>();
    const dispatch = new Map<string, BlockView>();
    for (const section of c.sections) {
      for (const [typeKey, viewId] of Object.entries(section.typeDispatch ?? {})) {
        let view = views.get(viewId);
        if (!view) {
          const v = getView(repo, viewId);
          if (!v) continue;
          view = {
            viewId,
            viewName: `${v.namespace}/${v.name}`,
            types: [],
            fields: [...v.fieldViews]
              .sort((a, b) => a.order - b.order)
              .map((f) => ({
                fieldId: f.fieldId,
                name: names.get(f.fieldId) ?? f.fieldId,
                order: f.order,
                visible: f.visible !== false,
                hint: f.displayHint,
              })),
          };
          views.set(viewId, view);
        }
        view.types.push(typeKey);
        dispatch.set(typeKey, view);
      }
    }
    return { compositionId: c.id, pageTypeId, dispatch };
  }
  return null;
}

export const viewFor = (site: Site, typeKey: string): BlockView | null =>
  site.dispatch.get(typeKey) ?? null;

/** The block types a page may hold: those the site's Composition dispatches to a View. */
export const offeredTypes = (site: Site): string[] => [...site.dispatch.keys()];

/** The field names a View marks as brief: editor-only, never on the site. */
export const briefFields = (view: BlockView): Set<string> =>
  new Set(view.fields.filter((f) => f.hint === "brief").map((f) => f.name));
