/**
 * The ONE essay header action list (srs-web#383). EssayShell renders it twice from the same
 * descriptors: as buttons on wide screens and as one overflow ActionMenu on narrow ones, so the
 * two cannot drift. Wiring only: each entry calls a shell callback.
 */
import type { MenuAction } from "../components/menu-action.js";

export interface HeaderAction extends MenuAction {
  variant: "ghost" | "mono";
  /** Toggle state (aria-pressed / active) for the button rendering. */
  pressed?: boolean;
  testid?: string;
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
  s: { expanded: boolean; commentMode: boolean; saving: boolean }
): HeaderAction[] {
  const all: (HeaderAction | false | undefined)[] = [
    {
      id: "new",
      label: "New document",
      variant: "ghost",
      run: h.onnew,
      enabled: true,
      testid: "new-document",
    },
    !!h.oncopy && {
      id: "copy",
      label: "Copy document",
      variant: "ghost",
      run: h.oncopy,
      enabled: true,
      testid: "copy-document",
    },
    !!h.onagent && {
      id: "agent",
      label: "Copy for agent",
      variant: "ghost",
      run: h.onagent,
      enabled: true,
      testid: "copy-for-agent",
    },
    { id: "help", label: "Markdown help", variant: "ghost", run: h.onhelp, enabled: true },
    {
      id: "margin",
      label: "Margin notes",
      variant: "ghost",
      run: h.onvariant,
      enabled: true,
      pressed: s.expanded,
      testid: "margin-variant",
    },
    {
      id: "comments",
      label: "Comments",
      variant: "ghost",
      run: h.oncomments,
      enabled: true,
      pressed: s.commentMode,
      testid: "comment-mode",
    },
    !!h.onsave && {
      id: "save",
      label: s.saving ? "Saving…" : "Save",
      variant: "mono",
      run: h.onsave,
      enabled: !s.saving,
    },
    { id: "export", label: "Export", variant: "mono", run: h.onexport, enabled: true },
    !!h.onexportmd && {
      id: "export-md",
      label: "Export markdown",
      variant: "mono",
      run: h.onexportmd,
      enabled: true,
      testid: "export-markdown",
    },
    !!h.onexplorer && {
      id: "explorer",
      label: "Explorer",
      variant: "ghost",
      run: h.onexplorer,
      enabled: true,
    },
    { id: "other", label: "Open another", variant: "ghost", run: h.onopenanother, enabled: true },
  ];
  return all.filter((a): a is HeaderAction => !!a);
}
