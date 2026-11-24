import { beforeEach, expect, it, vi } from "vitest";
import { loadEditMode, saveEditMode } from "../src/lib/essay/edit-mode.js";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

it("is visual by default and for an unknown value, and round-trips", () => {
  expect(loadEditMode()).toBe("visual");
  saveEditMode("source");
  expect(loadEditMode()).toBe("source");
  saveEditMode("visual");
  expect(loadEditMode()).toBe("visual");
  store.set("srs-web.essay.edit-mode", "junk");
  expect(loadEditMode()).toBe("visual");
});

it("is visual, and saving is harmless, when storage is blocked", () => {
  const blocked = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
  expect(() => saveEditMode("source")).not.toThrow();
  expect(loadEditMode()).toBe("visual");
});
