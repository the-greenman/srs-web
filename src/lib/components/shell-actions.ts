/** What every shell shares: the Document / View / Go groups and the Wide action (each shell keeps its own registry and spreads these in). */
import Compass from "@lucide/svelte/icons/compass";
import Eye from "@lucide/svelte/icons/eye";
import FileText from "@lucide/svelte/icons/file-text";
import type { ShellState } from "../shell-context.svelte.js";
import type { IconComponent } from "./icon.js";
import type { ToolbarAction } from "./menu-action.js";

/** The menus every shell has, in order. A shell that needs more (the essay's Help) appends its own. */
export const BASE_GROUPS: { id: string; label: string; icon: IconComponent }[] = [
  { id: "document", label: "Document", icon: FileText },
  { id: "view", label: "View", icon: Eye },
  { id: "go", label: "Go", icon: Compass },
];

/**
 * View > Wide: the one Wide toggle (`saveWide` via the shell). `margin-variant` is its testid.
 * `wideEnabled` names the capability: a shell without it gets no action.
 */
export const wideAction = (shell: ShellState): ToolbarAction | undefined =>
  shell.wideEnabled ? wide(shell) : undefined;

/** Go > Agents…: open the agent library (the shell decides where it lives; no relay needed). */
export const agentsAction = (run: () => void): ToolbarAction => ({
  id: "agents",
  group: "go",
  kind: "action",
  label: "Agents…",
  testid: "toolbar-agents",
  enabled: true,
  run,
});

/** Document > Packages…: the bundled packages installed here and their upgrades (#450). Present only while the document is writable. */
export const packagesAction = (run: () => void): ToolbarAction => ({
  id: "packages",
  group: "document",
  kind: "action",
  label: "Packages…",
  testid: "toolbar-packages",
  enabled: true,
  run,
});

/** Document > Save, the bar's one primary. `enabled` is the shell's own rule (Essay and Generic gate on dirty; Governance and Guides only on not saving). */
export const saveAction = (
  run: () => void,
  s: { saving: boolean; enabled: boolean }
): ToolbarAction => ({
  id: "save",
  group: "document",
  kind: "primary",
  label: s.saving ? "Saving…" : "Save",
  run,
  enabled: s.enabled,
  testid: "save-document",
});

/** Go > Open another (`toolbar-other`). */
export const openAnotherAction = (run: () => void): ToolbarAction => ({
  id: "other",
  group: "go",
  kind: "action",
  label: "Open another",
  run,
  enabled: true,
});

/** Document > Export .srs, and Export .srsj when a handler is given. */
export const exportActions = (h: {
  onexport: () => void;
  onexportsrsj?: () => void;
}): ToolbarAction[] => [
  {
    id: "export",
    group: "document",
    kind: "action",
    label: "Export .srs",
    run: h.onexport,
    enabled: true,
  },
  ...(h.onexportsrsj
    ? [
        {
          id: "export-srsj",
          group: "document",
          kind: "action",
          label: "Export .srsj",
          run: h.onexportsrsj,
          enabled: true,
        } as ToolbarAction,
      ]
    : []),
];

export interface CommonHandlers {
  /** Absent while the document cannot be saved (read-only): no Save is offered. */
  onsave?: () => void;
  onexport: () => void;
  onexportsrsj?: () => void;
  /** Absent when the shell cannot open the agent library. */
  onopenagents?: () => void;
  /** Absent while the document is read-only (an upgrade writes). */
  onopenpackages?: () => void;
  onopenanother: () => void;
}

/** Governance's and Guides' shared registry: Save, the exports, Wide, Agents…, Open another. */
export function commonActions(
  h: CommonHandlers,
  s: { shell: ShellState; saving: boolean }
): ToolbarAction[] {
  const all: (ToolbarAction | undefined)[] = [
    h.onsave ? saveAction(h.onsave, { saving: s.saving, enabled: !s.saving }) : undefined,
    ...exportActions(h),
    h.onopenpackages ? packagesAction(h.onopenpackages) : undefined,
    wideAction(s.shell),
    h.onopenagents ? agentsAction(h.onopenagents) : undefined,
    openAnotherAction(h.onopenanother),
  ];
  return all.filter((a): a is ToolbarAction => !!a);
}

const wide = (shell: ShellState): ToolbarAction => ({
  id: "wide",
  group: "view",
  kind: "toggle",
  checked: shell.wide,
  label: "Wide",
  testid: "margin-variant",
  enabled: true,
  run: shell.toggleWide,
});
