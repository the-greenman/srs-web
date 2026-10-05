// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Notice from "../src/lib/components/Notice.svelte";

afterEach(cleanup);
const children = createRawSnippet(() => ({ render: () => "<span>hello</span>" }));

describe("Notice", () => {
  it("error is role=alert; the other kinds are role=status", () => {
    for (const [kind, role] of [
      ["error", "alert"],
      ["warning", "status"],
      ["info", "status"],
      ["success", "status"],
    ] as const) {
      const { getByTestId, unmount } = render(Notice, { kind, testid: "n", children });
      expect(getByTestId("n").getAttribute("role")).toBe(role);
      expect(getByTestId("n").classList.contains(`notice--${kind}`)).toBe(true);
      unmount();
    }
  });

  it("renders its parts and a dismiss button only when asked", async () => {
    const onDismiss = vi.fn();
    const r = render(Notice, { testid: "n", children, onDismiss });
    expect(r.container.querySelector('[data-part="icon"]')).not.toBeNull();
    expect(r.container.querySelector('[data-part="body"]')?.textContent).toContain("hello");
    await fireEvent.click(r.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    r.unmount();
    const r2 = render(Notice, { children });
    expect(r2.queryByRole("button")).toBeNull();
  });
});
