/** Display-only label helpers for the Records and Map surfaces. Real markdown rendering is #479. */

/** A core label with its markdown backticks removed (display only; the record is unchanged). */
export function plainLabel(label: string | undefined | null, fallback = ""): string {
  const text = (label ?? "").replace(/`/g, "").trim();
  return text || fallback;
}

/**
 * Wrap a label to at most `lines` lines of about `width` characters, breaking at spaces, and end the
 * last line with an ellipsis when text is left over. A single word longer than `width` is cut.
 */
export function wrapLabel(label: string, width = 18, lines = 2): string[] {
  const out: string[] = [];
  let rest = plainLabel(label);
  while (rest && out.length < lines) {
    if (rest.length <= width) {
      out.push(rest);
      rest = "";
      break;
    }
    let cut = rest.lastIndexOf(" ", width);
    if (cut <= 0) cut = width;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out[out.length - 1] = `${out[out.length - 1].slice(0, width - 1).trimEnd()}…`;
  return out;
}
