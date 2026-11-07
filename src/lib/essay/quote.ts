/**
 * Where a quoted passage sits in its source text (srs-web#525): the nearest markdown heading above it,
 * else the line range. Headless: a string in, a string out.
 */
export function locatorFor(full: string, selected: string): string {
  const needle = selected.trim();
  const at = needle ? full.indexOf(needle) : -1;
  if (at < 0) return "";
  const before = full.slice(0, at);
  const first = before.split("\n").length;
  const last = first + needle.split("\n").length - 1;
  const heading = before
    .split("\n")
    .reverse()
    .find((l) => /^#{1,6}\s+\S/.test(l));
  if (heading) return heading.replace(/^#{1,6}\s+/, "").trim();
  return first === last ? `line ${first}` : `lines ${first}-${last}`;
}

/** Where the quoted words sit in the source text (trimmed, first occurrence); null when the text no longer holds them. */
export function passageIn(full: string, words: string): { start: number; end: number } | null {
  const needle = words.trim();
  const start = needle ? full.indexOf(needle) : -1;
  return start < 0 ? null : { start, end: start + needle.length };
}
