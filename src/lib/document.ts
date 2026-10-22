/**
 * The document foundation every editor builds on (srs-web#601, #602): a container whose outline
 * (RFC-043 order and depth) is the document, its side areas (draft, bin, comments, references) at
 * deterministic ids, moves of a run (an entry with its descendants) within and between them, the
 * permanent delete from the Bin, and an undo history over the document's own containers and records.
 *
 * Nothing here knows a record type: the essay editor (`$lib/essay`) and other apps (the muDemocracy
 * site editor) add their types and rules on top. A thin composition of srs-client calls; ordering,
 * depth and validation are the engine's.
 */
import {
  addContainerMember,
  addContainerMemberRelative,
  containersForInstance,
  createContainer,
  createRecord,
  deleteRecord,
  getContainer,
  getContainerOutline,
  getRecord,
  moveContainerMemberRelative,
  removeContainerMember,
  updateRecord,
} from "./srs-client.js";
import type { OutlineEntry, OutlineShift, SrsRepository } from "./srs-client.js";
import { uuid5 } from "./uuid5.js";

// --- areas ---------------------------------------------------------------------------------

/** Namespace of the deterministic area-container ids (UUIDv5 of `<anchorId>:<area>`). */
export const AREA_NS = "5d1f3c0e-8f0a-4b8e-9a53-2d6c1e7b4a90";

/** The id of a document's side area: the same on every client, so no tab makes a duplicate. */
export const areaId = (anchorId: string, area: string): string =>
  uuid5(AREA_NS, `${anchorId}:${area}`);

/**
 * The container with this deterministic id: created if absent, re-read if a second tab (or an
 * earlier partial repair) already made it. Same id on every client = no duplicate containers.
 */
export function ensureContainer(repo: SrsRepository, containerId: string, title: string): string {
  try {
    getContainer(repo, containerId);
    return containerId;
  } catch {
    /* absent: create it */
  }
  try {
    return createContainer(repo, { containerId, title }).containerId;
  } catch (e) {
    try {
      getContainer(repo, containerId); // lost a race: it exists now
      return containerId;
    } catch {
      throw e;
    }
  }
}

// --- outline moves -------------------------------------------------------------------------

/** A drop / insert position: before / after / into `id` (null = the end, depth 0). */
export interface Target {
  id: string | null;
  zone: "before" | "after" | "into";
}

/** Add `id` to `container` at `t` (core resolves the position); no target = append. */
export function place(repo: SrsRepository, container: string, id: string, t?: Target): void {
  if (t?.id) addContainerMemberRelative(repo, container, id, t.id, t.zone);
  else addContainerMember(repo, container, id);
}

/** Move a run within a container to `t`. */
export function moveEntry(repo: SrsRepository, container: string, id: string, t: Target): void {
  // No target = the end: after the last top-level run (a no-op when that run is `id`'s own).
  const target =
    t.id ??
    getContainerOutline(repo, container)
      .entries.filter((e) => e.depth === 0)
      .pop()?.instanceId;
  if (!target || target === id) return;
  moveContainerMemberRelative(repo, container, id, {
    relativeTo: target,
    placement: t.id ? t.zone : "after",
  });
}

/** Alt+Arrow / Tab: indent, outdent or swap with the neighbouring sibling (clamped by the core). */
export const shiftEntry = (
  repo: SrsRepository,
  container: string,
  id: string,
  shift: OutlineShift
): void => {
  moveContainerMemberRelative(repo, container, id, { shift });
};

/** `id` and its descendants in `container`, in outline order with depth relative to `id`. */
export function runOf(repo: SrsRepository, container: string, id: string): OutlineEntry[] {
  const body = getContainerOutline(repo, container).body;
  const at = body.findIndex((e) => e.instanceId === id);
  if (at < 0) return [];
  const rest = body.slice(at + 1);
  const end = rest.findIndex((e) => e.depth <= body[at].depth);
  return [body[at], ...(end < 0 ? rest : rest.slice(0, end))].map((e) => ({
    ...e,
    depth: e.depth - body[at].depth,
  }));
}

/** Move a run between two containers (a document, its draft, its bin): remove + add. */
export function transfer(
  repo: SrsRepository,
  from: string,
  to: string,
  id: string,
  t?: Target
): void {
  const run = runOf(repo, from, id);
  for (const e of [...run].reverse()) removeContainerMember(repo, from, e.instanceId);
  place(repo, to, id, t);
  const last: string[] = [id]; // last added entry per relative depth
  for (const e of run.slice(1)) {
    const sib = last[e.depth];
    addContainerMemberRelative(
      repo,
      to,
      e.instanceId,
      sib ?? last[e.depth - 1],
      sib ? "after" : "into"
    );
    last.length = e.depth;
    last[e.depth] = e.instanceId;
  }
}

/**
 * Permanent delete, from the Bin only: `id`'s run leaves the Bin, and each record in it is deleted
 * with the records `alsoDelete` names for it (an essay's comments), unless `keep` holds it (another
 * document holds it): a kept record is only taken out of the Bin.
 */
