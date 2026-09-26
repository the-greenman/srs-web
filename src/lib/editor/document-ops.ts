/**
 * document-ops.ts — thin wrappers over the chain-splice + container-create
 * WASM bindings for mutating a blueprint-driven document's component list.
 *
 * Shared by `BlueprintDocumentEditor` and `GuidesShell` (srs-web#322): one
 * implementation of insert/move/remove, so both clients agree on how a
 * document's `precedes` chain and container membership are kept in sync.
 *
 * ADR-001: zero SRS semantics in TypeScript — each op is a direct call into
 * the WASM chain-splice/container/record bindings; no chain rebuilding or
 * relation traversal happens here.
 */

import {
  type CreateRecordInput,
  type FieldValues,
  type SrsRecord,
  type SrsRepository,
  createRecordInContainer,
  deleteRecord,
  insertIntoPrecedesChain,
  moveInPrecedesChain,
  removeContainerMember,
  removeFromPrecedesChain,
} from "$lib/srs-client.js";

export interface InsertComponentInput {
  typeId: string;
  typeVersion: number;
  containerId: string;
  /** Insert immediately after this instance's chain position. Omit both anchors for the document's first component. */
  afterId?: string;
  /** Insert immediately before this instance's chain position. */
  beforeId?: string;
  fieldValues?: FieldValues;
}

/**
 * Create a new component record in `containerId`, then splice it into the
 * `precedes` chain at the given position. When neither `afterId` nor
 * `beforeId` is given (an empty document's first component), the chain
 * splice is skipped — there is nothing to link to yet.
 */
export function insertComponent(
  repo: SrsRepository,
  input: InsertComponentInput,
  onMutation: () => void = () => {}
): SrsRecord {
  const created = createRecordInContainer(
    repo,
    input.containerId,
    input.typeId,
    input.typeVersion,
    {
      fieldValues: input.fieldValues ?? {},
    } satisfies CreateRecordInput
  );
  if (input.afterId !== undefined || input.beforeId !== undefined) {
    insertIntoPrecedesChain(repo, {
      instanceId: created.instanceId,
      afterId: input.afterId,
      beforeId: input.beforeId,
    });
  }
  onMutation();
  return created;
}

export interface MoveComponentInput {
  instanceId: string;
  afterId?: string;
  beforeId?: string;
}

/** Move an already-chained component to a new position. */
export function moveComponent(
  repo: SrsRepository,
  input: MoveComponentInput,
  onMutation: () => void = () => {}
): void {
  moveInPrecedesChain(repo, input);
  onMutation();
}

export interface RemoveComponentInput {
  instanceId: string;
  containerId: string;
}

/** Unlink a component from its chain, drop it from container membership, then delete the record. */
export function removeComponent(
  repo: SrsRepository,
  input: RemoveComponentInput,
  onMutation: () => void = () => {}
): void {
  removeFromPrecedesChain(repo, { instanceId: input.instanceId });
  removeContainerMember(repo, input.containerId, input.instanceId);
  deleteRecord(repo, input.instanceId);
  onMutation();
}
