// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import RepoSize from "../src/lib/components/RepoSize.svelte";

afterEach(cleanup);
const MB = 1024 * 1024;

describe("RepoSize", () => {
  it("shows a meter and the limit", () => {
    const { container } = render(RepoSize, {
      totalBytes: 2.3 * MB,
      maxBytes: 10 * MB,
      pendingBytes: 120 * 1024,
    });
    expect(container.textContent).toContain("2.3 MB of 10 MB + 120 KB");
    const m = container.querySelector("meter")!;
    expect(m.getAttribute("max")).toBe(String(10 * MB));
    expect(m.getAttribute("low")).toBe(String(6 * MB));
    expect(m.getAttribute("high")).toBe(String(8 * MB));
    expect(Number(m.getAttribute("value"))).toBe(2.3 * MB + 120 * 1024);
  });
  it("shows only the label without a limit", () => {
    const { container } = render(RepoSize, { totalBytes: 2.3 * MB });
    expect(container.textContent).toContain("Repository 2.3 MB");
    expect(container.querySelector("meter")).toBeNull();
  });
});
