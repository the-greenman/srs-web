import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
/**
 * The ONE essay header action list (srs-web#383, #423). Each entry names its `group` (Document /
 * View / Go / Help) and `kind`; `Toolbar` renders the list once, whatever the width (labelled menus,
 * icon-only menus, or one overflow). Wiring only: each entry calls a shell callback.
 */
import type { IconComponent } from "../components/icon.js";
import type { ToolbarAction } from "../components/menu-action.js";
import { BASE_GROUPS, agentsAction, wideAction } from "../components/shell-actions.js";
import type { ShellState } from "../shell-context.svelte.js";

export type HeaderGroup = "document" | "view" | "go" | "help";

export interface HeaderAction extends ToolbarAction {
  group: HeaderGroup;
}

export const HEADER_GROUPS: { id: HeaderGroup; label: string; icon: IconComponent }[] = [
  ...(BASE_GROUPS as { id: HeaderGroup; label: string; icon: IconComponent }[]),
  { id: "help", label: "Help", icon: CircleQuestionMark },
];

export interface HeaderHandlers {
  onnew: () => void;
  oncopy?: () => void;
  /** Copy the agent handoff (whole essay, or the zoom target). Absent while no essay is open. */
  onagent?: () => void;
  onhelp: () => void;
  oncomments: () => void;
  onsave?: () => void;
  onexport: () => void;
  /** Download the visible essay text as markdown. Absent while no essay is open. */
  onexportmd?: () => void;
  /** Download the essay's snapshot (.srs slice). Absent while no essay is open or its package cannot bundle. */
  onsnapshot?: () => void;
  onexplorer?: () => void;
  /** Absent when the shell has no agent panel to open. */
  onopenagents?: () => void;
  onopenanother: () => void;
}

export function headerActions(
  h: HeaderHandlers,
  s: {
    /** The shell's state: View > Wide is its one toggle (`wideAction`), present only when the shell has the capability. */
    shell: ShellState;
    comments: "all" | "none" | "mixed";
    saving: boolean;
    /** Anything to save; Save is disabled when clean (D4). */
    dirty: boolean;
    /** The Help popover's id and open state, so the Help icon stays a native invoker. */
    help?: { id: string; open: boolean };
  }
): HeaderAction[] {
  const all: (HeaderAction | false | undefined)[] = [
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
      id: "new",
      group: "document",
      kind: "action",
      label: "New document",
      run: h.onnew,
      enabled: true,
      testid: "new-document",
    },
    !!h.oncopy && {
      id: "copy",
      group: "document",
      kind: "action",
      label: "Copy document",
      run: h.oncopy,
      enabled: true,
      testid: "copy-document",
    },
    !!h.onagent && {
      id: "agent",
      group: "document",
      kind: "action",
      label: "Copy for agent",
      run: h.onagent,
      enabled: true,
      testid: "copy-for-agent",
    },
    {
      id: "export",
      group: "document",
      kind: "action",
      label: "Export",
      run: h.onexport,
      enabled: true,
    },
    !!h.onexportmd && {
      id: "export-md",
      group: "document",
      kind: "action",
      label: "Export markdown",
      run: h.onexportmd,
      enabled: true,
      testid: "export-markdown",
    },
    !!h.onsnapshot && {
      id: "export-snapshot",
      group: "document",
      kind: "action",
      label: "Export snapshot",
      run: h.onsnapshot,
      enabled: true,
      testid: "export-snapshot",
    },
    wideAction(s.shell) as HeaderAction | undefined,
    {
      id: "comments",
      group: "view",
      kind: "toggle",
      label: "Comments",
      run: h.oncomments,
      enabled: true,
      checked: s.comments === "mixed" ? "mixed" : s.comments === "all",
      testid: "comment-mode",
    },
    !!h.onexplorer && {
      id: "explorer",
      group: "go",
      kind: "action",
      label: "Explorer",
      run: h.onexplorer,
      enabled: true,
    },
    !!h.onopenagents && (agentsAction(h.onopenagents) as HeaderAction),
    {
      id: "other",
      group: "go",
      kind: "action",
      label: "Open another",
      run: h.onopenanother,
      enabled: true,
    },
    {
      id: "help",
      group: "help",
      kind: "action",
      label: "Markdown help",
      run: h.onhelp,
      enabled: true,
      popovertarget: s.help?.id,
      expanded: s.help?.open,
    },
  ];
  return all.filter((a): a is HeaderAction => !!a);
}
