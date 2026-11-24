// Visual markdown editing, the headless half (srs-web#749, decisions cb1b56ec, c7d81c5d,
// bf0229dd, eb9b4530; ADR-027 layer 2, ADR-033). Tiptap edits ONE paragraph visually and
// saves it as markdown; the core (renderMarkdown, passed in as `render`) is the judge of every
// round trip. No markup and no `.svelte` import here: VisualEditor.svelte owns the DOM.
import { Editor, type Extensions } from "@tiptap/core";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Markdown } from "@tiptap/markdown";
import { Selection } from "@tiptap/pm/state";
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

/**
 * Whitespace, empty blocks, hard-break spelling and split adjacent marks do not count as a difference.
 * Empty blocks: a heading, quote or list chosen before its text is typed is not a reason to fall back.
 */
export const norm = (h: string): string => {
  let out = h;
  let last: string;
  do {
    last = out;
    out = out.replace(/<(p|h[1-6]|li|ul|ol|blockquote)(?: [^>]*)?>\s*<\/\1>/g, "");
  } while (out !== last);
  return out
    .replace(/<br[^>]*>/g, " ")
    .replace(/\s+/g, "")
    .replace(/<\/strong><strong>|<\/em><em>/g, "");
};

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
 * Ctrl/Cmd+Enter (srs-web#750): the markdown before and from `pos`, each half serialized on its
 * own, or null unless both hold text. The source editor's rule, over the document instead of text.
 */
export function splitAt(editor: Editor, pos: number): [string, string] | null {
  const { doc } = editor.state;
  const $pos = doc.resolve(pos);
  // At a textblock's edge, cut at the neighbouring textblock's edge: no empty list item or quote is left behind.
  const prev = $pos.parentOffset === 0 && Selection.findFrom(doc.resolve($pos.before()), -1, true);
  const next =
    $pos.parentOffset === $pos.parent.content.size &&
    Selection.findFrom(doc.resolve($pos.after()), 1, true);
  const half = (from: number, to: number) =>
    editor.markdown?.serialize(doc.cut(from, to).toJSON()) ?? "";
  const before = half(0, prev ? prev.from : pos).trimEnd();
  const after = half(next ? next.from : pos, doc.content.size).trim();
  return before.trim() && after ? [before, after] : null;
}

/** The caret is on the document's first (up) / last (down) visual line: arrows leave the paragraph. Needs layout. */
export function atEdge(editor: Editor, up: boolean): boolean {
  const { view, state } = editor;
  const { $head, empty } = state.selection;
  if (!empty || !view.endOfTextblock(up ? "up" : "down")) return false;
  const edge = state.doc.resolve(up ? $head.before() : $head.after());
  return !Selection.findFrom(edge, up ? -1 : 1, true);
}

/** The caret is at the very start of the document and not in a list (there Tab indents the item). */
export function atStart(editor: Editor): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty || $from.parentOffset > 0) return false;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "listItem") return false;
  return !Selection.findFrom(editor.state.doc.resolve($from.before()), -1, true);
}

/**
 * The formatting toolbar's buttons (srs-web#751), in order. Every one is a Tiptap command inside
 * the allowlist (decision c7d81c5d). Strikethrough has no button but stays editable (Ctrl+Shift+S).
 * Heading is a menu of levels 2 to 4 (the essay title holds level 1; any other level in the text stays
 * editable and lights the button). Link is `setLink` (it needs a URL).
 */
export interface Format {
  name: string;
  label: string;
  active: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

/** The heading menu's rows. Choosing the level that is on takes the heading off. */
const HEADINGS: Format[] = [
  {
    name: "paragraph",
    label: "Normal text",
    active: (e) => !e.isActive("heading"),
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  ...([2, 3, 4] as const).map(
    (level): Format => ({
      name: `heading${level}`,
      label: `Heading ${level}`,
      active: (e) => e.isActive("heading", { level }),
      run: (e) => e.chain().focus().toggleHeading({ level }).run(),
    })
  ),
];

export const FORMATS: (Format | (Omit<Format, "run"> & { menu: Format[] }))[] = [
  {
    name: "bold",
    label: "Bold",
    active: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    name: "italic",
    label: "Italic",
    active: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    name: "heading",
    label: "Heading",
    active: (e) => e.isActive("heading"),
    menu: HEADINGS,
  },
  {
    name: "bulletList",
    label: "Bulleted list",
    active: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    name: "orderedList",
    label: "Numbered list",
    active: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    name: "blockquote",
    label: "Quote",
    active: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    name: "code",
    label: "Code",
    active: (e) => e.isActive("code"),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
];

/**
 * The link button: link the selection (or the link the caret is in) to `href`; an empty `href`
 * removes the link. With nothing selected and no link here, the URL itself is inserted as the link text.
 */
export function setLink(e: Editor, href: string): void {
  const url = href.trim();
  const chain = e.chain().focus().extendMarkRange("link");
  if (!url) chain.unsetLink().run();
  else if (e.state.selection.empty && !e.isActive("link"))
    chain
      .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] })
      .run();
  else chain.setLink({ href: url }).run();
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
