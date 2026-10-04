/**
 * The ONE essay header action list (srs-web#383, #423). Each entry names its `group` (Document /
 * View / Go / Help) and `kind`; `Toolbar` renders the list once, whatever the width (labelled menus,
 * icon-only menus, or one overflow). Wiring only: each entry calls a shell callback.
 */
import type { ToolbarAction } from "../components/menu-action.js";

export type HeaderGroup = "document" | "view" | "go" | "help";

export interface HeaderAction extends ToolbarAction {
  group: HeaderGroup;
}

export const HEADER_GROUPS: { id: HeaderGroup; label: string }[] = [
  { id: "document", label: "Document" },
  { id: "view", label: "View" },
  { id: "go", label: "Go" },
  { id: "help", label: "Help" },
];

/** Menu groups in order, empty groups skipped; the `primary` action is split off (the bar renders it). */
export function groupedActions<A extends ToolbarAction>(
  actions: A[],
  groups: { id: string; label: string }[] = HEADER_GROUPS
): { primary: A[]; groups: { group: string; label: string; items: A[] }[] } {
  const menu = actions.filter((a) => a.kind !== "primary");
  return {
    primary: actions.filter((a) => a.kind === "primary"),
    groups: groups
      .map((g) => ({ group: g.id, label: g.label, items: menu.filter((a) => a.group === g.id) }))
      .filter((g) => g.items.length > 0),
  };
}

export interface HeaderHandlers {
  onnew: () => void;
  oncopy?: () => void;
  /** Copy the agent handoff (whole essay, or the zoom target). Absent while no essay is open. */
  onagent?: () => void;
  onhelp: () => void;
  onvariant: () => void;
  oncomments: () => void;
  onsave?: () => void;
  onexport: () => void;
  /** Download the visible essay text as markdown. Absent while no essay is open. */
  onexportmd?: () => void;
  onexplorer?: () => void;
  onopenanother: () => void;
}

export function headerActions(
  h: HeaderHandlers,
  s: {
    expanded: boolean;
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
    {
      id: "margin",
      group: "view",
      kind: "toggle",
      label: "Margin notes",
      run: h.onvariant,
      enabled: true,
      checked: s.expanded,
      testid: "margin-variant",
    },
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
