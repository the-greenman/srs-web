// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Breadcrumb from "../src/lib/components/Breadcrumb.svelte";

describe("Breadcrumb", () => {
  it("is a labelled nav with an ordered list; the last item is the current page", () => {
    const { container } = render(Breadcrumb, {
      props: { items: [{ label: "repo" }, { label: "Articles", onclick: () => {} }, { label: "Now" }] },
    });
    expect(container.querySelector("nav[aria-label=Breadcrumb] > ol")).not.toBeNull();
    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
    expect(container.querySelector("[aria-current=page]")?.textContent).toBe("Now");
  });

  it("renders a button for an item with onclick and a span for one without", async () => {
    const onclick = vi.fn();
    const { container } = render(Breadcrumb, {
      props: { items: [{ label: "plain" }, { label: "linked", onclick }, { label: "end" }] },
    });
    expect(container.querySelectorAll("button.breadcrumb__link")).toHaveLength(1);
    await fireEvent.click(container.querySelector("button.breadcrumb__link") as HTMLElement);
    expect(onclick).toHaveBeenCalled();
    expect(container.querySelector("li span:not([class])")?.textContent).toBe("plain");
  });
});
