/**
 * Editor help as data (decision 9441693e, srs-web#639). The help repository in `help/` (an SRS
 * repository, edited in the editor itself) holds one `ui-feature` record per feature; an editor's
 * help is the container named after its id, in entry order. Components never hold help text: they
 * name the feature by its id in a `data-feature` attribute, and the contract test joins the two.
 */
import {
  type SrsRepository,
  getContainer,
  getContainerOutline,
  getRecord,
  listContainers,
  loadRepoFromTree,
} from "$lib/srs-client.js";

/** The help repository's `ui-feature` type (help/package/types): records are chosen by typeId, never the name hint. */
export const UI_FEATURE_TYPE_ID = "b6981a3a-d0e4-429b-9f1b-ae5090326570";

export interface HelpItem {
  instanceId: string;
  featureId: string;
  placement: "ui" | "concept";
  title: string;
  summary: string;
  explanation?: string;
  aiGuidance?: string;
}

const PREFIX = "../../../help/";
const FILES = import.meta.glob("../../../help/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

let loaded: SrsRepository | null = null;

/** The bundled help repository, loaded once (after initWasm). */
export function helpRepository(): SrsRepository {
  if (!loaded) {
    const enc = new TextEncoder();
    loaded = loadRepoFromTree(
      Object.fromEntries(
        Object.entries(FILES).map(([k, v]) => [k.slice(PREFIX.length), enc.encode(v)])
      )
    );
  }
  return loaded;
}

/** The help for one editor, in display order; empty when the editor has no help container. */
export function helpFor(editorId: string, repo: SrsRepository = helpRepository()): HelpItem[] {
  const container = listContainers(repo)
    .map((c) => getContainer(repo, c.containerId))
    .find((c) => c.name === editorId);
  if (!container) return [];
  return getContainerOutline(repo, container.containerId).entries.flatMap(({ instanceId }) => {
    const r = getRecord(repo, instanceId);
    if (r?.typeId !== UI_FEATURE_TYPE_ID) return [];
    const v = r.fieldValues as Record<string, string | undefined>;
    return [
      {
        instanceId,
        featureId: v.feature_id ?? "",
        placement: v.placement === "concept" ? "concept" : "ui", // as the contract reads it: anything else is placed
        title: v.title ?? "",
        summary: v.summary ?? "",
        explanation: v.explanation,
        aiGuidance: v.ai_guidance,
      },
    ];
  });
}
