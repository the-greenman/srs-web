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

/** The figure's classes: always a block (text never wraps); alignment only at original size. */
export function imageClasses(size: ImageSize, align: ImageAlign): string {
  return size === "original"
    ? `image-paragraph image-paragraph--original image-paragraph--${align}`
    : "image-paragraph image-paragraph--full";
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
