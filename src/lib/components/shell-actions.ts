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
