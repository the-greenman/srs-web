/**
 * The shell's presentation state, shared with the bar and the triggers through context (#424).
 * `AppShell` creates one `ShellState` during script init (before any child renders) and `getShell()`
 * is undefined-safe, so a standalone `Topbar` or `Toolbar` outside an `AppShell` renders no triggers.
 * Wide is the ONE Wide state; it persists only through `saveWide`.
 */
import { getContext, setContext } from "svelte";
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

  toggleWide = (): void => {
    this.wide = !this.wide;
    saveWide(this.wide);
  };
}

export const setShell = (s: ShellState): ShellState => setContext(KEY, s);
export const getShell = (): ShellState | undefined => getContext<ShellState | undefined>(KEY);
