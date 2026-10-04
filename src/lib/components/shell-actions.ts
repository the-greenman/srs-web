/** Actions shared by every shell (each shell keeps its own registry and spreads these in). */
import type { ShellState } from "../shell-context.svelte.js";
import type { ToolbarAction } from "./menu-action.js";

/**
 * View > Wide: the one Wide toggle (`saveWide` via the shell). `margin-variant` is its testid.
 * `wideEnabled` names the capability: a shell without it gets no action.
 */
export const wideAction = (shell: ShellState): ToolbarAction | undefined =>
  shell.wideEnabled ? wide(shell) : undefined;

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
