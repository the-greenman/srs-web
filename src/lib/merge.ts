/**
 * Merge changes from a file (srs-web#733): bring new items in from another copy of the same
 * repository. Headless. The engine plans and writes (`merge_preview` / `merge_apply`,
 * srs-rust#1580) and decides what can come in and why not; this only parses its report, turns the
 * writer's ticks into a selection, and names things for a person.
 */
import type { SrsRepository } from "./srs-client.js";

export interface MergeItemRef {
  kind: "instance" | "relation" | "container" | "container-entry" | "attachment";
  id: string;
  containerId?: string;
}

export interface MergeReport {
  repositoryId: string;
  applied: boolean;
  sourceMigrations: string[];
  bring: {
    instances: { instanceId: string; tier: number; title?: string }[];
    relations: {
      relationId: string;
      relationType: string;
      sourceInstanceId: string;
      targetInstanceId: string;
    }[];
    containers: { containerId: string; title: string }[];
    containerEntries: { containerId: string; instanceId: string; depth: number }[];
    attachments: { documentId: string; title?: string }[];
  };
  differ: MergeItemRef[];
  heldBack: (MergeItemRef & { reason: string })[];
  notChosen: MergeItemRef[];
  unavailable: MergeItemRef[];
  orphanedEntries: { containerId: string; instanceId: string }[];
}

export interface MergeSelection {
  instanceIds: string[];
  relationIds: string[];
  containerIds: string[];
  containerEntries: { containerId: string; instanceId: string }[];
}

/** A tickable row: a record, note or container the other copy has and this one does not. */
export interface MergeChoice {
  id: string;
  kind: "record" | "note" | "container";
  title: string;
}

/** A row that will not come in, and why, so nobody believes that work landed. */
export interface MergeLeftOut {
  id: string;
  kind: string;
  title: string;
  why: string;
}

const short = (id: string): string => id.slice(0, 8);

export function previewMerge(
  repo: SrsRepository,
  archive: Uint8Array,
  selection?: MergeSelection
): MergeReport {
  return JSON.parse(
    repo.merge_preview(archive, selection ? JSON.stringify(selection) : null)
  ) as MergeReport;
}

/**
 * The choices of a full preview, records and notes first, then containers. The report titles notes
 * only; `titleOf` names a record from the other copy (the engine's display label, read by the host).
 */
export function mergeChoices(
  report: MergeReport,
  titleOf: (id: string) => string | undefined = () => undefined
): MergeChoice[] {
  return [
    ...report.bring.instances.map((i) => ({
      id: i.instanceId,
      kind: (i.tier === 0 ? "note" : "record") as MergeChoice["kind"],
      title: i.title || titleOf(i.instanceId) || short(i.instanceId),
    })),
    ...report.bring.containers.map((c) => ({
      id: c.containerId,
      kind: "container" as const,
      title: c.title || short(c.containerId),
    })),
  ];
}

/** Links and outline entries are not ticked: they come with the items they join. */
export function selectionFor(report: MergeReport, ticked: ReadonlySet<string>): MergeSelection {
  return {
    instanceIds: report.bring.instances.map((i) => i.instanceId).filter((id) => ticked.has(id)),
    containerIds: report.bring.containers.map((c) => c.containerId).filter((id) => ticked.has(id)),
    relationIds: report.bring.relations.map((r) => r.relationId),
    containerEntries: report.bring.containerEntries.map(({ containerId, instanceId }) => ({
      containerId,
      instanceId,
    })),
  };
}

/** Exactly what a report says comes in, as a selection an apply accepts. */
const bringSelection = (r: MergeReport): MergeSelection => ({
  instanceIds: r.bring.instances.map((i) => i.instanceId),
  relationIds: r.bring.relations.map((x) => x.relationId),
  containerIds: r.bring.containers.map((c) => c.containerId),
  containerEntries: r.bring.containerEntries.map(({ containerId, instanceId }) => ({
    containerId,
    instanceId,
  })),
});

/**
 * Bring in the ticked items and whatever links and entries can come with them. A link whose other
 * end was left unticked cannot come in, so the engine previews the ticks first and the apply asks
 * for exactly what that preview brings: an apply never refuses for a choice the writer did not make.
 */
export function applyMerge(
  repo: SrsRepository,
  archive: Uint8Array,
  report: MergeReport,
  ticked: ReadonlySet<string>
): MergeReport {
  const plan = previewMerge(repo, archive, selectionFor(report, ticked));
  return JSON.parse(repo.merge_apply(archive, JSON.stringify(bringSelection(plan)))) as MergeReport;
}

const REASONS: Record<string, string> = {
  "package-definition-not-brought": "its type is not installed here",
  "type-not-resolved": "its type is not installed here",
  "relation-type-not-resolved": "its link type is not installed here",
  "relation-type-closed": "its link type does not allow it",
  "relation-endpoint-missing": "an item it links is not here",
  "id-not-canonical": "its id is not in the standard form",
  "attachment-unavailable": "a file it needs is missing from the copy",
  "attachment-path-taken": "a different file already has its name here",
  "root-container-differs": "the top-level outline differs",
};

/** Items both copies hold with different content, and items the engine held back. */
export function leftOut(
  report: MergeReport,
  titleOf: (id: string) => string | undefined = () => undefined
): MergeLeftOut[] {
  const name = (r: MergeItemRef) => titleOf(r.id) ?? short(r.id);
  return [
    ...report.differ
      .filter((r) => r.kind === "instance" || r.kind === "container")
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        title: name(r),
        why: "changed in both copies; this copy's version stays",
      })),
    ...report.heldBack
      .filter((r) => r.kind !== "container-entry")
      .map((r) => ({ id: r.id, kind: r.kind, title: name(r), why: REASONS[r.reason] ?? r.reason })),
  ];
}
