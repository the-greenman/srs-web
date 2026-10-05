/**
 * The generic shell's Toolbar registry (#424): Save is the primary, Export lives in Document, Full
 * preview and Wide in View, Open another in Go. Wiring only; the shared Wide action comes from
 * shell-actions.ts (one definition), and no shell imports another's registry.
 */
import type { ToolbarAction } from "../components/menu-action.js";
import { agentsAction, wideAction } from "../components/shell-actions.js";
import type { ShellState } from "../shell-context.svelte.js";

export interface GenericHandlers {
  /** Absent while the document cannot be saved (read-only): no Save is offered. */
  onsave?: () => void;
  onexport: () => void;
  onopenanother: () => void;
  /** Absent when the shell cannot open the agent library. */
  onopenagents?: () => void;
  /** Absent unless the open composition has a blueprint editor to preview. */
  onpreview?: () => void;
}

export function genericActions(
  h: GenericHandlers,
  s: { shell: ShellState; saving: boolean; dirty: boolean; fullPreview: boolean }
): ToolbarAction[] {
  const all: (ToolbarAction | false | undefined)[] = [
    !!h.onsave && {
      id: "save",
      group: "document",
      kind: "primary",
      label: s.saving ? "Saving…" : "Save",
      run: h.onsave,
      enabled: !s.saving && s.dirty,
      testid: "save-document",
    },
    {
      id: "export",
      group: "document",
      kind: "action",
      label: "Export",
      run: h.onexport,
      enabled: true,
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
    wideAction(s.shell),
    !!h.onopenagents && agentsAction(h.onopenagents),
    {
      id: "other",
      group: "go",
      kind: "action",
      label: "Open another",
      run: h.onopenanother,
      enabled: true,
    },
  ];
  return all.filter((a): a is ToolbarAction => !!a);
}
