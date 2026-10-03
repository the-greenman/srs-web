// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { expect, it, vi } from "vitest";
import ActionMenu from "../src/lib/components/ActionMenu.svelte";
import { paragraphActions } from "../src/lib/essay/paragraph-actions.js";

const handlers = () => ({
  onnew: vi.fn(),
  onmove: vi.fn(),
  onindent: vi.fn(),
  onhide: vi.fn(),
  onpull: vi.fn(),
  onzoom: vi.fn(),
  oncopylink: vi.fn(),
  onrename: vi.fn(),
});
const state = { label: "Claim" };

it("lists every action once, in order, and each calls its shell callback", () => {
  const h = handlers();
  const list = paragraphActions(h, state);
  expect(list.map((a) => a.id)).toEqual(["add", "up", "down", "indent", "outdent", "hide", "draft", "zoom", "link", "rename"]);
  list.forEach((a) => a.run());
  expect(h.onnew).toHaveBeenCalledOnce();
  expect(h.onmove.mock.calls).toEqual([["up"], ["down"]]);
  expect(h.onindent.mock.calls).toEqual([[1], [-1]]);
  expect(h.onhide).toHaveBeenCalledWith(true);
  for (const f of [h.onpull, h.onzoom, h.oncopylink, h.onrename]) expect(f).toHaveBeenCalledOnce();
});

it("omits actions without a handler, restricts by id, and reflects hidden state", () => {
  const { onmove, onindent, onhide } = handlers();
  expect(paragraphActions({ onmove, onindent, onhide }, state).map((a) => a.id)).toEqual(["up", "down", "indent", "outdent", "hide"]);
  expect(paragraphActions(handlers(), state, ["zoom"]).map((a) => a.id)).toEqual(["zoom"]);
  const shown = paragraphActions({ onhide }, { label: "x", hidden: true })[0];
  expect([shown.label, shown.enabled]).toEqual(["Show", true]);
  shown.run();
  expect(onhide).toHaveBeenCalledWith(false);
  expect(paragraphActions({ onhide }, { label: "x", inherited: true })[0].enabled).toBe(false);
});

it("menu: opens with aria state, arrows move, Escape returns focus, a row runs and closes", async () => {
  const h = handlers();
  const { getByTestId, queryByTestId } = render(ActionMenu, { actions: paragraphActions(h, state), label: "Claim" });
  const btn = getByTestId("paragraph-menu");
  expect(btn.getAttribute("aria-haspopup")).toBe("menu");
  expect(btn.getAttribute("aria-expanded")).toBe("false");
  await fireEvent.click(btn);
  await tick();
  expect(btn.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(getByTestId("paragraph-menu-add"));
  await fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(getByTestId("paragraph-menu-up"));
  await fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(queryByTestId("paragraph-menu-up")).toBeNull();
  expect(document.activeElement).toBe(btn);
  await fireEvent.click(btn);
  await fireEvent.click(getByTestId("paragraph-menu-down"));
  expect(h.onmove).toHaveBeenCalledWith("down");
  expect(queryByTestId("paragraph-menu-down")).toBeNull();
});
