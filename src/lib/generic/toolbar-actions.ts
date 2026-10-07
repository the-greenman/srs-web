/**
 * The generic shell's Toolbar registry (#424): Save is the primary, Export lives in Document, Full
 * preview and Wide in View, Open another in Go. Wiring only; the shared Wide action comes from
 * shell-actions.ts (one definition), and no shell imports another's registry.
 */
import type { ToolbarAction } from "../components/menu-action.js";
import {
  agentsAction,
  openAnotherAction,
  packagesAction,
  saveAction,
  wideAction,
} from "../components/shell-actions.js";
import type { ShellState } from "../shell-context.svelte.js";

export interface GenericHandlers {
  /** Absent while the document cannot be saved (read-only): no Save is offered. */
  onsave?: () => void;
  onexport: () => void;
  /** Present only while the document is read-only (#471): Document > Save a copy… (kept out of the bar). */
  onsavecopy?: () => void;
  onopenanother: () => void;
  /** Absent when the shell cannot open the agent library. */
  onopenagents?: () => void;
  /** Absent while the document is read-only (an upgrade writes). */
  onopenpackages?: () => void;
  /** Absent unless the open composition has a blueprint editor to preview. */
  onpreview?: () => void;
}

export function genericActions(
  h: GenericHandlers,
  s: { shell: ShellState; saving: boolean; dirty: boolean; fullPreview: boolean }
): ToolbarAction[] {
  const all: (ToolbarAction | false | undefined)[] = [
    !!h.onsave && saveAction(h.onsave, { saving: s.saving, enabled: !s.saving && s.dirty }),
    {
      id: "export",
      group: "document",
      kind: "action",
      label: "Export",
      run: h.onexport,
      enabled: true,
    },
    !!h.onsavecopy && {
      id: "save-copy",
      group: "document",
      kind: "action",
      label: "Save a copy…",
      run: h.onsavecopy,
      enabled: true,
      testid: "save-copy",
    },
    !!h.onpreview && {
      id: "preview",
      group: "view",
      kind: "toggle",
      label: "Full preview",
      run: h.onpreview,
      enabled: true,
      checked: s.fullPreview,
      testid: "full-preview-toggle",
    },
    !!h.onopenpackages && packagesAction(h.onopenpackages),
    wideAction(s.shell),
    !!h.onopenagents && agentsAction(h.onopenagents),
    openAnotherAction(h.onopenanother),
  ];
  return all.filter((a): a is ToolbarAction => !!a);
}
