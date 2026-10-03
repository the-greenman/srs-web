// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Panel from "../src/lib/components/Panel.svelte";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const details = (c: HTMLElement) => c.querySelector("details") as HTMLDetailsElement;

describe("Panel", () => {
  it("renders the title and aside, open by default", () => {
    const { container } = render(Panel, { title: "Draft", aside: 0 });
    expect(container.querySelector(".panel__title")?.textContent).toBe("Draft");
    expect(container.querySelector(".panel__aside")?.textContent).toBe("0");
    expect(details(container).open).toBe(true);
  });

  it("starts closed when open is false", () => {
    const { container } = render(Panel, { title: "T", open: false });
    expect(details(container).open).toBe(false);
  });

  it("remembers the open state under srs-web.panel.<persistKey>", () => {
    const first = render(Panel, { title: "T", persistKey: "k" });
    const d = details(first.container);
    d.open = false;
    d.dispatchEvent(new Event("toggle"));
    expect(store.get("srs-web.panel.k")).toBe("0");
    first.unmount();

    const second = render(Panel, { title: "T", persistKey: "k" });
    expect(details(second.container).open).toBe(false);
  });

  it("still renders when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    const { container } = render(Panel, { title: "T", persistKey: "k" });
    expect(details(container).open).toBe(true);
  });

  it("collapsible=false renders a static header with no toggle", () => {
    const { container } = render(Panel, { title: "Static", collapsible: false });
    expect(container.querySelector("details, summary")).toBeNull();
    expect(container.querySelector(".panel__head .panel__title")?.textContent).toBe("Static");
  });
});
