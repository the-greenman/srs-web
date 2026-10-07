/**
 * Open an SRS archive from a URL (`?open=<url>`, #471). Fetching and validating only: the bytes
 * go through the same loader as "From this device" (App.loadArchiveDocument / loadDocument).
 */

import { formatBytes } from "./format-bytes.js";

/** Largest archive we will download (bytes). The error names it. */
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

export class OpenUrlError extends Error {}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https only; `http` only for a local host in development. Credentials in the URL are refused. */
export function parseOpenUrl(raw: string, allowLocalHttp = import.meta.env.DEV): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OpenUrlError("That is not a valid link.");
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(allowLocalHttp && local && url.protocol === "http:")) {
    throw new OpenUrlError("Only https:// links can be opened.");
  }
  if (url.username || url.password)
    throw new OpenUrlError("Links with a user name or password are not opened.");
  return url;
}

/** The query string without `open`, keeping every other parameter and the hash. */
export function withoutOpenParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("open");
  return url.pathname + url.search + url.hash;
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const tooLarge = () =>
    new OpenUrlError(
      `The file is larger than the ${formatBytes(MAX_ARCHIVE_BYTES)} limit for opening from a link.`
    );
  if (Number(res.headers.get("content-length")) > MAX_ARCHIVE_BYTES) throw tooLarge();
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_ARCHIVE_BYTES) {
      void reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** `.srs` is a ZIP ("PK\x03\x04"); `.srsj` is JSON. Anything else (an HTML error page, say) is not an archive. */
export function sniffArchive(bytes: Uint8Array): "srs" | "srsj" | null {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) return "srs";
  // TextDecoder drops a UTF-8 BOM
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  return head.startsWith("{") ? "srsj" : null;
}

/**
 * Download the archive as a `File` named from the URL (extension fixed up from the content), so the
 * caller can hand it to the same dispatch as a file chosen on the device.
 */
export async function fetchArchiveFile(url: URL, fetchFn: typeof fetch = fetch): Promise<File> {
  let res: Response;
  try {
    res = await fetchFn(url.href, { credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    // The browser does not say which: a network failure and a CORS refusal look the same to script.
    throw new OpenUrlError(
      `Could not fetch ${url.host}: the network failed, or the server does not allow other sites to read this file (CORS).`
    );
  }
  // A redirect must stay on the host the user was shown, and be https like any other link.
  if (res.url) {
    const to = parseOpenUrl(res.url);
    if (to.host !== url.host)
      throw new OpenUrlError(`${url.host} redirected to ${to.host}, which is not opened.`);
  }
  if (!res.ok)
    throw new OpenUrlError(`${`${url.host} answered ${res.status} ${res.statusText}`.trim()}.`);
  const bytes = await readCapped(res);
  const kind = sniffArchive(bytes);
  if (!kind) throw new OpenUrlError("That link is not an SRS archive (.srs or .srsj).");
  let name = decodeURIComponent(url.pathname.split("/").pop() || "") || "repository";
  if (!new RegExp(`\\.${kind}$`, "i").test(name))
    name = `${name.replace(/\.(srs|srsj|json)$/i, "")}.${kind}`;
  return new File([bytes as BlobPart], name);
}
