/**
 * The Lenses view's Toolbar registry: Save is the primary (absent while read-only), the exports and
 * Save a copy… (read-only only) live in Document, Wide in View, Explorer, Agents… and Open another in
 * Go. Wiring only; every shared action comes from shell-actions.ts (one definition each).
 */
import type { ToolbarAction } from "../components/menu-action.js";
import {
  agentsAction,
  exportActions,
  openAnotherAction,
  packagesAction,
  saveAction,
  wideAction,
} from "../components/shell-actions.js";
import type { ShellState } from "../shell-context.svelte.js";

export interface LensHandlers {
  /** Absent while read-only. */
  onsave?: () => void;
  onexport: () => void;
  onexportsrsj?: () => void;
  /** Present only while read-only. */
  onsavecopy?: () => void;
  onopenanother: () => void;
  onopenagents?: () => void;
  /** Absent while read-only. */
  onopenpackages?: () => void;
  onopenexplorer: () => void;
}

export function lensActions(
  h: LensHandlers,
  s: { shell: ShellState; saving: boolean; dirty: boolean }
): ToolbarAction[] {
  const all: (ToolbarAction | false | undefined)[] = [
    !!h.onsave && saveAction(h.onsave, { saving: s.saving, enabled: !s.saving && s.dirty }),
    ...exportActions(h),
    !!h.onsavecopy && {
      id: "save-copy",
      group: "document",
      kind: "action",
      label: "Save a copy…",
      run: h.onsavecopy,
      enabled: true,
      testid: "save-copy",
    },
    !!h.onopenpackages && packagesAction(h.onopenpackages),
    wideAction(s.shell),
    {
      id: "explorer",
      group: "go",
      kind: "action",
      label: "Explorer",
      run: h.onopenexplorer,
      enabled: true,
    },
    !!h.onopenagents && agentsAction(h.onopenagents),
    openAnotherAction(h.onopenanother),
  ];
  return all.filter((a): a is ToolbarAction => !!a);
}
