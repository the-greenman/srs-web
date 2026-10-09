// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import LensSwitcher from "../src/lib/lens/LensSwitcher.svelte";
import type { Lens } from "../src/lib/lens/lens.js";

const lens = (id: Lens["id"], label: string): Lens => ({
  id,
  label,
  collection: { kind: "find" },
  focus: { kind: "read" },
});

describe("LensSwitcher", () => {
  it("is a nav of Buttons with aria-current, and More lenses sits outside the nav", async () => {
    const onPick = vi.fn();
    const { container, getByRole } = render(LensSwitcher, {
      tabs: [lens("nav:a", "Alpha"), lens("nav:b", "Beta")],
      more: [lens("find", "Everything")],
      active: "nav:b",
      onPick,
    });
    const nav = getByRole("navigation", { name: "Lenses" });
    expect(container.querySelector('[role="tablist"], [role="tab"]')).toBeNull();
    const buttons = [...nav.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["Alpha", "Beta"]);
    expect(buttons.every((b) => b.classList.contains("btn"))).toBe(true);
    expect(buttons.map((b) => b.getAttribute("aria-current"))).toEqual([null, "true"]);
    expect(nav.querySelector('[data-testid="lens-more"]')).toBeNull();
    expect(container.querySelector('[data-testid="lens-more"]')).not.toBeNull();
    await fireEvent.click(buttons[0]);
    expect(onPick).toHaveBeenCalledWith("nav:a");
  });
});
