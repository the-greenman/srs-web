/**
 * The one notice store (#441). Toasts are transient EVENTS ("Link copied", a save result), pinned
 * notices are persistent document-level STATE (the catalog diagnostics). Presentation only (ADR-001):
 * diagnostics are grouped on the exact message the engine gave; no code is parsed out of message text
 * (structured diagnostics: srs-rust#1264, and `groupDiagnostics` is the one function that will change).
 * Module-level and shell-free: App and the shells call `notify` / `pinNotice`; `Main` renders them.
 */
import { SvelteMap } from "svelte/reactivity";
import type { Diagnostic as EngineDiagnostic } from "./srs-client.js";
import type { Diagnostic, DiagnosticSeverity } from "./types.js";

export type NoticeKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  key?: string;
  kind: NoticeKind;
  text: string;
  testid?: string;
  /** Errors are sticky: no timer, they stay until dismissed or the same key replaces them. */
  sticky: boolean;
}

export interface NotifyOptions {
  kind?: NoticeKind;
  text: string;
  /** A second call with the same key replaces that toast in place and restarts its timer. */
  key?: string;
  testid?: string;
  /** Milliseconds before a non-error toast goes (default `TOAST_MS`). */
  duration?: number;
}

/** Default lifetime of a non-error toast. */
export const TOAST_MS = 4000;

export const toasts = $state<Toast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

function clearTimer(id: number): void {
  const t = timers.get(id);
  if (t !== undefined) clearTimeout(t);
  timers.delete(id);
}

/** Show a toast; returns its id. */
export function notify(opts: NotifyOptions): number {
  const kind = opts.kind ?? "info";
  const sticky = kind === "error";
  const existing = opts.key === undefined ? -1 : toasts.findIndex((t) => t.key === opts.key);
  const id = existing >= 0 ? toasts[existing].id : nextId++;
  const toast: Toast = { id, key: opts.key, kind, text: opts.text, testid: opts.testid, sticky };
  clearTimer(id);
  if (existing >= 0) toasts[existing] = toast;
  else toasts.push(toast);
  if (!sticky)
    timers.set(
      id,
      setTimeout(() => dismiss(id), opts.duration ?? TOAST_MS)
    );
  return id;
}

export function dismiss(id: number): void {
  clearTimer(id);
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

export function dismissKey(key: string): void {
  for (const t of toasts.filter((x) => x.key === key)) dismiss(t.id);
}

/** Pinned notices: persistent, document-level, rendered by `NoticeRegion`. */
export interface PinnedNotice {
  key: string;
  /** The dismissal scope for a diagnostics notice (D3: per session, per document). */
  documentKey: string;
  kind: NoticeKind;
  /** Rendered as a grouped, collapsible `Diagnostics` notice. */
  diagnostics?: Diagnostic[];
  /** Rendered as a plain `Notice` when there are no diagnostics. */
  text?: string;
  testid?: string;
}

export const pinned = $state<PinnedNotice[]>([]);

/** Same key replaces. */
export function pinNotice(n: PinnedNotice): void {
  const i = pinned.findIndex((p) => p.key === n.key);
  if (i >= 0) pinned[i] = n;
  else pinned.push(n);
}

export function unpinNotice(key: string): void {
  const i = pinned.findIndex((p) => p.key === key);
  if (i >= 0) pinned.splice(i, 1);
}

/** Session-scope dismissal of a diagnostics notice: documentKey to the content it was dismissed at. */
const dismissedDocs = new SvelteMap<string, string>();

export const dismissDiagnostics = (documentKey: string, hash: string): void => {
  dismissedDocs.set(documentKey, hash);
};

/** Dismissed only while the diagnostics are the ones that were dismissed; a change re-shows them. */
export const isDiagnosticsDismissed = (documentKey: string, hash: string): boolean =>
  dismissedDocs.get(documentKey) === hash;

/**
 * Clear toasts (and their timers) and the diagnostics dismissals. Pinned notices are NOT cleared: the
 * caller replaces or unpins them when it knows the new document's diagnostics. Call it FIRST on every
 * document load.
 */
export function resetNotices(): void {
  for (const id of [...timers.keys()]) clearTimer(id);
  toasts.splice(0, toasts.length);
  dismissedDocs.clear();
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

export interface DiagnosticGroup {
  key: string;
  severity: DiagnosticSeverity;
  message: string;
  count: number;
  where: string[];
}

/**
 * The ONE adapter from the engine's shapes to the UI `Diagnostic`: the repository report's
 * `{severity: "warning"}` becomes `warn`; a plain string (render, find, navigation: no severity) is `warn`.
 */
export function toUiDiagnostic(d: EngineDiagnostic | Diagnostic | string): Diagnostic {
  if (typeof d === "string") return { severity: "warn", message: d };
  const sev = d.severity as string;
  const severity: DiagnosticSeverity = sev === "error" ? "error" : sev === "info" ? "info" : "warn";
  const where = (d as Diagnostic).where;
  return where ? { severity, message: d.message, where } : { severity, message: d.message };
}

export const diagnosticsFromStrings = (items: string[]): Diagnostic[] => items.map(toUiDiagnostic);

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = { error: 0, warn: 1, info: 2 };

/** Group on the exact (trimmed) message and severity; errors first, then warnings, then info, then first appearance. */
export function groupDiagnostics(items: Diagnostic[]): DiagnosticGroup[] {
  const groups = new Map<string, DiagnosticGroup>();
  for (const d of items) {
    const message = d.message.trim();
    const key = `${d.severity}\u0000${message}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, severity: d.severity, message, count: 0, where: [] };
      groups.set(key, g);
    }
    g.count++;
    if (d.where && !g.where.includes(d.where)) g.where.push(d.where);
  }
  return [...groups.values()]
    .map((g, i) => ({ g, i }))
    .sort((a, b) => SEVERITY_ORDER[a.g.severity] - SEVERITY_ORDER[b.g.severity] || a.i - b.i)
    .map((x) => x.g);
}

/** Content hash of a grouped list: what a dismissal is keyed against. */
export const diagnosticsHash = (groups: DiagnosticGroup[]): string =>
  groups.map((g) => `${g.key}\u0000${g.count}`).join("\u0001");
