/**
 * The shared "what changed" state (srs-web#587): App refreshes it on every write and save; the
 * "Unsaved changes" status in each shell reads it through context, so no shell takes a new prop.
 */
import { getContext, setContext } from "svelte";
import { type DocumentChanges, markSaved, readChanges } from "./document-changes.js";
import type { SrsRepository } from "./srs-client.js";

const KEY = Symbol("srs-web.document-changes");
const EMPTY: DocumentChanges = { total: 0, unsaved: false, groups: [] };

export class DocumentChangesState {
  view = $state<DocumentChanges>(EMPTY);

  /** Re-read from the engine; a failed read leaves the list empty rather than breaking a write. */
  refresh = (repo: SrsRepository | null | undefined): void => {
    if (!repo) {
      this.view = EMPTY;
      return;
    }
    try {
      this.view = readChanges(repo);
    } catch {
      this.view = EMPTY;
    }
  };

  /** The document was opened or saved: the baseline moves, so the list empties. */
  saved = (repo: SrsRepository | null | undefined): void => {
    if (repo) {
      try {
        markSaved(repo);
      } catch {
        /* the baseline is advisory; the dirty flag still comes from write_epoch */
      }
    }
    this.refresh(repo);
  };
}

export const setDocumentChanges = (s: DocumentChangesState): DocumentChangesState =>
  setContext(KEY, s);
export const getDocumentChanges = (): DocumentChangesState | undefined =>
  getContext<DocumentChangesState | undefined>(KEY);
