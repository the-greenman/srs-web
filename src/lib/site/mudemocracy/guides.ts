/**
 * muDemocracy's site layer (ADR-029): a guide-section block, or an item such as an action card,
 * shows a guide's record by reference (`uses`, prototype decision D14), and the site renders that
 * section from the guide's own export. This adds `{guide, section}` (slugs) to what it exports.
 * Site-specific: the generic core never imports this directory.
 */
import { type SrsRepository, getContainer, getRecord, listContainers } from "$lib/srs-client.js";
import type { BlockExtra } from "../site-export.js";
import { outgoing } from "../site-model.js";

const GUIDE_SECTION = "guide-section";

/** The export extra for a repository: built once, it maps each guide record to its guide and section. */
export function guideReferences(repo: SrsRepository): BlockExtra {
  const where = new Map<string, { guide: string; section: string | null }>();
  for (const { containerId, containerType } of listContainers(repo)) {
    if (containerType !== "guide") continue;
    const c = getContainer(repo, containerId);
    if (!c.anchorInstanceId) continue;
    const guide = String(getRecord(repo, c.anchorInstanceId)?.fieldValues.slug ?? "");
    for (const { instanceId } of c.memberInstanceIds ?? []) {
      const section =
        instanceId === c.anchorInstanceId
          ? null
          : String(getRecord(repo, instanceId)?.fieldValues.slug ?? "");
      where.set(instanceId, { guide, section });
    }
  }
  // As the site's export did: a guide-section must show a guide record; an item may; other blocks do not.
  return (repo, id, out, record, isItem) => {
    const isSection = record.typeName === GUIDE_SECTION;
    if (!isItem && !isSection) return;
    const found = where.get(outgoing(repo, id, "uses")[0]);
    if (isSection && !isItem && !found) throw new Error(`guide-section ${id} uses no guide record`);
    if (found) Object.assign(out, found);
  };
}
