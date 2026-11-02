// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/srs-client.js", async (orig) => ({
  ...(await orig<object>()),
  renderMarkdown: (s: string) => `<p>${s}</p>`,
}));
import ReadPage from "../src/lib/read/ReadPage.svelte";
import { readPage, readWall } from "../src/styleguide/fixtures";

describe("ReadPage", () => {
  it("reads the record, then lists what is inside in order with first lines and real links", () => {
    const { container } = render(ReadPage, { page: readPage, href: (i) => `#read=c&id=${i.id}`, onOpen: () => {} });
    expect(container.querySelector('[data-testid="record-prose"]')).not.toBeNull();
    const items = [...container.querySelectorAll<HTMLAnchorElement>('[data-testid="read-item"]')];
    expect(items.map((a) => a.querySelector(".read-page__label")?.textContent)).toEqual(["The case", "Evidence", "A note on method"]);
    expect(items[0].getAttribute("href")).toBe("#read=c&id=r-1");
    expect(items[0].textContent).toContain("›");
    expect(items[2].textContent).not.toContain("›");
    expect(items[2].textContent).toContain("note");
    expect(items[1].querySelector('[data-part="first"]')?.textContent).toContain("primary texts");
  });

  it("a plain click opens in place; a modified click is left to the browser", async () => {
    const onOpen = vi.fn();
    const { container } = render(ReadPage, { page: readPage, href: () => "#", onOpen });
    const a = container.querySelector<HTMLAnchorElement>('[data-testid="read-item"]')!;
    await fireEvent.click(a, { button: 0, ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    await fireEvent.click(a, { button: 0 });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "r-1" }));
  });

  it("a wall shows closed groups with counts, and a note page shows its text", () => {
    const { container } = render(ReadPage, { page: readWall, href: () => "#", onOpen: () => {} });
    const groups = [...container.querySelectorAll<HTMLDetailsElement>('[data-testid="read-group"]')];
    expect(groups.map((g) => g.querySelector("summary")?.textContent?.replace(/\s+/g, " ").trim())).toEqual(["finding 9", "decision 8"]);
    expect(groups.every((g) => !g.open)).toBe(true);
    expect(container.textContent).toContain("17 items, grouped by kind");
    expect(container.textContent).toContain("Traps, gaps and observations");
  });
});
