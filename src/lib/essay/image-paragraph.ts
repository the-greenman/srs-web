/**
 * The essay image paragraph (srs-web#764, essay package 1.11.0, remedy cda413b1): one attached image
 * with alt text, an optional caption and a layout. Headless: the record's values as the reader view
 * needs them, the layout classes, and which image format the bytes are. The schema has no defaults,
 * so this module applies them (full width, centre), decisions b2b5c488 (D4) and 72bcd83e (D5).
 */
import type { SrsRecord } from "$lib/srs-client.js";

export type ImageSize = "full-width" | "original";
export type ImageAlign = "left" | "centre" | "right";
export interface ImageSpec {
  alt: string;
  caption: string;
  size: ImageSize;
  /** Where an original-size image sits; unused at full width. */
  align: ImageAlign;
  /** The attached source document (the core's `attaches` resolution); null when none. */
  documentId: string | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function toImage(r: SrsRecord, documentId: string | null): ImageSpec {
  const v = r.fieldValues;
  const align = str(v.image_align);
  return {
    alt: str(v.alt_text),
    caption: str(v.caption),
    size: v.image_size === "original" ? "original" : "full-width",
    align: align === "left" || align === "right" ? align : "centre",
    documentId,
  };
}

/**
 * The layout rule for one image option (srs-web#811): the figure's CSS classes
 * (`image-paragraph.css`) and the equivalent inline styles used when there is no stylesheet to rely
 * on (Copy as HTML, srs-web#766). One entry per option, read by both `imageClasses` and
 * `imageFigureHtml` below, so the rule is authored once instead of twice.
 */
interface ImageLayoutRule {
  /** The figure's classes: always a block (text never wraps); alignment only at original size. */
  className: string;
  /** Inline `width` for the `<img>`; "" keeps the image's own size (original size). */
  imgWidth: string;
  /** Inline `margin` for the `<img>`, placing it within the column the way the CSS class does. */
  imgMargin: string;
  /** Inline `text-align` for the `<figcaption>`, matching `image-paragraph.css`'s per-alignment rule. */
  captionAlign: string;
}

/** The layout key a size/align pair maps to: full width ignores alignment (decision b2b5c488, D4). */
function layoutKeyFor(size: ImageSize, align: ImageAlign): "full" | ImageAlign {
  return size === "original" ? align : "full";
}

const IMAGE_LAYOUTS: Record<"full" | ImageAlign, ImageLayoutRule> = {
  full: {
    className: "image-paragraph image-paragraph--full",
    imgWidth: "width:100%;",
    imgMargin: "0 auto",
    captionAlign: "center",
  },
  left: {
    className: "image-paragraph image-paragraph--original image-paragraph--left",
    imgWidth: "",
    imgMargin: "0 auto 0 0",
    captionAlign: "left",
  },
  centre: {
    className: "image-paragraph image-paragraph--original image-paragraph--centre",
    imgWidth: "",
    imgMargin: "0 auto",
    captionAlign: "center",
  },
  right: {
    className: "image-paragraph image-paragraph--original image-paragraph--right",
    imgWidth: "",
    imgMargin: "0 0 0 auto",
    captionAlign: "right",
  },
};

/** The figure's classes: always a block (text never wraps); alignment only at original size. */
export function imageClasses(size: ImageSize, align: ImageAlign): string {
  return IMAGE_LAYOUTS[layoutKeyFor(size, align)].className;
}

/**
 * The image format of `bytes`, read from the bytes themselves (the sidecar's contentType is not in
 * the bindings' read): PNG, JPEG, WebP or SVG (decision ca352740, D3), else null, and the reader
 * shows the placeholder. The browser shows SVG only through `<img>` (decision 866167c1, D6).
 */
export function imageMime(bytes: Uint8Array): string | null {
  const at = (i: number, ...b: number[]) => b.every((x, k) => bytes[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  return head.startsWith("<") && head.includes("<svg") ? "image/svg+xml" : null;
}

/** What the writer sets on an image paragraph (decisions b2b5c488, 72bcd83e). */
export interface ImageFields {
  alt: string;
  caption: string;
  size: ImageSize;
  align: ImageAlign;
}

/** The record's field values for `f`: alt text trimmed, an empty caption left out, align only at original size. */
export function imageFieldValues(f: ImageFields): Record<string, string | undefined> {
  const caption = f.caption.trim();
  return {
    alt_text: f.alt.trim(),
    caption: caption || undefined,
    image_size: f.size,
    image_align: f.size === "original" ? f.align : undefined,
  };
}

/**
 * The core's refusal of an image, in plain words, read from the error's `code` (ADR-048 rule 6,
 * never the message): `svg-unsafe` (decision 866167c1) and `invalid-input` (the repository's
 * attachment policy, or a name already taken).
 */
export function imageRefusal(e: unknown): string {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  if (code === "svg-unsafe")
    return "This SVG contains a script or a link to another file, so it can't be used. Export it again as a plain SVG.";
  if (code === "invalid-input")
    return "This image breaks the document's rules for attached files (its type or size), so it can't be used.";
  // An error of this editor's own (no code) is already in plain words.
  if (code === undefined && e instanceof Error) return e.message;
  return "The image could not be saved.";
}

/** Text made safe to put in HTML. */
export const escapeHtml = (t: string): string =>
  t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * An image paragraph as standalone HTML for Copy as HTML (srs-web#766): the reading view's layout
 * (D4) as inline styles, since the pasted HTML carries no stylesheet. The image is an `<img>` with a
 * data URL (D6: never inline SVG); bytes that are missing or not an image give the alt text instead.
 */
export function imageFigureHtml(image: ImageSpec, bytes: Uint8Array | null): string {
  const alt = escapeHtml(image.alt);
  const mime = bytes ? imageMime(bytes) : null;
  const layout = IMAGE_LAYOUTS[layoutKeyFor(image.size, image.align)];
  let bin = "";
  if (bytes && mime) for (const b of bytes) bin += String.fromCharCode(b);
  const img =
    bytes && mime
      ? `<img src="data:${mime};base64,${btoa(bin)}" alt="${alt}" style="display:block;${layout.imgWidth}max-width:100%;height:auto;margin:${layout.imgMargin}">`
      : `<p><em>${alt}</em></p>`;
  const caption = image.caption
    ? `<figcaption style="text-align:${layout.captionAlign}">${escapeHtml(image.caption)}</figcaption>`
    : "";
  return `<figure style="margin:0 0 1em">${img}${caption}</figure>`;
}