export function deleteFromBin(
  repo: SrsRepository,
  bin: string,
  id: string,
  o: { keep: (id: string) => boolean; alsoDelete?: (id: string) => string[] }
): void {
  for (const e of [...runOf(repo, bin, id)].reverse()) {
    removeContainerMember(repo, bin, e.instanceId);
    if (o.keep(e.instanceId)) continue;
    for (const other of o.alsoDelete?.(e.instanceId) ?? []) deleteRecord(repo, other, true);
    deleteRecord(repo, e.instanceId, true);
  }
}

// --- history -------------------------------------------------------------------------------

interface Entry {
  id: string;
  depth: number;
}
interface Held {
  typeId: string;
  typeVersion: number;
  fieldValues: unknown;
}

/** A document's own state: the outlines of its containers and the records in them (plus `recordIds`). */
export interface DocumentSnapshot {
  containers: Record<string, Entry[]>;
  records: Record<string, Held>;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Snapshot `containers` (outline and member records) and the extra `recordIds` (anchor, editor state). */
export function snapshotDocument(
  repo: SrsRepository,
  containers: string[],
  recordIds: string[] = []
): DocumentSnapshot {
  const out: DocumentSnapshot["containers"] = {};
  const ids = new Set(recordIds);
  for (const c of containers) {
    out[c] = getContainerOutline(repo, c).body.map((e) => ({ id: e.instanceId, depth: e.depth }));
    for (const e of out[c]) ids.add(e.id);
  }
  const records: DocumentSnapshot["records"] = {};
  for (const id of ids) {
    const r = getRecord(repo, id);
    if (r)
      records[id] = {
        typeId: r.typeId,
        typeVersion: r.typeVersion,
        fieldValues: clone(r.fieldValues),
      };
  }
  return { containers: out, records };
}

/** Write `target` back over the current state; the id of a recreated record is recorded in `alias`. */
function restore(repo: SrsRepository, target: DocumentSnapshot, alias: Map<string, string>): void {
  const res = (id: string) => alias.get(id) ?? id;
  for (const [id, held] of Object.entries(target.records)) {
    const cur = getRecord(repo, res(id));
    const fieldValues = clone(held.fieldValues) as Record<string, unknown>;
    if (!cur) {
      // A record cannot be recreated under its old id: it gets a new one, aliased for the rest of the history.
      alias.set(id, createRecord(repo, held.typeId, held.typeVersion, { fieldValues }).instanceId);
    } else if (!same(cur.fieldValues, held.fieldValues)) {
      updateRecord(repo, res(id), { fieldValues });
    }
  }
  const dropped: string[] = [];
  for (const [container, want] of Object.entries(target.containers)) {
    const cur = getContainerOutline(repo, container).body.map((e) => ({
      id: e.instanceId,
      depth: e.depth,
    }));
    const wanted = want.map((e) => ({ id: res(e.id), depth: e.depth }));
    if (same(cur, wanted)) continue;
    for (const e of [...cur].reverse()) {
      removeContainerMember(repo, container, e.id);
      if (!wanted.some((w) => w.id === e.id)) dropped.push(e.id);
    }
    const last: string[] = []; // last added entry per depth
    for (const e of wanted) {
      const sib = last[e.depth];
      if (e.depth === 0 && !sib) addContainerMember(repo, container, e.id);
      else
        addContainerMemberRelative(
          repo,
          container,
          e.id,
          sib ?? last[e.depth - 1],
          sib ? "after" : "into"
        );
      last.length = e.depth;
      last[e.depth] = e.id;
    }
  }
  // A record the target never had (an add being undone) goes with its place. One that is still
  // held elsewhere or that others point at stays: the engine refuses and the record is left alone.
  for (const id of dropped) {
    if (containersForInstance(repo, id).length) continue;
    try {
      deleteRecord(repo, id, false);
    } catch {
      /* in use: keep it */
    }
  }
}

/**
 * The writer's undo history for one document, for the browser session (srs-web#570). Each writer
 * edit is bracketed by two snapshots (`snapshotDocument`); undo / redo write the difference back
 * through the ordinary client calls, so each step is a normal edit. Agents' records and relations
 * are not in the snapshot, so the writer's Ctrl-Z never undoes them.
 */
export class DocumentHistory {
  private undos: { before: DocumentSnapshot; after: DocumentSnapshot }[] = [];
  private redos: { before: DocumentSnapshot; after: DocumentSnapshot }[] = [];
  private alias = new Map<string, string>();

  get canUndo(): boolean {
    return this.undos.length > 0;
  }
  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  /** Remember an edit; a no-op (the snapshots are equal) is dropped and a new edit ends the redo line. */
  push(before: DocumentSnapshot, after: DocumentSnapshot): void {
    if (same(before, after)) return;
    this.undos.push({ before, after });
    this.redos = [];
  }

  /** Forget everything, for an edit that cannot be reversed. */
  clear(): void {
    this.undos = [];
    this.redos = [];
    this.alias.clear();
  }

  undo(repo: SrsRepository): boolean {
    const step = this.undos.at(-1);
    if (!step) return false;
    restore(repo, step.before, this.alias);
    this.undos.pop();
    this.redos.push(step);
    return true;
  }

  redo(repo: SrsRepository): boolean {
    const step = this.redos.at(-1);
    if (!step) return false;
    restore(repo, step.after, this.alias);
    this.redos.pop();
    this.undos.push(step);
    return true;
  }
}
