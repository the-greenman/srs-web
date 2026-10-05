// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { expect, it } from "vitest";
import SrsMark from "../src/lib/components/SrsMark.svelte";

it("draws the six shapes of the upright S mark in paint order, decoratively", () => {
  const { container } = render(SrsMark, { size: 24 });
  const svg = container.querySelector("svg.srs-mark") as SVGElement;
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(svg.getAttribute("width")).toBe("24");
  expect([...svg.children].map((el) => `${el.tagName}.${el.getAttribute("class")}`)).toEqual([
    "circle.srs-mark__paper",
    "path.srs-mark__ink",
    "path.srs-mark__line",
    "circle.srs-mark__paper",
    "circle.srs-mark__ink",
    "circle.srs-mark__rim",
  ]);
  // The seeds sit on the vertical axis: paper seed in the ink (top) half, ink seed in the paper (bottom) half.
  const seeds = [...svg.querySelectorAll("circle")].filter((c) => c.getAttribute("r") === "1.505");
  expect(seeds.map((c) => [c.getAttribute("cx"), c.getAttribute("cy")])).toEqual([
    ["12", "6.625"],
    ["12", "17.375"],
  ]);
});

it("defaults to 16px", () => {
  const { container } = render(SrsMark);
  expect(container.querySelector("svg")?.getAttribute("width")).toBe("16");
});
