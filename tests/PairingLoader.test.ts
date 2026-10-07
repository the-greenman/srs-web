// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REFRESH_MIN_MS } from "../src/lib/components/PairingLoader.svelte";
import { StalePairing } from "../src/lib/mcp/relay-host";
import { toasts } from "../src/lib/notices.svelte";
import Host from "./PairingLoaderHost.svelte";

const T0 = Date.parse("2026-01-01T00:00:00Z");
const res = (code: string, expiresAt: number) => ({
  code,
  expiresAt,
  connectorUrl: "https://r/call",
});
let host: HTMLElement;
const mount = (pair: () => Promise<ReturnType<typeof res>>, now = T0) => {
  const r = render(Host, { pair, now });
  host = r.container;
  return r;
};
const shown = () => host.querySelector('[data-testid="host"] p')?.textContent;
const tick = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  toasts.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PairingLoader", () => {
  it("calls pair once on mount and refreshes once at expiresAt", async () => {
    const pair = vi
      .fn()
      .mockResolvedValueOnce(res("AAAAA-AAAAA", T0 + 60_000))
      .mockResolvedValue(res("BBBBB-BBBBB", T0 + 660_000));
    mount(pair);
    await tick(0);
    expect(pair).toHaveBeenCalledTimes(1);
    expect(shown()).toBe("AAAAA-AAAAA||1");
    await tick(59_000);
    expect(pair).toHaveBeenCalledTimes(1);
    await tick(1_000);
    expect(pair).toHaveBeenCalledTimes(2);
    expect(shown()).toBe("BBBBB-BBBBB||10");
  });

  it("announces a changed code, not the first load or an unchanged refresh", async () => {
    const pair = vi
      .fn()
      .mockResolvedValueOnce(res("AAAAA-AAAAA", T0 + 10_000))
      .mockResolvedValueOnce(res("AAAAA-AAAAA", T0 + 20_000))
      .mockResolvedValue(res("BBBBB-BBBBB", T0 + 600_000));
    mount(pair);
    await tick(0);
    expect(toasts).toHaveLength(0);
    await tick(10_000);
    expect(toasts).toHaveLength(0);
    await tick(10_000);
    expect(toasts.map((t) => t.text)).toEqual(["New pairing code"]);
  });

  it("never storms when expiresAt is already past", async () => {
    const pair = vi.fn().mockResolvedValue(res("AAAAA-AAAAA", T0 - 1_000));
    mount(pair);
    await tick(12_000);
    expect(pair.mock.calls.length).toBeLessThanOrEqual(3);
    expect(pair.mock.calls.length).toBeGreaterThan(1);
  });

  it("retries a failure no faster than REFRESH_MIN_MS, keeping the previous data", async () => {
    const pair = vi
      .fn()
      .mockResolvedValueOnce(res("AAAAA-AAAAA", T0 + 1_000))
      .mockRejectedValue(new Error("pairing failed: 500"));
    mount(pair);
    await tick(REFRESH_MIN_MS);
    expect(pair).toHaveBeenCalledTimes(2);
    expect(shown()).toBe("AAAAA-AAAAA|pairing failed: 500|1");
    await tick(REFRESH_MIN_MS - 1);
    expect(pair).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(pair).toHaveBeenCalledTimes(3);
  });

  it("shows no error for StalePairing", async () => {
    const pair = vi.fn().mockRejectedValue(new StalePairing());
    mount(pair);
    await tick(0);
    expect(shown()).toBe("-||0");
  });

  it("unmount clears the timer and drops an in-flight result", async () => {
    let resolve: (v: ReturnType<typeof res>) => void = () => {};
    const pair = vi.fn(() => new Promise<ReturnType<typeof res>>((r) => (resolve = r)));
    const { unmount } = mount(pair);
    unmount();
    resolve(res("AAAAA-AAAAA", T0 + 1_000));
    await tick(30_000);
    expect(pair).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("advancing `now` does not call pair again", async () => {
    const pair = vi.fn().mockResolvedValue(res("AAAAA-AAAAA", T0 + 600_000));
    const { rerender } = mount(pair);
    await tick(0);
    await rerender({ now: T0 + 15_000 });
    await tick(0);
    expect(pair).toHaveBeenCalledTimes(1);
  });

  it("does not auto-retry a failure while no code is held; Retry does", async () => {
    const pair = vi
      .fn()
      .mockRejectedValueOnce(new Error("pairing failed: 500"))
      .mockResolvedValue(res("AAAAA-AAAAA", T0 + 600_000));
    const { getByTestId } = mount(pair);
    await tick(60_000);
    expect(pair).toHaveBeenCalledTimes(1);
    expect(shown()).toBe("-|pairing failed: 500|0");
    getByTestId("retry").click();
    await tick(REFRESH_MIN_MS);
    expect(pair).toHaveBeenCalledTimes(2);
    expect(shown()).toBe("AAAAA-AAAAA||10");
  });
});
