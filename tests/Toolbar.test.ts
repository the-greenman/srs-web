// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import Toolbar from "../src/lib/components/Toolbar.svelte";
import { HEADER_GROUPS, headerActions } from "../src/lib/essay/header-actions.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const noop = () => {};
const handlers = {
  onnew: noop,
  oncopy: noop,
  onhelp: noop,
  onvariant: noop,
  oncomments: noop,
  onsave: noop,
  onexport: noop,
  onopenanother: noop,
  onexplorer: noop,
};
const state = { expanded: false, comments: "mixed" as const, saving: false, dirty: true };
const actions = (s = state) => headerActions(handlers, s);

function width(w: number) {
  vi.stubGlobal("matchMedia", (q: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1]);
    return { matches: w <= max, addEventListener: noop, removeEventListener: noop };
  });
}
const mount = (props: object = {}) =>
  render(Toolbar, { title: "My essay", groups: HEADER_GROUPS, actions: actions(), ...props });

it("full tier: Document/View/Go labelled triggers, Help is a lone icon (not a menu), Save is the primary", () => {
  width(1440);
  const { getByRole, getByTestId, queryByTestId } = mount();
  for (const n of ["Document", "View", "Go"])
    expect(getByRole("button", { name: n }).getAttribute("aria-haspopup")).toBe("menu");
  const help = getByRole("button", { name: "Markdown help" });
  expect(help.getAttribute("aria-haspopup")).toBeNull();
  expect(queryByTestId("header-menu")).toBeNull();
  expect(getByTestId("save-document").hasAttribute("disabled")).toBe(false);
});

it("compact tier: the same three menus, icon-only (accessible name = group name)", () => {
  width(768);
  const { getByRole, getByTestId } = mount();
  for (const n of ["Document", "View", "Go"])
    expect(getByRole("button", { name: n }).textContent?.trim()).toBe("");
  expect(getByTestId("toolbar").dataset.tier).toBe("compact");
});

it("narrow tier: title, Save and exactly one overflow trigger, no group triggers", async () => {
  width(390);
  const { getByTestId, queryByTestId, container, getByText } = mount();
  expect(getByText("My essay")).toBeTruthy();
  expect(getByTestId("save-document")).toBeTruthy();
  expect(queryByTestId("toolbar-menu-document")).toBeNull();
  expect(container.querySelectorAll('[aria-haspopup="menu"]').length).toBe(1);
  await fireEvent.click(getByTestId("header-menu"));
  expect(getByTestId("comment-mode").getAttribute("aria-checked")).toBe("mixed");
  expect(getByTestId("toolbar-help")).toBeTruthy();
});

it("View menu rows are menuitemcheckbox with aria-checked and stay open on toggle", async () => {
  width(1440);
  const run = vi.fn();
  const a = actions().map((x) => (x.id === "margin" ? { ...x, run } : x));
  const { getByTestId } = mount({ actions: a });
  await fireEvent.click(getByTestId("toolbar-menu-view"));
  await tick();
  expect(getByTestId("comment-mode").getAttribute("role")).toBe("menuitemcheckbox");
  expect(getByTestId("comment-mode").getAttribute("aria-checked")).toBe("mixed");
  expect(getByTestId("margin-variant").getAttribute("aria-checked")).toBe("false");
  await fireEvent.click(getByTestId("margin-variant"));
  expect(run).toHaveBeenCalledOnce();
  expect(getByTestId("margin-variant")).toBeTruthy();
});

it("the primary is disabled when it is not enabled, and absent when the registry has none", () => {
  width(1440);
  const off = mount({ actions: actions({ ...state, dirty: false }) });
  expect(off.getByTestId("save-document").hasAttribute("disabled")).toBe(true);
  cleanup();
  const none = mount({ actions: headerActions({ ...handlers, onsave: undefined }, state) });
  expect(none.queryByTestId("save-document")).toBeNull();
});

it("one renderer: no action testid appears twice at any tier", async () => {
  for (const w of [1440, 768, 390]) {
    width(w);
    const { container, getByTestId } = mount();
    for (const t of [
      "toolbar-menu-document",
      "toolbar-menu-view",
      "toolbar-menu-go",
      "header-menu",
    ]) {
      const el = container.querySelector(`[data-testid="${t}"]`);
      if (el) await fireEvent.click(el);
    }
    void getByTestId;
    const ids = [...container.querySelectorAll("[data-testid]")].map((e) =>
      e.getAttribute("data-testid")
    );
    expect(ids.length).toBe(new Set(ids).size);
    cleanup();
  }
});
