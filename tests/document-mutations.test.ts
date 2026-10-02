import { describe, expect, it } from "vitest";
import { DocumentMutationTracker } from "../src/lib/document-mutations.js";

/** The tracker's revision IS the engine write_epoch (srs-web#345): tests drive it with epoch values. */
describe("DocumentMutationTracker", () => {
  it("clears dirty state when the persisted snapshot is still current", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument(0);
    tracker.sync(1);

    const snapshot = tracker.captureSave();
    expect(tracker.dirty).toBe(true);
    expect(tracker.completeSave(snapshot)).toBe(true);
    expect(tracker.dirty).toBe(false);
  });

  it("a no-op action (epoch unchanged) does not mark the document dirty", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument(7);

    expect(tracker.sync(7)).toBe(false);
    expect(tracker.dirty).toBe(false);
  });

  it("retains dirty state when a mutation lands while provider persistence is pending", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument(0);
    tracker.sync(1);
    const snapshot = tracker.captureSave();

    tracker.sync(2);

    expect(tracker.completeSave(snapshot)).toBe(false);
    expect(tracker.dirty).toBe(true);
    expect(tracker.completeSave(tracker.captureSave())).toBe(true);
    expect(tracker.dirty).toBe(false);
  });

  it("does not allow a save from a replaced document lifetime to clear the current state", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument(0);
    const oldSnapshot = tracker.captureSave();

    tracker.beginDocument(0);
    tracker.sync(1);

    expect(tracker.completeSave(oldSnapshot)).toBe(false);
    expect(tracker.dirty).toBe(true);
  });

  it("starts restored working copies dirty", () => {
    const tracker = new DocumentMutationTracker();
    tracker.beginDocument(3, { dirty: true });

    expect(tracker.dirty).toBe(true);
  });
});
