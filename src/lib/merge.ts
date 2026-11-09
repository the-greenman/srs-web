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

/** A report's `bring`, narrowed to `keep` (default all), as a selection an apply accepts. */
function selectionOf(r: MergeReport, keep: (id: string) => boolean = () => true): MergeSelection {
  return {
    instanceIds: r.bring.instances.map((i) => i.instanceId).filter(keep),
    containerIds: r.bring.containers.map((c) => c.containerId).filter(keep),
    relationIds: r.bring.relations.map((x) => x.relationId),
    containerEntries: r.bring.containerEntries.map(({ containerId, instanceId }) => ({
      containerId,
      instanceId,
    })),
  };
}

/** What an apply brought in, and how many links and outline places could not come with the ticks. */
export interface MergeOutcome {
  report: MergeReport;
  leftBehind: number;
}

/**
 * Bring in the ticked items (links and outline entries are not ticked: they come with the items
 * they join). A link whose other end was left unticked cannot come in, so the engine previews the
 * ticks first and the apply asks for exactly what that preview brings: an apply never refuses for a
 * choice the writer did not make, and `leftBehind` says how much stayed out so the host can tell them.
 */
export function applyMerge(
  repo: SrsRepository,
  archive: Uint8Array,
  report: MergeReport,
  ticked: ReadonlySet<string>
): MergeOutcome {
  const plan = previewMerge(
    repo,
    archive,
    selectionOf(report, (id) => ticked.has(id))
  );
  const applied = JSON.parse(
    repo.merge_apply(archive, JSON.stringify(selectionOf(plan)))
  ) as MergeReport;
  return { report: applied, leftBehind: plan.unavailable.length };
}

/** "Brought in 3 items and 2 links." plus what stayed out, for a notice. */
export function outcomeText({ report, leftBehind }: MergeOutcome): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  const b = report.bring;
  const text = `Brought in ${n(b.instances.length + b.containers.length, "item")} and ${n(b.relations.length, "link")}.`;
  return leftBehind
    ? `${text} ${n(leftBehind, "link or outline place")} stayed out with the unticked items.`
    : text;
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
