import type { IconComponent } from "./icon.js";

/** One row of an ActionMenu. Neutral so both the paragraph list and the header list satisfy it. */
export interface MenuAction {
  id: string;
  label: string;
  icon?: IconComponent;
  run: () => void;
  enabled: boolean;
  /** Present = a checkable row (`menuitemcheckbox`, aria-checked); "mixed" = partly on. */
  checked?: boolean | "mixed";
}

/**
 * One entry of a Toolbar registry (#423). `group` names the menu it lives in; `kind` says how it
 * renders: `primary` is a bar button (not in a menu), `toggle` a checkable row, `action` a plain row.
 * The Toolbar imports only this type, never an editor's registry.
 */
export interface ToolbarAction extends MenuAction {
  group: string;
  kind: "action" | "toggle" | "primary";
  testid?: string;
  /** Native popover invoker (the lone Help icon keeps toggling its popover natively). */
  popovertarget?: string;
  expanded?: boolean;
}
