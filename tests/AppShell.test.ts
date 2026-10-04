// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AppShell from "../src/lib/components/AppShell.svelte";
import { ShellState } from "../src/lib/shell-context.svelte.js";

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
