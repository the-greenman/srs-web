/**
 * Where a caret in rendered markdown falls in its source (srs-web#595). `renderedPrefix` is the
 * rendered text before the caret. Its non-space characters are matched in order against the
 * source, skipping markup the renderer drops (`**`, `#`, `- `, link brackets); whitespace is
 * ignored on both sides, because rendering collapses it. A closing emphasis marker right after
 * the match is stepped over, so the caret lands outside `**bold**`, not inside it; so is a
 * space when the rendered prefix ends in one.
 * ponytail: a greedy match, exact for prose; a caret inside a link's text can land in its URL.
 */
export function sourceOffset(source: string, renderedPrefix: string): number {
  const want = renderedPrefix.replace(/\s+/g, "");
  if (!want) return 0;
  let j = 0;
  for (let i = 0; i < source.length; i++) {
    if (/\s/.test(source[i]) || source[i] !== want[j]) continue;
    if (++j < want.length) continue;
    let end = i + 1;
    while (end < source.length && "*_~`".includes(source[end])) end++;
    // The caret sat after rendered whitespace: put it after the source's too.
    if (/\s$/.test(renderedPrefix)) while (end < source.length && /[ \t]/.test(source[end])) end++;
    return end;
  }
  return source.length;
}
