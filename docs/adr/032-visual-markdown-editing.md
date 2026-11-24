# ADR-032: Visual editing of one paragraph, with the core judging every round trip

- **Status:** proposed (the practice is ratified: decisions cb1b56ec, c7d81c5d, bf0229dd, eb9b4530, owner session of 2026-11-06)
- **Date:** 2026-11-10
- **Issue:** srs-web#749 (remedy ecc44c03, problem SP-160)

## Decision

A writer can edit a paragraph visually and still save plain markdown. The surface is **off by default**: `MarkdownText` takes `mode` (`source` or `visual`), defaults to `source`. Block passes it on, and the essay shell reads it from a per-browser setting (`src/lib/essay/edit-mode.ts`, `srs-web.essay.edit-mode`), which is `source` unless set: nothing a writer sees turns it on until srs-web#752.

- **Library (cb1b56ec).** Tiptap 3, pinned exactly: `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-paragraph` (the last only to extend the paragraph with the escape fix), and `marked` (for a private instance with bare-URL autolinking off). The editor is a lazy chunk, loaded by a dynamic import when a paragraph is first edited visually, so reading an essay never loads it.
- **Allowlist (c7d81c5d).** Paragraphs, bold, italic, strikethrough, inline code, code blocks, headings, bullet and numbered lists, quotes, links, hard breaks. Not installed: images, tables, task lists, underline, horizontal rule. Off-list content opens as source, intact.
- **The core judges (bf0229dd).** `renderMarkdown` is the only authority on what markdown means. On opening, the round trip must render as the original, else the paragraph opens as source with a one-line note. On saving, the core's rendering of the saved markdown, parsed back by the editor, must equal the document; if not, the text is still saved and the paragraph flips to source with a note.
- **One instance (eb9b4530).** One editor, for the focused paragraph only, destroyed on blur. Headless behaviour is in `src/lib/visual-markdown.ts` (ADR-027); `VisualEditor.svelte` owns only the DOM.
- **No edit, no write.** A commit follows only a real document change.
- **Paragraph keys (srs-web#750).** Every Block shortcut works in both modes. The visual editor passes every key to Block first and answers what Block cannot read from the DOM: the split at the caret (each half serialized to markdown on its own; at a textblock edge it cuts at the neighbour's edge, so no empty list item is left), the first or last line, and the very start (never inside a list, where Tab indents the item). The caret opens where the writer clicked (`posAtCoords`), at the start after an arrow down or a split, else at the end. The essay history owns Ctrl-Z while the editor is `data-pristine` and the editor's own undo after, so the editor keeps its history.
- **Toolbar (srs-web#751).** The open paragraph shows a floating toolbar (it takes no layout space, so opening or leaving a paragraph never moves the text below a click): bold, italic, heading (an `ActionMenu`: normal text and levels 2 to 4), bulleted and numbered list, quote, code, and link (a `Popover` with one URL field). Each button shows its state (`aria-pressed`) and takes no focus on `mousedown`, so a click keeps the edit and the caret. The edit ends only when focus leaves the editor and its toolbar, so Tab and the link field reach the toolbar. Strikethrough has no button and stays editable; Tiptap's typing shortcuts stay on. The buttons' commands are headless (`FORMATS`, `setLink` in `visual-markdown.ts`).
- **Escape fix.** Paragraph text that begins with a block marker is escaped when saved (`1984\. A year`).

## Consequences

- The cost is one lazy chunk, paid only by a writer who edits visually (size in the PR).
- Two Tiptap serializer defects are known and caught by the save check, not fixed: bold on `(a)` inside a word, and overlapping bold and italic.
- Turning the surface on is a later item of the holon (srs-web#752).

## Revisit when

A Tiptap major release, a markdown construct the allowlist should hold, or the save check firing on real essays.
