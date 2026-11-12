// Visual markdown editing, the headless half (srs-web#749, decisions cb1b56ec, c7d81c5d,
// bf0229dd, eb9b4530; ADR-027 layer 2, ADR-033). Tiptap edits ONE paragraph visually and
// saves it as markdown; the core (renderMarkdown, passed in as `render`) is the judge of every
// round trip. No markup and no `.svelte` import here: VisualEditor.svelte owns the DOM.
import { Editor, type Extensions } from "@tiptap/core";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { Marked } from "marked";

/** The core's renderer (or a stand-in in tests): markdown in, sanitized HTML out. */
export type Render = (md: string) => string;

/**
 * Paragraph text that begins with a block marker is escaped when saved, or `1984. A year`
 * would come back as a list. Measured on the 37 typed cases: 10 failures down to 2.
 */
export function escapeBlockMarkers(text: string): string {
  return text
    .split("\n")
    .map((l) =>
      l
        .replace(/^( {0,3})(\d{1,9})([.)])(?=\s|$)/, "$1$2\\$3")
        .replace(/^( {0,3})([-+])(?=\s|$)/, "$1\\$2")
        .replace(/^( {0,3})(#{1,6})(?=\s|$)/, "$1\\$2")
        .replace(/^( {0,3})(-{3,}|={3,})\s*$/, (_m, a: string, b: string) => `${a}\\${b}`)
        .replace(/^ {4,}/, "")
    )
    .join("\n");
}

export const SafeParagraph = Paragraph.extend({
  renderMarkdown(node, h) {
    return escapeBlockMarkers(h.renderChildren(node.content ?? []));
  },
});

/** A private `marked`: the core does not autolink bare URLs and `marked` does, so switch it off here only. */
function privateMarked() {
  const m = new Marked();
  m.use({ tokenizer: { url: () => undefined } });
  return m;
}

/**
 * The allowlist (decision c7d81c5d). Installed: paragraphs, bold, italic, strikethrough, inline
 * code, code blocks, headings, bullet and numbered lists, quotes, links, hard breaks. Not
 * installed: images, tables, task lists, underline, horizontal rule.
 */
export function visualExtensions(): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      horizontalRule: false,
      trailingNode: false,
      dropcursor: false,
      gapcursor: false,
      paragraph: false,
      link: { openOnClick: false, autolink: false, linkOnPaste: false },
    }),
    SafeParagraph,
    // The private instance has no shared-state leak; the cast is the extension option's own type.
    Markdown.configure({
      marked: privateMarked() as unknown as NonNullable<
        Parameters<typeof Markdown.configure>[0]
      >["marked"],
    }),
  ];
}

/** A detached editor over markdown (no element: a headless document model). */
export function makeEditor(md: string, element?: HTMLElement, onUpdate?: () => void): Editor {
  return new Editor({
    element,
    extensions: visualExtensions(),
    content: md,
    contentType: "markdown",
    ...(onUpdate ? { onUpdate } : {}),
  });
}

/** Markdown out of an editor, trailing whitespace trimmed (the record holds the paragraph, not the editor's newline). */
export const toMarkdown = (editor: Editor): string => editor.getMarkdown().replace(/\s+$/, "");

/** Whitespace, empty paragraphs, hard-break spelling and split adjacent marks do not count as a difference. */
export const norm = (h: string): string =>
  h
    .replace(/<p><\/p>/g, "")
    .replace(/<br[^>]*>/g, " ")
    .replace(/\s+/g, "")
    .replace(/<\/strong><strong>|<\/em><em>/g, "");

/**
 * Check on opening: parse the markdown, serialize it again, and let the core judge. When the
 * core renders the round trip differently from the original (a table, an image, a rule, or
 * anything the allowlist does not hold), the paragraph opens as source with its text intact.
 */
export function opensVisually(md: string, render: Render): boolean {
  const e = makeEditor(md);
  try {
    return render(toMarkdown(e)) === render(md);
  } finally {
    e.destroy();
  }
}

/**
 * Check on saving: the core's rendering of the saved markdown, parsed back by the editor, must
 * equal the document, ignoring whitespace. `checker` is a second detached editor, reused.
 * Catches bold on `(a)` inside a word and overlapping bold and italic, both real serializer defects.
 */
export function savesFaithfully(
  editor: Editor,
  md: string,
  checker: Editor,
  render: Render
): boolean {
  checker.commands.setContent(render(md) || "<p></p>");
  return norm(checker.getHTML()) === norm(editor.getHTML());
}
