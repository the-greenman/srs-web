/** The one relative-time formatter: "just now", "Ns ago", "N min ago", "N h ago", then the locale date. */
export function relativeTime(at: number | string, now: number): string {
  const t = typeof at === "string" ? Date.parse(at) : at;
  if (at === "" || Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(t).toLocaleDateString();
}
