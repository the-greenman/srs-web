// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AppShell from "../src/lib/components/AppShell.svelte";
import Toolbar from "../src/lib/components/Toolbar.svelte";
import { ShellState } from "../src/lib/shell-context.svelte.js";
import ShellHost from "./ShellHost.svelte";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const snip = (html: string) => createRawSnippet(() => ({ render: () => html }));
const nav = snip('<nav data-testid="nav">n</nav>');
const main = snip('<main data-testid="main">m</main>');
const inspector = snip('<aside data-testid="inspector">i</aside>');

it("renders the three regions; omitting nav or inspector removes the column", () => {
  const all = render(AppShell, { nav, main, inspector });
  expect(all.getByTestId("nav")).toBeTruthy();
  expect(all.getByTestId("main")).toBeTruthy();
  expect(all.getByTestId("inspector")).toBeTruthy();
  expect(all.container.querySelector(".app--no-nav")).toBeNull();
  cleanup();
  const bare = render(AppShell, { main });
  expect(bare.queryByTestId("nav")).toBeNull();
  expect(bare.queryByTestId("inspector")).toBeNull();
  expect(bare.container.querySelector(".app--no-nav.app--no-inspector")).not.toBeNull();
});

it("restores the stored column widths onto .app", () => {
  store.set("srs-web.columns", JSON.stringify({ nav: 300, inspector: 400 }));
  const { container } = render(AppShell, { nav, main, inspector });
  const app = container.querySelector<HTMLElement>(".app")!;
  expect(app.style.getPropertyValue("--nav-width")).toBe("300px");
  expect(app.style.getPropertyValue("--inspector-width")).toBe("400px");
});

it("data-margin on .app is expanded only for a Wide-capable shell with Wide on", () => {
  store.set("srs-web.margin", "expanded");
  const off = render(AppShell, { main });
  expect(off.container.querySelector(".app")!.getAttribute("data-margin")).toBe("compact");
  cleanup();
  const on = render(AppShell, { main, wide: true });
  expect(on.container.querySelector(".app")!.getAttribute("data-margin")).toBe("expanded");
  cleanup();
  store.clear();
  const stored = render(AppShell, { main, wide: true });
  expect(stored.container.querySelector(".app")!.getAttribute("data-margin")).toBe("compact");
});

it("a given ShellState drives the carrier and toggleWide persists through saveWide", async () => {
  const shell = new ShellState({ wideEnabled: true });
  const { container } = render(AppShell, { main, shell });
  const app = container.querySelector(".app")!;
  expect(app.getAttribute("data-margin")).toBe("compact");
  shell.toggleWide();
  await Promise.resolve();
  expect(app.getAttribute("data-margin")).toBe("expanded");
  expect(store.get("srs-web.margin")).toBe("expanded");
});

const noop = () => {};
function width(w: number) {
  vi.stubGlobal("matchMedia", (q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1]);
    return { matches: w <= max, addEventListener: noop, removeEventListener: noop };
  });
}

it("desktop mode: nav and inspector are grid columns, no drawers", () => {
  width(1440);
  const { container, getByTestId } = render(AppShell, { nav, main, inspector });
  expect(container.querySelector('[data-testid^="shell-drawer"]')).toBeNull();
  expect(container.querySelector(".app > [data-testid='nav']")).toBeTruthy();
  expect(getByTestId("inspector")).toBeTruthy();
});

it("drawer mode: the nav renders inside the nav drawer and not in the grid; the inspector likewise at <= 1100", () => {
  width(375);
  const { container } = render(AppShell, { nav, main, inspector });
  const navDrawer = container.querySelector('[data-testid="shell-drawer-nav"]')!;
  const inspDrawer = container.querySelector('[data-testid="shell-drawer-inspector"]')!;
  expect(navDrawer.querySelector('[data-testid="nav"]')).toBeTruthy();
  expect(inspDrawer.querySelector('[data-testid="inspector"]')).toBeTruthy();
  expect(container.querySelector(".app > [data-testid='nav']")).toBeNull();
  expect(container.querySelector(".app--no-nav.app--no-inspector")).not.toBeNull();
});

it("between 721 and 1100 only the inspector is a drawer", () => {
  width(900);
  const { container } = render(AppShell, { nav, main, inspector });
  expect(container.querySelector('[data-testid="shell-drawer-nav"]')).toBeNull();
  expect(container.querySelector('[data-testid="shell-drawer-inspector"]')).not.toBeNull();
});

it("setShell ran before children: a Toolbar inside finds the context and renders both triggers; a standalone Toolbar renders none", async () => {
  width(375);
  const host = render(ShellHost, { badge: 3 });
  expect(host.getByTestId("nav-trigger")).toBeTruthy();
  expect(host.getByTestId("inspector-trigger")).toBeTruthy();
  expect(host.getByTestId("inspector-badge").textContent).toBe("3");
  // NavTrigger is first and InspectorTrigger last in the bar.
  expect(
    host.container
      .querySelector(".toolbar")!
      .firstElementChild!.contains(host.getByTestId("nav-trigger"))
  ).toBe(true);
  expect(
    host.container
      .querySelector(".toolbar")!
      .lastElementChild!.contains(host.getByTestId("inspector-trigger"))
  ).toBe(true);
  // choosing the triggers opens the drawers
  await fireEvent.click(host.getByTestId("nav-trigger"));
  expect((host.getByTestId("shell-drawer-nav") as HTMLDialogElement).open).toBe(true);
  cleanup();
  const alone = render(Toolbar, { title: "c", actions: [], groups: [] });
  expect(alone.queryByTestId("nav-trigger")).toBeNull();
  expect(alone.queryByTestId("inspector-trigger")).toBeNull();
});

it("desktop width: the triggers do not render", () => {
  width(1440);
  const host = render(ShellHost, { badge: 3 });
  expect(host.queryByTestId("nav-trigger")).toBeNull();
  expect(host.queryByTestId("inspector-trigger")).toBeNull();
});
