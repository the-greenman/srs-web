/**
 * The writer's undo history for one essay, for the browser session (srs-web#570). Each writer edit
 * is bracketed by two snapshots of the essay's own state: the outlines of its essay, draft and Bin
 * containers, and the field values of the records in them plus the essay and document-state
 * records. Undo / redo write the difference back through the ordinary client calls, so each step is a
 * normal edit. Nothing else is touched: an agent's comments, attachments and relations are not in
 * the snapshot, so the writer's Ctrl-Z never undoes them (agents never write the essay text).
 *
 * A paragraph record cannot be recreated under its old id, so a record the history has to bring
 * back gets a new one and `alias` maps the old id to it for the rest of the history.
 */
import {
  addContainerMember,
  addContainerMemberRelative,
  containersForInstance,
  createRecord,
  deleteRecord,
  getContainerOutline,
  getRecord,
  removeContainerMember,
  updateRecord,
} from "$lib/srs-client.js";
import type { SrsRepository } from "$lib/srs-client.js";
import { typeVersion } from "$lib/type-version.js";
import { PARAGRAPH_TYPE_ID } from "./type-registry.js";

interface Entry {
  id: string;
  depth: number;
}

export interface EssaySnapshot {
  containers: Record<string, Entry[]>;
  records: Record<string, unknown>;
}

/** Where an essay's state lives: enough to find its containers and records again after any edit. */
export interface EssayRefs {
  essayId: string;
  containerId: string;
  stateId: string | null;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function snapshotEssay(repo: SrsRepository, refs: EssayRefs): EssaySnapshot {
  const state = refs.stateId ? getRecord(repo, refs.stateId) : null;
  const areas = [refs.containerId];
  for (const k of ["draft_container_id", "bin_container_id"]) {
    const id = state?.fieldValues?.[k];
    if (typeof id === "string" && id) areas.push(id);
  }
  const containers: EssaySnapshot["containers"] = {};
  const ids = new Set([refs.essayId, ...(refs.stateId ? [refs.stateId] : [])]);
  for (const c of areas) {
    containers[c] = getContainerOutline(repo, c).body.map((e) => ({
      id: e.instanceId,
      depth: e.depth,
    }));
    for (const e of containers[c]) ids.add(e.id);
  }
  const records: EssaySnapshot["records"] = {};
  for (const id of ids) {
    const r = getRecord(repo, id);
    if (r) records[id] = clone(r.fieldValues);
  }
  return { containers, records };
}

/** Write `target` back over the current state; the id of a recreated record is recorded in `alias`. */
function restore(repo: SrsRepository, target: EssaySnapshot, alias: Map<string, string>): void {
  const res = (id: string) => alias.get(id) ?? id;
  for (const [id, fieldValues] of Object.entries(target.records)) {
    const cur = getRecord(repo, res(id));
    if (!cur) {
      const made = createRecord(repo, PARAGRAPH_TYPE_ID, typeVersion(repo, PARAGRAPH_TYPE_ID), {
        fieldValues: clone(fieldValues) as Record<string, unknown>,
      });
      alias.set(id, made.instanceId);
    } else if (!same(cur.fieldValues, fieldValues)) {
      updateRecord(repo, res(id), { fieldValues: clone(fieldValues) as Record<string, unknown> });
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
  // A paragraph the target never had (an add being undone) goes with its place. One that is still
  // held elsewhere or that carries comments stays: the engine refuses and the record is left alone.
  for (const id of dropped) {
    if (containersForInstance(repo, id).length) continue;
    try {
      deleteRecord(repo, id, false);
    } catch {
      /* in use: keep it */
    }
  }
}

export class EssayHistory {
  private undos: { before: EssaySnapshot; after: EssaySnapshot }[] = [];
  private redos: { before: EssaySnapshot; after: EssaySnapshot }[] = [];
  private alias = new Map<string, string>();

  get canUndo(): boolean {
    return this.undos.length > 0;
  }
  get canRedo(): boolean {
    return this.redos.length > 0;
  }

  /** Remember an edit; a no-op (the snapshots are equal) is dropped and a new edit ends the redo line. */
  push(before: EssaySnapshot, after: EssaySnapshot): void {
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
