import { afterEach, expect, it, vi } from "vitest";
import { editMode, setEditMode } from "../src/lib/essay/edit-mode.js";

afterEach(() => vi.unstubAllGlobals());

it("is visual when nothing is stored, remembers the choice, and is visual when storage is blocked (srs-web#752)", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  expect(editMode()).toBe("visual");
  setEditMode("source");
  expect(editMode()).toBe("source");
  setEditMode("visual");
  expect(editMode()).toBe("visual");

  const blocked = () => {
    throw new Error("SecurityError");
  };
  vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
  expect(() => setEditMode("source")).not.toThrow();
  expect(editMode()).toBe("visual");
});
