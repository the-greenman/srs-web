// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import ResizeHandle from "../src/lib/components/ResizeHandle.svelte";

afterEach(cleanup);

const mount = (kind: "nav" | "inspector", value = 300) => {
  const onchange = vi.fn();
  const oncommit = vi.fn();
  const r = render(ResizeHandle, { kind, value, controls: "col", onchange, oncommit });
  return { ...r, onchange, oncommit, el: r.getByRole("separator") };
};

it("is a focusable vertical separator with value, range and the column it controls", () => {
  const { el } = mount("nav", 300);
  expect(el.getAttribute("aria-orientation")).toBe("vertical");
  expect(el.getAttribute("aria-valuenow")).toBe("300");
  expect(el.getAttribute("aria-valuemin")).toBe("192");
  expect(el.getAttribute("aria-valuemax")).toBe("384");
  expect(el.getAttribute("aria-controls")).toBe("col");
  expect(el.getAttribute("aria-label")).toBe("Resize navigation");
  expect(el.tabIndex).toBe(0);
});

it("the arrow points the way the edge moves: ArrowRight widens the nav, ArrowLeft the inspector", async () => {
  const nav = mount("nav", 300);
  await fireEvent.keyDown(nav.el, { key: "ArrowRight" });
  expect(nav.onchange).toHaveBeenLastCalledWith(316);
  await fireEvent.keyDown(nav.el, { key: "ArrowLeft", shiftKey: true });
  expect(nav.onchange).toHaveBeenLastCalledWith(236);
  expect(nav.oncommit).toHaveBeenCalledTimes(2);
  cleanup();
  const ins = mount("inspector", 320);
  await fireEvent.keyDown(ins.el, { key: "ArrowLeft" });
  expect(ins.onchange).toHaveBeenLastCalledWith(336);
  await fireEvent.keyDown(ins.el, { key: "ArrowRight" });
  expect(ins.onchange).toHaveBeenLastCalledWith(304);
});

it("clamps, Home/End jump to the limits, double-click resets the default", async () => {
  const { el, onchange } = mount("nav", 380);
  await fireEvent.keyDown(el, { key: "ArrowRight", shiftKey: true });
  expect(onchange).toHaveBeenLastCalledWith(384);
  await fireEvent.keyDown(el, { key: "Home" });
  expect(onchange).toHaveBeenLastCalledWith(192);
  await fireEvent.keyDown(el, { key: "End" });
  expect(onchange).toHaveBeenLastCalledWith(384);
  await fireEvent.dblClick(el);
  expect(onchange).toHaveBeenLastCalledWith(264);
});

it("ignores other keys", async () => {
  const { el, onchange, oncommit } = mount("nav");
  await fireEvent.keyDown(el, { key: "a" });
  expect(onchange).not.toHaveBeenCalled();
  expect(oncommit).not.toHaveBeenCalled();
});
