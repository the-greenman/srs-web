// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOAST_MS,
  diagnosticsFromStrings,
  diagnosticsHash,
  dismissDiagnostics,
  dismissKey,
  groupDiagnostics,
  isDiagnosticsDismissed,
  notify,
  pinNotice,
  pinned,
  resetNotices,
  toUiDiagnostic,
  toasts,
  unpinNotice,
} from "../src/lib/notices.svelte";

// Real strings captured from the engine (e2e/fixtures/r23.srsj rendered as html; srs-rust render_service.rs).
const R23 = "[R23] computed heading level 7 exceeds 6 for format 'html'; clamped to 6";
const SECTION =
  "[section:decisions] container not found: 08bac232-f5b9-46eb-aafe-ac6b237dbc25; rendering section as empty";
const FIND = "warning: type 'nope/nope' names no type (expected namespace/name)";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetNotices();
  for (const p of [...pinned]) unpinNotice(p.key);
  vi.useRealTimers();
});

describe("toasts", () => {
  it("auto-dismisses a non-error toast after its duration", () => {
    notify({ kind: "success", text: "Link copied" });
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts).toHaveLength(0);
  });

  it("an error is sticky", () => {
    notify({ kind: "error", text: "Save failed" });
    vi.advanceTimersByTime(TOAST_MS * 10);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].sticky).toBe(true);
  });

  it("the same key replaces in place and restarts the timer", () => {
    const a = notify({ key: "copy", text: "Link copied" });
    vi.advanceTimersByTime(TOAST_MS - 100);
    const b = notify({ key: "copy", text: "Link copied again" });
    expect(b).toBe(a);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].text).toBe("Link copied again");
    vi.advanceTimersByTime(TOAST_MS - 100);
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(toasts).toHaveLength(0);
  });

  it("a later non-error toast with the same key replaces a sticky error", () => {
    notify({ kind: "error", key: "save", text: "Save failed" });
    notify({ kind: "success", key: "save", text: "Saved." });
    expect(toasts.map((t) => t.text)).toEqual(["Saved."]);
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts).toHaveLength(0);
  });

  it("dismissKey removes it and honours a custom duration", () => {
    notify({ key: "a", text: "A", duration: 8000 });
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts).toHaveLength(1);
    dismissKey("a");
    expect(toasts).toHaveLength(0);
  });

  it("resetNotices clears toasts, timers and dismissals but not pinned notices", () => {
    notify({ text: "x" });
    dismissDiagnostics("doc", "h");
    pinNotice({ key: "catalog", documentKey: "repo", kind: "warning", text: "t" });
    resetNotices();
    expect(toasts).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(isDiagnosticsDismissed("doc", "h")).toBe(false);
    expect(pinned).toHaveLength(1);
  });
});

describe("pinned notices", () => {
  it("pin replaces by key; unpin removes", () => {
    pinNotice({ key: "catalog", documentKey: "r1", kind: "warning", text: "one" });
    pinNotice({ key: "catalog", documentKey: "r1", kind: "warning", text: "two" });
    expect(pinned.map((p) => p.text)).toEqual(["two"]);
    unpinNotice("catalog");
    expect(pinned).toHaveLength(0);
  });
});

describe("toUiDiagnostic", () => {
  it("maps the engine's warning to warn, keeps error and info", () => {
    expect(toUiDiagnostic({ severity: "warning", message: "w" }).severity).toBe("warn");
    expect(toUiDiagnostic({ severity: "error", message: "e" }).severity).toBe("error");
    expect(toUiDiagnostic({ severity: "info", message: "i" }).severity).toBe("info");
  });

  it("a plain string (render/find/navigation, no severity) is info, never warn (srs#907)", () => {
    // Regression: these come from renderDocumentView/find, not repo.validate() — mislabelling
    // them `warn` made a corpus's render-note count masquerade as a validation-warning count.
    expect(toUiDiagnostic("plain")).toEqual({ severity: "info", message: "plain" });
  });
  it("diagnosticsFromStrings maps each", () => {
    expect(diagnosticsFromStrings(["a", "b"]).map((d) => d.message)).toEqual(["a", "b"]);
  });
});

describe("groupDiagnostics (captured engine strings)", () => {
  it("collapses ten identical R23 messages into one group with a count", () => {
    const g = groupDiagnostics(diagnosticsFromStrings(Array.from({ length: 10 }, () => R23)));
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(10);
    expect(g[0].message).toBe(R23);
  });

  it("orders error, warn, info, then first appearance", () => {
    const g = groupDiagnostics([
      { severity: "info", message: "i" },
      { severity: "warn", message: SECTION },
      { severity: "error", message: "e" },
      { severity: "warn", message: R23 },
      { severity: "warn", message: SECTION },
      { severity: "warn", message: FIND, where: "find" },
    ]);
    expect(g.map((x) => [x.severity, x.count])).toEqual([
      ["error", 1],
      ["warn", 2],
      ["warn", 1],
      ["warn", 1],
      ["info", 1],
    ]);
    expect(g[1].message).toBe(SECTION);
    expect(g[3].where).toEqual(["find"]);
  });

  it("keys on the trimmed message and the severity", () => {
    const g = groupDiagnostics([
      { severity: "warn", message: "a " },
      { severity: "warn", message: "a" },
      { severity: "error", message: "a" },
    ]);
    expect(g.map((x) => [x.severity, x.count])).toEqual([
      ["error", 1],
      ["warn", 2],
    ]);
  });

  it("the hash changes when the diagnostics change", () => {
    const a = diagnosticsHash(groupDiagnostics(diagnosticsFromStrings([R23])));
    const b = diagnosticsHash(groupDiagnostics(diagnosticsFromStrings([R23, R23])));
    expect(a).not.toBe(b);
  });
});
