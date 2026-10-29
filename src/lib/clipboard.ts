/** Writes text to the clipboard. false when unavailable (no navigator.clipboard) or denied; never throws. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Writes html to the clipboard as rich text (text/html) with the markup itself as the plain-text fallback. false when unavailable or denied; never throws. */
export async function copyHtml(html: string): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([html], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}
