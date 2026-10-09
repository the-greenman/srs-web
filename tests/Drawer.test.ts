// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
import { afterEach, expect, it } from "vitest";
import Drawer from "../src/lib/components/Drawer.svelte";

type Proto = { showModal?: unknown };
const proto = (globalThis as unknown as { HTMLDialogElement: { prototype: Proto } })
  .HTMLDialogElement.prototype;
const nativeShowModal = proto.showModal;
afterEach(() => {
  cleanup();
  proto.showModal = nativeShowModal;
});

const children = createRawSnippet(() => ({
  render: () =>
    '<div><a href="#x" data-testid="pick">pick</a><button aria-expanded="false" data-testid="disclosure">d</button><button aria-pressed="false" data-testid="toggle">t</button><div class="nav__foot"><button data-testid="foot">f</button></div></div>',
}));
const mount = (props: object = {}) =>
  render(Drawer, { open: false, label: "Navigation", testid: "d", children, ...props });
const dlg = (r: { getByTestId: (id: string) => HTMLElement }) =>
  r.getByTestId("d") as HTMLDialogElement;

// Native path: happy-dom provides showModal, so this exercises the real open/close wiring.
// Focus trap, inert background, Escape and focus return are the platform's: e2e/shell-layout.spec.ts.
it("native: open shows it modally with its accessible name; one copy of the children", async () => {
  const r = mount();
  expect(dlg(r).open).toBe(false);
  await r.rerender({ open: true });
  await tick();
  expect(dlg(r).open).toBe(true);
  expect(dlg(r).getAttribute("aria-label")).toBe("Navigation");
  expect(dlg(r).querySelectorAll('[data-testid="pick"]').length).toBe(1);
  await r.rerender({ open: false });
  await tick();
  expect(dlg(r).open).toBe(false);
});

it("native: a click on the backdrop (the dialog itself) closes; a click inside the panel does not", async () => {
  const r = mount({ open: true });
  await tick();
  await fireEvent.click(r.getByTestId("pick"));
  await tick();
  expect(dlg(r).open).toBe(true);
  await fireEvent.click(dlg(r));
  await tick();
  expect(dlg(r).open).toBe(false);
});

it("native: a platform close (Escape) event syncs the bound state, so it can reopen", async () => {
  const r = mount({ open: true });
  await tick();
  dlg(r).close();
  await tick();
  expect(dlg(r).open).toBe(false);
  await r.rerender({ open: true });
  await tick();
  expect(dlg(r).open).toBe(true);
});

it("closeOnPick: a link closes it; a disclosure, a toggle and the footer do not", async () => {
  const r = mount({ open: true, closeOnPick: true });
  await tick();
  await fireEvent.click(r.getByTestId("disclosure"));
  await fireEvent.click(r.getByTestId("toggle"));
  await fireEvent.click(r.getByTestId("foot"));
  await tick();
  expect(dlg(r).open).toBe(true);
  await fireEvent.click(r.getByTestId("pick"));
  await tick();
  expect(dlg(r).open).toBe(false);
});

it("without closeOnPick a link leaves it open", async () => {
  const r = mount({ open: true });
  await tick();
  await fireEvent.click(r.getByTestId("pick"));
  await tick();
  expect(dlg(r).open).toBe(true);
});

// Fallback path (a browser without showModal): a class plus inline display, Escape handled here.
it("fallback: closed is display none, open is shown; backdrop click and Escape close", async () => {
  delete proto.showModal;
  const r = mount();
  const el = r.getByTestId("d");
  expect(el.style.display).toBe("none");
  await r.rerender({ open: true });
  expect(el.style.display).toBe("block");
  await fireEvent.click(el);
  await tick();
  expect(el.style.display).toBe("none");
  await r.rerender({ open: true });
  await fireEvent.keyDown(el, { key: "Escape" });
  await tick();
  expect(el.style.display).toBe("none");
});
