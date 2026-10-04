// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import Plus from "@lucide/svelte/icons/plus";
import { afterEach, expect, it } from "vitest";
import IconButton from "../src/lib/components/IconButton.svelte";

afterEach(cleanup);

it("label is both the accessible name and the tooltip; the icon is hidden from AT", () => {
  const { getByRole } = render(IconButton, { icon: Plus, label: "Add thing" });
  const b = getByRole("button", { name: "Add thing" });
  expect(b.getAttribute("aria-label")).toBe("Add thing");
  expect(b.getAttribute("title")).toBe("Add thing");
  expect(b.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

it("renders aria-pressed only when pressed is given, and forwards native attributes", () => {
  const a = render(IconButton, { icon: Plus, label: "A" });
  expect(a.getByRole("button").hasAttribute("aria-pressed")).toBe(false);
  const b = render(IconButton, { icon: Plus, label: "B", pressed: true, "data-testid": "x" });
  expect(b.getByTestId("x").getAttribute("aria-pressed")).toBe("true");
});
