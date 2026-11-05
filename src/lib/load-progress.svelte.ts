/**
 * How far along opening a repository is (srs-web#737). The storage readers report real counts;
 * App mounts LoadProgress while `phase` is set. One open at a time: the source chooser disables
 * itself while busy.
 */
export type LoadPhase = "finding" | "reading" | "preparing";

export const loadProgress = $state<{ phase: LoadPhase | null; done: number; total: number }>({
  phase: null,
  done: 0,
  total: 0,
});

export function reportLoad(phase: LoadPhase | null, total = 0): void {
  loadProgress.phase = phase;
  loadProgress.done = 0;
  loadProgress.total = total;
}

/** Ignored once the load has ended: one failed read rejects the open while other reads still finish. */
export function advanceLoad(done: number): void {
  if (loadProgress.phase !== null) loadProgress.done = done;
}

export const endLoad = (): void => reportLoad(null);

/**
 * Say "preparing" and let it paint: the engine call that follows is synchronous and blocks the page.
 * The timeout is for a hidden tab, where requestAnimationFrame never fires.
 */
export function preparingLoad(): Promise<void> {
  reportLoad("preparing");
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 100);
  });
}
