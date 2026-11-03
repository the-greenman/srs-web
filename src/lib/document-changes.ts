/**
 * What changed since the last save, grouped for a person (srs-web#587). Headless: the engine
 * computes the diff (`SrsRepository.changes`, srs-rust#1522); this only parses its JSON and
 * groups it as Added / Changed / Removed. No diff is computed here.
 */
import type { SrsRepository } from "./srs-client.js";

export type ChangeKind = "created" | "updated" | "deleted";
export type ChangeGroupKey = "added" | "changed" | "removed";

export interface ChangeItem {
  /** The record/note/container id the item opens, when it names one. */
  id?: string;
  kind: "record" | "note" | "relation" | "container";
  title: string;
  /** Who made it (`createdBy.name` or id), when the engine knows. */
  by?: string;
}

export interface ChangeGroup {
  key: ChangeGroupKey;
  label: string;
  items: ChangeItem[];
}

export interface DocumentChanges {
  /** Count across records, notes, relations and containers. */
  total: number;
  unsaved: boolean;
  groups: ChangeGroup[];
}

const GROUPS: { key: ChangeGroupKey; label: string; kind: ChangeKind }[] = [
  { key: "added", label: "Added", kind: "created" },
  { key: "changed", label: "Changed", kind: "updated" },
  { key: "removed", label: "Removed", kind: "deleted" },
];

interface RawActor {
  id?: string;
  name?: string;
}
interface RawResult {
  unsaved?: boolean;
  instances?: {
    instanceId: string;
    change: ChangeKind;
    tier?: number;
    title?: string;
    typeName?: string;
    createdBy?: RawActor;
  }[];
  relations?: {
    relationId: string;
    change: ChangeKind;
    relationType: string;
    sourceInstanceId: string;
    targetInstanceId: string;
  }[];
  containers?: { containerId: string; change: ChangeKind; title: string }[];
}

const short = (id: string): string => id.slice(0, 8);

/** Group an engine `changes` result. `titleOf` resolves an instance id to a label for relation ends. */
export function groupChanges(
  raw: RawResult,
  titleOf: (id: string) => string | undefined = () => undefined
): DocumentChanges {
  const label = (id: string): string => titleOf(id) ?? short(id);
  const items = new Map<ChangeKind, ChangeItem[]>(GROUPS.map((g) => [g.kind, []]));
  for (const i of raw.instances ?? []) {
    items.get(i.change)?.push({
      id: i.instanceId,
      kind: i.tier === 0 ? "note" : "record",
      title: i.title || i.typeName || short(i.instanceId),
      by: i.createdBy?.name ?? i.createdBy?.id,
    });
  }
  for (const r of raw.relations ?? []) {
    items.get(r.change)?.push({
      kind: "relation",
      title: `${label(r.sourceInstanceId)} ${r.relationType} ${label(r.targetInstanceId)}`,
    });
  }
  for (const c of raw.containers ?? []) {
    items.get(c.change)?.push({ id: c.containerId, kind: "container", title: c.title });
  }
  const groups = GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: items.get(g.kind) ?? [],
  })).filter((g) => g.items.length > 0);
  return {
    total: groups.reduce((n, g) => n + g.items.length, 0),
    unsaved: raw.unsaved ?? groups.length > 0,
    groups,
  };
}

/** Read the live changes since the last save. Returns empty when the loaded engine lacks the read. */
export function readChanges(
  repo: SrsRepository,
  titleOf?: (id: string) => string | undefined
): DocumentChanges {
  if (typeof repo.changes !== "function") return { total: 0, unsaved: false, groups: [] };
  return groupChanges(JSON.parse(repo.changes("saved")) as RawResult, titleOf);
}

/** Make the repository as it is now the save point. Safe on an engine without the call. */
export function markSaved(repo: SrsRepository, at: string = new Date().toISOString()): void {
  if (typeof repo.mark_saved === "function") repo.mark_saved(at);
}
