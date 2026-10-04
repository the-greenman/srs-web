// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ToastShellHost from "./ToastShellHost.svelte";
import { ShellState } from "../src/lib/shell-context.svelte";
import ToastHost from "../src/lib/components/ToastHost.svelte";
import { TOAST_MS, notify, resetNotices, toasts } from "../src/lib/notices.svelte";

afterEach(() => {
  cleanup();
  resetNotices();
  vi.useRealTimers();
});

// happy-dom has no popover API: the host feature-guards, so a spy host proves the show/hide order.
function spyPopover() {
  const calls: string[] = [];
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.showPopover = function show() {
    calls.push("show");
    (this as HTMLElement).setAttribute("data-open", "");
  };
  proto.hidePopover = function hide() {
    calls.push("hide");
    (this as HTMLElement).removeAttribute("data-open");
  };
  const matches = HTMLElement.prototype.matches;
  HTMLElement.prototype.matches = function m(sel: string) {
    return sel === ":popover-open" ? this.hasAttribute("data-open") : matches.call(this, sel);
  };
  return {
    calls,
    restore() {
      delete proto.showPopover;
      delete proto.hidePopover;
      HTMLElement.prototype.matches = matches;
    },
  };
}

describe("ToastHost", () => {
  it("renders the rows with focusable close buttons; the text is aria-hidden, never the row", async () => {
    const { getByTestId, container } = render(ToastHost);
    notify({ kind: "success", text: "Link copied", testid: "address-notice" });
    await tick();
    const row = getByTestId("address-notice");
    expect(row.getAttribute("aria-hidden")).toBeNull();
    expect(row.querySelector(".toast__text")?.getAttribute("aria-hidden")).toBe("true");
    const close = row.querySelector("button") as HTMLButtonElement;
    expect(close.getAttribute("aria-label")).toBe("Dismiss");
    close.focus();
    expect(document.activeElement).toBe(close);
    const host = container.querySelector(".toast-host") as HTMLElement;
    expect(host.getAttribute("popover")).toBe("manual");
    expect(host.getAttribute("role")).toBeNull();
    expect(host.getAttribute("aria-live")).toBeNull();
    await fireEvent.click(close);
    await tick();
    expect(toasts).toHaveLength(0);
  });

  it("auto-dismisses via the store timer", async () => {
    vi.useFakeTimers();
    const { queryByTestId } = render(ToastHost);
    notify({ text: "x", testid: "t" });
    await tick();
    expect(queryByTestId("t")).not.toBeNull();
    vi.advanceTimersByTime(TOAST_MS);
    await tick();
    expect(queryByTestId("t")).toBeNull();
  });

  it("re-stacks (hide then show) on a new toast", async () => {
    const spy = spyPopover();
    try {
      render(ToastHost);
      notify({ key: "a", text: "A" });
      await tick();
      await tick();
      expect(spy.calls).toEqual(["show"]); // nothing shown to hide the first time
      spy.calls.length = 0;
      notify({ key: "b", text: "B" });
      await tick();
      await tick();
      expect(spy.calls.slice(0, 2)).toEqual(["hide", "show"]);
    } finally {
      spy.restore();
    }
  });

  it("re-stacks when a drawer opens (ShellState.inspectorOpen)", async () => {
    const spy = spyPopover();
    try {
      notify({ kind: "error", key: "save", text: "failed" });
      const shell = new ShellState();
      render(ToastShellHost, { shell });
      await tick();
      await tick();
      spy.calls.length = 0;
      shell.inspectorOpen = true;
      await tick();
      await tick();
      expect(spy.calls).toEqual(["hide", "show"]);
    } finally {
      spy.restore();
    }
  });
});
