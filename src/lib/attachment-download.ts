import { getAttachmentBytes } from "$lib/srs-client.js";
import type { SrsRepository } from "$lib/srs-client.js";

/** Save an attachment's bytes through a Blob + `<a download>`. Throws when the bytes are unavailable
 * (the binding reads archive-loaded repositories only, not `.srsj`). The one download site. */
export function downloadAttachment(
  repo: SrsRepository,
  documentId: string,
  fileName: string
): void {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(getAttachmentBytes(repo, documentId))])
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
