// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import NoticeRegion from "../src/lib/components/NoticeRegion.svelte";
import { pinNotice, pinned, resetNotices, unpinNotice } from "../src/lib/notices.svelte";

afterEach(() => {
  cleanup();
  resetNotices();
  for (const p of [...pinned]) unpinNotice(p.key);
});

describe("NoticeRegion", () => {
  it("renders nothing without pinned notices", () => {
    expect(render(NoticeRegion).container.querySelector(".notice")).toBeNull();
  });

  it("renders a diagnostics pin as the grouped notice and a text pin as a Notice", async () => {
    const r = render(NoticeRegion);
    pinNotice({
      key: "catalog",
      documentKey: "repo",
      kind: "warning",
      testid: "catalog-diagnostics",
      diagnostics: [
        { severity: "warn", message: "same" },
        { severity: "warn", message: "same" },
      ],
    });
    pinNotice({ key: "t", documentKey: "repo", kind: "info", text: "plain", testid: "plain" });
    await tick();
    expect(r.getByTestId("catalog-diagnostics").getAttribute("role")).toBe("status");
    expect(r.getByTestId("plain").textContent).toContain("plain");
    unpinNotice("catalog");
    await tick();
    expect(r.queryByTestId("catalog-diagnostics")).toBeNull();
  });
});
