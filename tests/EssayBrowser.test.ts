// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import EssayBrowser from "../src/lib/components/EssayBrowser.svelte";

const groups = [
  {
    boundaryId: "b",
    label: "Small groups",
    depth: 0,
    essays: [
      {
        id: "e2",
        title: "Copy of Commons",
        createdAt: "2026-10-02",
        sharedParagraphs: 3,
        family: [{ essayId: "e1", title: "Commons", shared: 3, kind: "parent" as const }],
      },
      { id: "e1", title: "Commons", createdAt: "2026-10-01", sharedParagraphs: 3, family: [] },
    ],
  },
  {
    boundaryId: null,
    label: "No domain yet",
    depth: 0,
    essays: [{ id: "e3", title: "Loose", createdAt: "", sharedParagraphs: 0, family: [] }],
  },
];

describe("EssayBrowser", () => {
  it("shows domains, essays in the order given, family links and shared counts", () => {
    render(EssayBrowser, { groups, onopen: () => {} });
    expect(screen.getAllByTestId("browse-domain").map((n) => n.textContent?.trim())).toEqual([
      "Small groups (2)",
      "No domain yet (1)",
    ]);
    expect(screen.getByText("copied from Commons (3 shared paragraphs)")).toBeTruthy();
  });
  it("opens an essay, but offers no Open for the current one", async () => {
    const onopen = vi.fn();
    render(EssayBrowser, { groups, currentId: "e1", onopen });
    expect(screen.queryByRole("button", { name: "Open Commons" })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Open Loose" }));
    expect(onopen).toHaveBeenCalledWith("e3");
  });
});
