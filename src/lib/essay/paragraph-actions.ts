/**
 * The ONE per-paragraph action list (srs-web#382, #423). Block renders it as the ellipsis menu (everything)
 * and, for the `primary` entries, as the hover strip; LayersPanel renders a subset as its per-row ellipsis menu. Every entry calls the same
 * shell callback the keyboard shortcut uses, so the surfaces cannot drift. No outline rules here:
 * the engine validates every move and the shell surfaces its error.
 */
import type { IconComponent } from "$lib/components/icon";
import ArrowDown from "@lucide/svelte/icons/arrow-down";
import ArrowDownToLine from "@lucide/svelte/icons/arrow-down-to-line";
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Bot from "@lucide/svelte/icons/bot";
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import Link from "@lucide/svelte/icons/link";
import ListIndentDecrease from "@lucide/svelte/icons/list-indent-decrease";
import ListIndentIncrease from "@lucide/svelte/icons/list-indent-increase";
import Maximize2 from "@lucide/svelte/icons/maximize-2";
import Paperclip from "@lucide/svelte/icons/paperclip";
import Pencil from "@lucide/svelte/icons/pencil";
import Plus from "@lucide/svelte/icons/plus";
import Trash from "@lucide/svelte/icons/trash";

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
  onattach?: () => void;
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
  | "attach"
  | "rename";

export interface ParagraphAction {
  id: ParagraphActionId;
  label: string;
  icon: IconComponent;
  run: () => void;
  enabled: boolean;
  /** Strip wording (aria-label / title) for a `primary` action; hide uses EyeToggle, which names itself. */
  tool?: { aria: string; title: string };
  /** A hover-strip shortcut (owner D3: hide, zoom, link). Every primary is also in the menu; nothing is hover-only. */
  primary?: boolean;
}

export function paragraphActions(
  h: ParagraphHandlers,
  s: { label: string; hidden?: boolean; inherited?: boolean },
  only?: ParagraphActionId[]
): ParagraphAction[] {
  const all: (ParagraphAction | false | undefined)[] = [
    !!h.onnew && {
      id: "add",
      label: "Add paragraph below",
      icon: Plus,
      run: h.onnew,
      enabled: true,
    },
    !!h.onmove && {
      id: "up",
      label: "Move up",
      icon: ArrowUp,
      run: () => h.onmove?.("up"),
      enabled: true,
    },
    !!h.onmove && {
      id: "down",
      label: "Move down",
      icon: ArrowDown,
      run: () => h.onmove?.("down"),
      enabled: true,
    },
    !!h.onindent && {
      id: "indent",
      label: "Indent",
      icon: ListIndentIncrease,
      run: () => h.onindent?.(1),
      enabled: true,
    },
    !!h.onindent && {
      id: "outdent",
      label: "Outdent",
      icon: ListIndentDecrease,
      run: () => h.onindent?.(-1),
      enabled: true,
    },
    !!h.onhide && {
      id: "hide",
      label: s.hidden ? "Show" : "Hide",
      icon: s.hidden ? EyeOff : Eye,
      run: () => h.onhide?.(!s.hidden),
      enabled: !s.inherited,
      primary: true,
    },
    !!h.onpull && {
      id: "draft",
      label: "Move to draft",
      icon: ArrowDownToLine,
      run: h.onpull,
      enabled: true,
    },
    !!h.ondelete && {
      id: "delete",
      label: "Delete",
      icon: Trash,
      run: h.ondelete,
      enabled: true,
    },
    !!h.onzoom && {
      id: "zoom",
      label: "Zoom",
      icon: Maximize2,
      run: h.onzoom,
      enabled: true,
      tool: { aria: `Zoom to ${s.label}`, title: "Zoom to this paragraph" },
      primary: true,
    },
    !!h.oncopylink && {
      id: "link",
      label: "Copy link",
      icon: Link,
      run: h.oncopylink,
      enabled: true,
      tool: { aria: `Copy link to ${s.label}`, title: "Copy link to this paragraph" },
      primary: true,
    },
    !!h.oncopyagent && {
      id: "agent",
      label: "Copy for agent",
      icon: Bot,
      run: h.oncopyagent,
      enabled: true,
    },
    !!h.onattach && {
      id: "attach",
      label: "Attach file…",
      icon: Paperclip,
      run: h.onattach,
      enabled: true,
    },
    !!h.onrename && { id: "rename", label: "Rename", icon: Pencil, run: h.onrename, enabled: true },
  ];
  return all.filter((a): a is ParagraphAction => !!a && (!only || only.includes(a.id)));
}
