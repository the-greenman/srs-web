import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentConnection } from "../src/lib/agent-connections";
import { reopenSaved } from "../src/lib/reopen";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const lib = [
  { id: "a", reopen: "R" },
  { id: "b", reopen: "other" },
  { id: "c" },
  { id: "d", reopen: true as unknown as string }, // legacy boolean flag
  { id: "e", reopen: "R" },
] as AgentConnection[];

it("opens only entries saved for this repository, in order", async () => {
  const open = vi.fn(async () => true);
  await reopenSaved(lib, "R", open);
  expect(open.mock.calls.map(([c]) => c.id)).toEqual(["a", "e"]);
  vi.advanceTimersByTime(5000);
  expect(open).toHaveBeenCalledTimes(2);
});

it("retries a held lock exactly once after the delay", async () => {
  const open = vi.fn(async () => false);
  await reopenSaved([lib[0]], "R", open);
  expect(open).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(open).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(open).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(open).toHaveBeenCalledTimes(2);
});

it("a repo change between schedule and fire cancels the retry; and stops the loop", async () => {
  let valid = true;
  const open = vi.fn(async () => false);
  await reopenSaved([lib[0]], "R", open, { stillValid: () => valid });
  valid = false;
  await vi.advanceTimersByTimeAsync(5000);
  expect(open).toHaveBeenCalledTimes(1);
  const open2 = vi.fn(async () => {
    valid = false;
    return true;
  });
  valid = true;
  await reopenSaved(lib, "R", open2, { stillValid: () => valid });
  expect(open2).toHaveBeenCalledTimes(1); // "e" is not opened after the repo changed
});

it("stillValid() === false cancels the retry", async () => {
  let valid = true;
  const open = vi.fn(async () => {
    valid = false;
    return false;
  });
  await reopenSaved([lib[0]], "R", open, { stillValid: () => valid });
  await vi.advanceTimersByTimeAsync(5000);
  expect(open).toHaveBeenCalledTimes(1);
});
