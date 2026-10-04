import { expect, it } from "vitest";
import { actorHue } from "../src/lib/actor-hue";

it("hue is stable per actor id and is one of eight", () => {
  expect(actorHue("agent:x")).toBe(actorHue("agent:x"));
  expect([0, 45, 90, 140, 190, 230, 280, 320]).toContain(actorHue("human-ada"));
});
