// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import NavItem from "../src/lib/components/NavItem.svelte";

describe("NavItem", () => {
  it("is a button without href, and a link with one", () => {
    const a = render(NavItem, { props: { label: "Articles" } });
    expect(a.container.querySelector("button.nav__item")).not.toBeNull();
    a.unmount();
    const b = render(NavItem, { props: { label: "Articles", href: "/x" } });
    expect(b.container.querySelector("a.nav__item")?.getAttribute("href")).toBe("/x");
  });

  it("puts testid and onclick on the element and marks the active item", async () => {
    const onclick = vi.fn();
    const { container } = render(NavItem, {
      props: { label: "Articles", id: "A", count: 3, active: true, testid: "item", onclick },
    });
    const el = container.querySelector<HTMLElement>("[data-testid=item]") as HTMLElement;
    expect(el.getAttribute("aria-current")).toBe("page");
    expect(el.textContent).toMatch(/A\s*Articles\s*3/);
    await fireEvent.click(el);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it("has no aria-current when inactive", () => {
    const { container } = render(NavItem, { props: { label: "Articles" } });
    expect(container.querySelector(".nav__item")?.hasAttribute("aria-current")).toBe(false);
  });
});
