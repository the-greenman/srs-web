/**
 * The ONE comment-thread visibility rule set (srs-web#431, #432). UI state only: a set of
 * paragraph ids whose thread the reader has opened. Everything else (header show/hide all,
 * badge, zoom, posting, hidden paragraphs) derives from it here, never from component flags.
 */
export type Open = ReadonlySet<string>;
export type Summary = "all" | "none" | "mixed";

/** A thread shows iff the reader opened it and its paragraph is neither hidden nor inherited-hidden. */
export const isShown = (open: Open, id: string, hidden: Open, inherited: Open): boolean =>
  open.has(id) && !hidden.has(id) && !inherited.has(id);

export function setOpen(open: Open, id: string, on: boolean): Set<string> {
  const next = new Set(open);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** Badge: flip one paragraph. */
export const toggle = (open: Open, id: string): Set<string> => setOpen(open, id, !open.has(id));

/** Over the paragraphs that can show a thread (the caller passes the non-hidden ids in view). */
export function summary(open: Open, ids: readonly string[]): Summary {
  const n = ids.filter((id) => open.has(id)).length;
  return n === 0 ? "none" : n === ids.length ? "all" : "mixed";
}

/** Header Comments: everything open hides all; none or mixed shows all. Hidden paragraphs keep their state. */
export function toggleAll(open: Open, ids: readonly string[], all: readonly string[]): Set<string> {
  if (summary(open, ids) === "all") return new Set([...open].filter((id) => !ids.includes(id)));
  return new Set([...open, ...all]);
}
