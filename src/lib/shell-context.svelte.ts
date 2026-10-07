/**
 * The shell's presentation state, shared with the bar and the triggers through context (#424).
 * `AppShell` creates one `ShellState` during script init (before any child renders) and `getShell()`
 * is undefined-safe, so a standalone `Toolbar` outside an `AppShell` renders no triggers.
 * Wide is the ONE Wide state; it persists only through `saveWide`.
 */
import { getContext, setContext } from "svelte";
import { type Column, loadColumns, saveColumns } from "./columns.js";
import { loadWide, saveWide } from "./wide.js";

const KEY = Symbol("srs-web.shell");

export class ShellState {
  /** The shell has the Wide capability (it shows the toggle and honours it). */
  wideEnabled = $state(false);
  wide = $state(loadWide());
  navOpen = $state(false);
  inspectorOpen = $state(false);
  navWidth = $state(0);
  inspectorWidth = $state(0);
  inspectorBadge = $state(0);
  /** Drawer modes, set by `AppShell` from matchMedia. */
  navDrawer = $state(false);
  inspectorDrawer = $state(false);
  hasNav = $state(false);
  hasInspector = $state(false);

  constructor(opts: { wideEnabled?: boolean } = {}) {
    this.wideEnabled = opts.wideEnabled ?? false;
    const c = loadColumns();
    this.navWidth = c.nav;
    this.inspectorWidth = c.inspector;
  }

  /** Live width while dragging (already clamped by the handle). */
  setColumn = (kind: Column, px: number): void => {
    if (kind === "nav") this.navWidth = px;
    else this.inspectorWidth = px;
  };

  /** Persist both widths (on pointer release or a key press, not per move). */
  commitColumns = (): void => saveColumns({ nav: this.navWidth, inspector: this.inspectorWidth });

  toggleWide = (): void => {
    this.wide = !this.wide;
    saveWide(this.wide);
  };
}

export const setShell = (s: ShellState): ShellState => setContext(KEY, s);
export const getShell = (): ShellState | undefined => getContext<ShellState | undefined>(KEY);
