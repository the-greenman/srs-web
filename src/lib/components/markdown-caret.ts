/**
 * Maps a point in `MarkdownText`'s *rendered* HTML back to an offset in its raw markdown
 * source (srs-web#595): clicking a rendered paragraph must place the caret where the user
 * clicked, not always at the end. `renderMarkdown` (srs-client.ts) is a WASM black box with
 * no source-position metadata, so this re-derives — for the inline constructs it recognises
 * (bold/italic, inline code, links, backslash escapes) — the same plain text the renderer
 * produces, then walks a rendered-text offset back to the matching source offset.
 *
 * Not a full CommonMark parser: block constructs (headings, lists, blockquotes) and hard
 * line breaks are untouched passthrough, which can offset the mapped caret by the length of
 * an unrecognised block prefix. That is an accepted, documented degradation (plans/595-click-
 * caret-position.md) — it never throws and never lands outside the clicked paragraph.
 *
 * Maintenance note: this must stay a *subset* of what the actual renderer
 * (srs-rust/crates/srs-core/src/markdown.rs, pulldown-cmark with
 * `ENABLE_TABLES | ENABLE_STRIKETHROUGH`) does, including its CommonMark delimiter rules
 * (e.g. `_` disallowed intraword, unlike `*` — see below). If that renderer's config grows
 * (strikethrough, footnotes, …), this has no compiler-level link to it and can silently
 * drift; re-check this file against it when `markdown.rs` changes.
 */

/** One `**x**` / `__x__` style delimiter pair. */
interface Pairing {
  open: string;
  close: string;
}

const EMPHASIS: Pairing[] = [
  { open: "**", close: "**" },
  { open: "__", close: "__" },
];

const isAlnum = (c: string | undefined): boolean => !!c && /[A-Za-z0-9]/.test(c);

/**
 * The rendered plain text `renderMarkdown` would produce from `source`'s recognised inline
 * constructs, and — for each character of that text — the matching index in `source`.
 * `sourceOffsets.length === text.length`.
 */
export function stripInlineMarkdown(source: string): { text: string; sourceOffsets: number[] } {
  const text: string[] = [];
  const sourceOffsets: number[] = [];
  const n = source.length;
  let i = 0;

  const emit = (ch: string, srcIndex: number) => {
    text.push(ch);
    sourceOffsets.push(srcIndex);
  };
  const emitInner = (inner: { text: string; sourceOffsets: number[] }, base: number) => {
    for (let k = 0; k < inner.text.length; k++) emit(inner.text[k], base + inner.sourceOffsets[k]);
  };

  while (i < n) {
    const ch = source[i];

    // Backslash escape: CommonMark renders the next character literally, never as syntax.
    if (ch === "\\" && i + 1 < n) {
      emit(source[i + 1], i + 1);
      i += 2;
      continue;
    }

    // **bold** / __bold__
    const two = source.slice(i, i + 2);
    const emphasis = EMPHASIS.find((p) => p.open === two);
    if (emphasis) {
      const close = source.indexOf(emphasis.close, i + 2);
      if (close !== -1) {
        emitInner(stripInlineMarkdown(source.slice(i + 2, close)), i + 2);
        i = close + 2;
        continue;
      }
    }

    // *italic* / _italic_ — a single delimiter not immediately followed by a space.
    // CommonMark disables `_` (but not `*`) as an emphasis delimiter when it is intraword
    // (alphanumeric on the flanking side) — without this, a snake_case identifier like
    // `data_model_revision`, common in this very spec-authoring domain, would be misread
    // as italic and desync the mapping (reviewer finding).
    const opensHere = ch === "*" || ch === "_";
    const canOpen = ch !== "_" || !isAlnum(source[i - 1]);
    if (opensHere && i + 1 < n && source[i + 1] !== " " && canOpen) {
      const close = source.indexOf(ch, i + 1);
      const canClose = close !== -1 && (ch !== "_" || !isAlnum(source[close + 1]));
      if (close !== -1 && close > i + 1 && canClose) {
        emitInner(stripInlineMarkdown(source.slice(i + 1, close)), i + 1);
        i = close + 1;
        continue;
      }
    }

    // `code`
    if (ch === "`") {
      const close = source.indexOf("`", i + 1);
      if (close !== -1) {
        for (let k = i + 1; k < close; k++) emit(source[k], k);
        i = close + 1;
        continue;
      }
    }

    // [text](url "title")
    if (ch === "[") {
      const closeBracket = source.indexOf("]", i + 1);
      if (closeBracket !== -1 && source[closeBracket + 1] === "(") {
        const closeParen = source.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          emitInner(stripInlineMarkdown(source.slice(i + 1, closeBracket)), i + 1);
          i = closeParen + 1;
          continue;
        }
      }
    }

    emit(ch, i);
    i += 1;
  }

  return { text: text.join(""), sourceOffsets };
}

/**
 * The source offset matching `renderedOffset` characters into the rendered plain text — the
 * inverse of `stripInlineMarkdown`. Clamped into range; an offset at or past the end of the
 * rendered text maps to the end of `source`.
 */
export function mapRenderedOffsetToSource(source: string, renderedOffset: number): number {
  const { text, sourceOffsets } = stripInlineMarkdown(source);
  const clamped = Math.max(0, Math.min(renderedOffset, text.length));
  return clamped >= sourceOffsets.length ? source.length : sourceOffsets[clamped];
}

/**
 * The number of rendered-text characters between the start of `container` and the DOM point
 * at viewport coordinates `(x, y)` — the offset a click at that point lands on. `null` if the
 * point cannot be resolved to a position inside `container` (caller should fall back to the
 * default end-of-text caret).
 */
export function renderedOffsetAtPoint(container: HTMLElement, x: number, y: number): number | null {
  const doc = container.ownerDocument;
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    if (!range) return null;
    node = range.startContainer;
    offset = range.startOffset;
  } else {
    const withFirefox = doc as Document & {
      caretPositionFromPoint?: (
        px: number,
        py: number
      ) => { offsetNode: Node; offset: number } | null;
    };
    const pos = withFirefox.caretPositionFromPoint?.(x, y);
    if (!pos) return null;
    node = pos.offsetNode;
    offset = pos.offset;
  }
  if (!node || !container.contains(node)) return null;
  const pre = doc.createRange();
  pre.setStart(container, 0);
  pre.setEnd(node, offset);
  return pre.toString().length;
}
