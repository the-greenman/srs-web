/**
 * decision-export-utils.ts — presentation glue for decision-document export.
 *
 * Single-decision and whole-log export both render through the core document-view
 * engine (`renderDocumentView`) — there is no decision-type-specific TypeScript
 * formatting (muDemocracy.org#43 acceptance box 4; ADR-001). These helpers cover only
 * the presentation the browser needs *around* the core render output:
 *
 * - `markdownToText`: derive plain text from the core Markdown output. The engine has no
 *   `"text"` render format, and stripping Markdown syntax is format-generic (it does not
 *   know about decision fields), so it belongs in the client, not the core.
 * - `wrapLogHtml`: wrap the HTML fragment from `renderDocumentView("html")` in a complete
 *   HTML document so a download is a valid standalone file.
 * - `triggerDownload`: browser file-download helper.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Convert Markdown (as produced by `renderDocumentView("markdown")`) to plain text.
 *
 * Format-generic — it strips Markdown syntax, not decision fields — so it stays
 * presentation-only and does not re-introduce the per-type formatting that box 4 removed.
 * Handles the constructs the document-view renderer emits: ATX headings, emphasis, inline
 * code, links, blockquotes, list bullets, and horizontal rules.
 */
export function markdownToText(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      // Horizontal rules (---, ***, ___) drop out entirely.
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return "";
      let l = line;
      l = l.replace(/^#{1,6}\s+/, ""); // ATX headings → text
      l = l.replace(/^\s*>\s?/, ""); // blockquotes
      l = l.replace(/^(\s*)[-*+]\s+/, "$1• "); // list bullets
      l = l.replace(/`([^`]+)`/g, "$1"); // inline code
      l = l.replace(/\*\*([^*]+)\*\*/g, "$1"); // bold
      l = l.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2"); // italic (*)
      l = l.replace(/\b_([^_\n]+)_\b/g, "$1"); // italic (_)
      l = l.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links → text
      return l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs
    .trim();
}

/**
 * Trigger a file download in the browser. Appends a temporary anchor to the document,
 * clicks it, removes it, then revokes the object URL after a tick so the download
 * queue has time to register it before the URL is freed.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Wrap an HTML fragment (e.g. from renderDocumentView "html") in a full HTML document.
 * renderDocumentView returns a bare <div class="srs-document">…</div> fragment, not a
 * complete document — this makes the download a valid standalone file.
 */
export function wrapLogHtml(fragment: string, title: string): string {
  return [
    "<!DOCTYPE html>",
    `<html><head><meta charset="utf-8">`,
    `<title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;max-width:80ch;margin:2rem auto;padding:0 1rem}h1,h2,h3{line-height:1.2}.srs-document{padding:0}</style>",
    "</head><body>",
    `<h1>${escapeHtml(title)}</h1>`,
    fragment,
    "</body></html>",
  ].join("\n");
}
