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

it("stillValid() === false cancels the retry", async () => {
  const open = vi.fn(async () => false);
  await reopenSaved([lib[0]], "R", open, { stillValid: () => false });
  await vi.advanceTimersByTimeAsync(5000);
  expect(open).toHaveBeenCalledTimes(1);
});
