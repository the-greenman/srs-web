/**
 * Document-level mutation and persistence coordination.
 *
 * The repository is mutated in place by both UI actions and future external
 * executors. A provider save therefore cannot assume that the repository still
 * represents the bytes it exported when its asynchronous write finishes.
 */

export interface DocumentRevision {
  /** Identifies one loaded repository lifetime. */
  epoch: number;
  /** Monotonically increases for each mutation within that lifetime. */
  revision: number;
}

/** A save is only current if its document epoch and revision still match. */
export type DocumentSaveSnapshot = Readonly<DocumentRevision>;

export class DocumentMutationTracker {
  #epoch = 0;
  #revision = 0;
  #persistedRevision = 0;

  /**
   * Start tracking a newly loaded repository. Restored working copies are
   * already dirty even before another mutation is made.
   */
  beginDocument({ dirty = false }: { dirty?: boolean } = {}): DocumentRevision {
    this.#epoch += 1;
    this.#revision = 0;
    this.#persistedRevision = dirty ? -1 : 0;
    return this.current;
  }

  get current(): DocumentRevision {
    return { epoch: this.#epoch, revision: this.#revision };
  }

  get dirty(): boolean {
    return this.#revision !== this.#persistedRevision;
  }

  /** Record one successful in-place repository mutation. */
  recordMutation(): DocumentRevision {
    this.#revision += 1;
    return this.current;
  }

  /** Capture the exact repository revision represented by an exported save payload. */
  captureSave(): DocumentSaveSnapshot {
    return this.current;
  }

  /**
   * Mark a successful provider write as persisted only when no later mutation
   * (or document replacement) occurred. Returns false when recovery/dirty
   * state must be retained for a subsequent save.
   */
  completeSave(snapshot: DocumentSaveSnapshot): boolean {
    if (snapshot.epoch !== this.#epoch || snapshot.revision !== this.#revision) return false;
    this.#persistedRevision = snapshot.revision;
    return true;
  }
}
