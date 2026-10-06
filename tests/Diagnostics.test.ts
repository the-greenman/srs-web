// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import Diagnostics from "../src/lib/components/Diagnostics.svelte";
import { resetNotices } from "../src/lib/notices.svelte";
import type { Diagnostic } from "../src/lib/types";

afterEach(() => {
  cleanup();
  resetNotices();
});

const R23 = "[R23] computed heading level 7 exceeds 6 for format 'html'; clamped to 6";
const three: Diagnostic[] = [R23, R23, R23].map((message) => ({ severity: "warn", message }));
const mixed: Diagnostic[] = [...three, { severity: "error", message: "boom" }];

describe("Diagnostics notice variant", () => {
  it("is one collapsed line with a summary, grouping the repeats", () => {
    const { getByTestId, container } = render(Diagnostics, {
      diagnostics: mixed,
      variant: "notice",
      documentKey: "doc",
      testid: "n",
    });
    expect(getByTestId("n").textContent).toContain("1 error, 3 warnings");
    const list = container.querySelector(".diag-list") as HTMLElement;
    expect(list.hidden).toBe(true);
    expect(container.querySelectorAll('[data-part="group"]')).toHaveLength(2);
    expect(container.querySelector('[data-part="count"]')?.textContent).toBe("x3");
  });

  it("the toggle expands (aria-expanded, aria-controls)", async () => {
    const { container, getByRole } = render(Diagnostics, {
      diagnostics: three,
      variant: "notice",
      documentKey: "doc",
    });
    const toggle = getByRole("button", { name: "Show diagnostics" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const list = container.querySelector(`#${toggle.getAttribute("aria-controls")}`) as HTMLElement;
    expect(list.hidden).toBe(false);
  });

  it("dismiss hides it for that document only, and a change in the diagnostics re-shows it", async () => {
    const a = render(Diagnostics, {
      diagnostics: three,
      variant: "notice",
      documentKey: "doc-a",
      testid: "a",
    });
    await fireEvent.click(a.getByRole("button", { name: "Dismiss" }));
    expect(a.queryByTestId("a")).toBeNull();
    const b = render(Diagnostics, {
      diagnostics: three,
      variant: "notice",
      documentKey: "doc-b",
      testid: "b",
    });
    expect(b.queryByTestId("b")).not.toBeNull();
    await a.rerender({ diagnostics: mixed });
    expect(a.queryByTestId("a")).not.toBeNull();
  });

  it("renders nothing when there are no diagnostics", () => {
    const { container } = render(Diagnostics, {
      diagnostics: [],
      variant: "notice",
      documentKey: "d",
    });
    expect(container.querySelector(".notice")).toBeNull();
  });
});

describe("Diagnostics panel variant", () => {
  it("keeps its all-clear text and summary line, and shows grouped rows with counts", () => {
    expect(render(Diagnostics, { diagnostics: [] }).container.textContent).toContain(
      "No diagnostics"
    );
    cleanup();
    const { container } = render(Diagnostics, { diagnostics: mixed });
    expect(container.querySelector(".diag-summary")?.textContent).toContain("1 error");
    expect(container.querySelectorAll(".diag")).toHaveLength(2);
    expect(container.querySelector(".diag__count")?.textContent).toBe("x3");
  });
});
