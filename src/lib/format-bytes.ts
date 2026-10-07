/** Human-readable size: whole B and KB, one decimal above (a trailing ".0" is dropped). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const [v, unit] = n < 1024 ** 3 ? [n / 1024 ** 2, "MB"] : [n / 1024 ** 3, "GB"];
  return `${v.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}
