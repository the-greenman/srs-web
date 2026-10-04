/**
 * The ONE per-paragraph action list (srs-web#382). Block renders it as desktop hover tools and
 * as the ⋯ menu; LayersPanel renders a subset as its per-row ⋯ menu. Every entry calls the same
 * shell callback the keyboard shortcut uses, so the surfaces cannot drift. No outline rules here:
 * the engine validates every move and the shell surfaces its error.
 */
export interface ParagraphHandlers {
  onnew?: () => void;
  onmove?: (dir: "up" | "down") => void;
  onindent?: (delta: 1 | -1) => void;
  onhide?: (hidden: boolean) => void;
  onpull?: () => void;
  ondelete?: () => void;
  onzoom?: () => void;
  oncopylink?: () => void;
  oncopyagent?: () => void;
  onrename?: () => void;
}

export type ParagraphActionId =
  | "add"
  | "up"
  | "down"
  | "indent"
  | "outdent"
  | "hide"
  | "draft"
  | "delete"
  | "zoom"
  | "link"
  | "agent"
  | "rename";

export interface ParagraphAction {
  id: ParagraphActionId;
  label: string;
  icon: string;
  run: () => void;
  enabled: boolean;
  /** Desktop hover-tool wording (aria-label / title); absent = menu only (hide uses EyeToggle). */
  tool?: { aria: string; title: string };
}

/** Ids shown as today's hover tools on devices with hover (the rest live in the ⋯ menu only). */
export const HOVER_TOOLS: ParagraphActionId[] = ["hide", "draft", "delete", "zoom", "link"];

export function paragraphActions(
  h: ParagraphHandlers,
  s: { label: string; hidden?: boolean; inherited?: boolean },
  only?: ParagraphActionId[]
): ParagraphAction[] {
  const all: (ParagraphAction | false | undefined)[] = [
    !!h.onnew && {
      id: "add",
      label: "Add paragraph below",
      icon: "+",
      run: h.onnew,
      enabled: true,
    },
    !!h.onmove && {
      id: "up",
      label: "Move up",
      icon: "↑",
      run: () => h.onmove?.("up"),
      enabled: true,
    },
    !!h.onmove && {
      id: "down",
      label: "Move down",
      icon: "↓",
      run: () => h.onmove?.("down"),
      enabled: true,
    },
    !!h.onindent && {
      id: "indent",
      label: "Indent",
      icon: "→",
      run: () => h.onindent?.(1),
      enabled: true,
    },
    !!h.onindent && {
      id: "outdent",
      label: "Outdent",
      icon: "←",
      run: () => h.onindent?.(-1),
      enabled: true,
    },
    !!h.onhide && {
      id: "hide",
      label: s.hidden ? "Show" : "Hide",
      icon: "◉",
      run: () => h.onhide?.(!s.hidden),
      enabled: !s.inherited,
    },
    !!h.onpull && {
      id: "draft",
      label: "Move to draft",
      icon: "↧",
      run: h.onpull,
      enabled: true,
      tool: { aria: `Move ${s.label} to draft`, title: "Move to draft" },
    },
    !!h.ondelete && {
      id: "delete",
      label: "Delete",
      icon: "✕",
      run: h.ondelete,
      enabled: true,
      tool: { aria: `Delete ${s.label}`, title: "Delete (moves to the Bin)" },
    },
    !!h.onzoom && {
      id: "zoom",
      label: "Zoom",
      icon: "⤢",
      run: h.onzoom,
      enabled: true,
      tool: { aria: `Zoom to ${s.label}`, title: "Zoom to this paragraph" },
    },
    !!h.oncopylink && {
      id: "link",
      label: "Copy link",
      icon: "🔗",
      run: h.oncopylink,
      enabled: true,
      tool: { aria: `Copy link to ${s.label}`, title: "Copy link to this paragraph" },
    },
    !!h.oncopyagent && {
      id: "agent",
      label: "Copy for agent",
      icon: "🤖",
      run: h.oncopyagent,
      enabled: true,
    },
    !!h.onrename && { id: "rename", label: "Rename", icon: "✎", run: h.onrename, enabled: true },
  ];
  return all.filter((a): a is ParagraphAction => !!a && (!only || only.includes(a.id)));
}
