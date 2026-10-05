// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import LiveRegions from "../src/lib/components/LiveRegions.svelte";
import { notify, resetNotices } from "../src/lib/notices.svelte";

afterEach(() => {
  cleanup();
  resetNotices();
});

describe("LiveRegions", () => {
  it("both regions exist with no toasts and are empty; the error one is assertive, not a role=alert", () => {
    const { getByTestId, container } = render(LiveRegions);
    expect(getByTestId("live-polite").getAttribute("aria-live")).toBe("polite");
    expect(getByTestId("live-polite").textContent).toBe("");
    const a = getByTestId("live-assertive");
    expect(a.getAttribute("aria-live")).toBe("assertive");
    expect(a.getAttribute("aria-atomic")).toBe("true");
    expect(a.textContent).toBe("");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("writes into the SAME existing node, errors into the assertive one, and clears", async () => {
    const { getByTestId } = render(LiveRegions);
    const polite = getByTestId("live-polite");
    const assertive = getByTestId("live-assertive");
    notify({ kind: "success", key: "a", text: "Link copied" });
    await tick();
    expect(getByTestId("live-polite")).toBe(polite);
    expect(polite.textContent).toBe("Link copied");
    expect(assertive.textContent).toBe("");
    notify({ kind: "error", key: "save", text: "Save failed" });
    await tick();
    expect(assertive.textContent).toBe("Save failed");
    resetNotices();
    await tick();
    expect(polite.textContent).toBe("");
    expect(assertive.textContent).toBe("");
  });
});
