import { describe, expect, it } from "vitest";
import { DocumentMutationTracker } from "../src/lib/document-mutations.js";

describe("DocumentMutationTracker", () => {
  it("clears dirty state when the persisted snapshot is still current", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument();
    tracker.recordMutation();

    const snapshot = tracker.captureSave();
    expect(tracker.dirty).toBe(true);
    expect(tracker.completeSave(snapshot)).toBe(true);
    expect(tracker.dirty).toBe(false);
  });

  it("retains dirty state when a mutation lands while provider persistence is pending", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument();
    tracker.recordMutation();
    const snapshot = tracker.captureSave();

    tracker.recordMutation();

    expect(tracker.completeSave(snapshot)).toBe(false);
    expect(tracker.dirty).toBe(true);
    expect(tracker.completeSave(tracker.captureSave())).toBe(true);
    expect(tracker.dirty).toBe(false);
  });

  it("does not allow a save from a replaced document lifetime to clear the current state", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument();
    const oldSnapshot = tracker.captureSave();

    tracker.beginDocument();
    tracker.recordMutation();

    expect(tracker.completeSave(oldSnapshot)).toBe(false);
    expect(tracker.dirty).toBe(true);
  });

  it("starts restored working copies dirty", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument({ dirty: true });

    expect(tracker.dirty).toBe(true);
  });
});
