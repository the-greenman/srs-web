// @vitest-environment happy-dom
// happy-dom has no popover API: this covers the guarded fallback (is-open class, inline display,
// onclick trigger) and that showPopover is called when the API exists. Light-dismiss, Escape, top
// layer, anchor positioning, focus return and clipping are tested in e2e/popover.spec.ts.
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";
import PopoverHost from "./PopoverHost.svelte";

afterEach(() => {
  cleanup();
  // biome-ignore lint/performance/noDelete: restoring the prototype
  delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
  // biome-ignore lint/performance/noDelete: restoring the prototype
  delete (HTMLElement.prototype as { hidePopover?: unknown }).hidePopover;
});

it("fallback: content renders, the trigger toggles is-open and inline display", async () => {
  const { getByRole, getByText, container } = render(PopoverHost, { label: "Things" });
  const surface = container.querySelector<HTMLElement>('[data-part="surface"]')!;
  expect(surface.getAttribute("aria-label")).toBe("Things");
  expect(getByText("body")).toBeTruthy();
  expect(surface.classList.contains("is-open")).toBe(false);
  expect(surface.style.display).toBe("none");
  const trigger = getByRole("button", { name: "Open things" });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("popovertarget")).toBe(surface.id);
  await fireEvent.click(trigger);
  expect(surface.classList.contains("is-open")).toBe(true);
  expect(surface.style.display).toBe("");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
});

it("native: calls showPopover when open and does not add an onclick to the trigger", async () => {
  const showPopover = vi.fn();
  const hidePopover = vi.fn();
  Object.assign(HTMLElement.prototype, { showPopover, hidePopover });
  const { getByRole } = render(PopoverHost, { label: "Things", open: true });
  await Promise.resolve();
  expect(showPopover).toHaveBeenCalled();
  // The invoker is native: a click must not toggle `open` itself (no close-then-reopen race).
  await fireEvent.click(getByRole("button", { name: "Open things" }));
  expect(hidePopover).not.toHaveBeenCalled();
});
