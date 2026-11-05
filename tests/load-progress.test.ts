import { describe, expect, it } from "vitest";
import { advanceLoad, endLoad, loadProgress, reportLoad } from "../src/lib/load-progress.svelte.js";

describe("load progress (srs-web#737)", () => {
  it("a read finishing after the open failed does not bring the indicator back", () => {
    reportLoad("reading", 10);
    advanceLoad(4);
    expect(loadProgress.done).toBe(4);
    endLoad();
    advanceLoad(5);
    expect({ ...loadProgress }).toEqual({ phase: null, done: 0, total: 0 });
  });
});
