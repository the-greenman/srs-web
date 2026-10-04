import { expect, it } from "vitest";
import { canShow, isShown, setOpen, summary, toggle, toggleAll } from "../src/lib/essay/thread-visibility";

const ids = ["a", "b", "c"];
const none = new Set<string>();

it("a hidden or inherited-hidden paragraph never shows its thread, and gets it back when shown", () => {
  const open = new Set(["a", "b"]);
  expect(isShown(open, "a", none, none)).toBe(true);
  expect(isShown(open, "a", new Set(["a"]), none)).toBe(false);
  expect(isShown(open, "b", none, new Set(["b"]))).toBe(false);
  expect(isShown(open, "c", none, none)).toBe(false);
});

it("badge toggles one; header toggles all/none; mixed shows all", () => {
  let open: Set<string> = new Set();
  expect(summary(open, ids)).toBe("none");
  open = toggle(open, "a");
  expect(summary(open, ids)).toBe("mixed");
  open = toggleAll(open, ids);
  expect(summary(open, ids)).toBe("all");
  open = toggle(open, "b");
  expect([...open].sort()).toEqual(["a", "c"]);
  open = toggleAll(open, ids); // mixed -> all
  expect(summary(open, ids)).toBe("all");
  expect(summary(toggleAll(open, ids), ids)).toBe("none");
});

it("hide all keeps the state of paragraphs outside the view; show opens only the ids in view", () => {
  const open = new Set(["a", "x"]);
  expect([...toggleAll(open, ["a"])]).toEqual(["x"]);
  expect([...toggleAll(new Set(["x"]), ["a"])].sort()).toEqual(["a", "x"]); // show opens only `ids`
  expect([...toggleAll(new Set(), ["a"])]).toEqual(["a"]);
  expect([...setOpen(open, "a", false)]).toEqual(["x"]);
});

it("canShow is the one hidden rule", () => {
  expect(canShow("a", none, none)).toBe(true);
  expect(canShow("a", new Set(["a"]), none)).toBe(false);
  expect(canShow("a", none, new Set(["a"]))).toBe(false);
});
