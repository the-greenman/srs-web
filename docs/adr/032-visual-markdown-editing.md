# ADR-032: Visual editing of one paragraph, with the core judging every round trip

- **Status:** proposed (the practice is ratified: decisions cb1b56ec, c7d81c5d, bf0229dd, eb9b4530, owner session of 2026-11-06)
- **Date:** 2026-11-10
- **Issue:** srs-web#749 (remedy ecc44c03, problem SP-160)

## Decision

A writer can edit a paragraph visually and still save plain markdown. The surface is **off by default**: `MarkdownText` takes `mode` (`source` or `visual`), defaults to `source`, and no caller passes `visual` yet.

- **Library (cb1b56ec).** Tiptap 3, pinned exactly: `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-paragraph` (the last only to extend the paragraph with the escape fix), and `marked` (for a private instance with bare-URL autolinking off). The editor is a lazy chunk, loaded by a dynamic import when a paragraph is first edited visually, so reading an essay never loads it.
- **Allowlist (c7d81c5d).** Paragraphs, bold, italic, strikethrough, inline code, code blocks, headings, bullet and numbered lists, quotes, links, hard breaks. Not installed: images, tables, task lists, underline, horizontal rule. Off-list content opens as source, intact.
- **The core judges (bf0229dd).** `renderMarkdown` is the only authority on what markdown means. On opening, the round trip must render as the original, else the paragraph opens as source with a one-line note. On saving, the core's rendering of the saved markdown, parsed back by the editor, must equal the document; if not, the text is still saved and the paragraph flips to source with a note.
- **One instance (eb9b4530).** One editor, for the focused paragraph only, destroyed on blur. Headless behaviour is in `src/lib/visual-markdown.ts` (ADR-027); `VisualEditor.svelte` owns only the DOM.
- **No edit, no write.** A commit follows only a real document change.
- **Escape fix.** Paragraph text that begins with a block marker is escaped when saved (`1984\. A year`).

## Consequences

- The cost is one lazy chunk, paid only by a writer who edits visually (size in the PR).
- Two Tiptap serializer defects are known and caught by the save check, not fixed: bold on `(a)` inside a word, and overlapping bold and italic.
- Turning the surface on, the toolbar, keep-split and undo are later items of the holon (srs-web#750 to #752).

## Revisit when

A Tiptap major release, a markdown construct the allowlist should hold, or the save check firing on real essays.
