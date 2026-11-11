// @vitest-environment happy-dom
/**
 * Essay image paragraph (srs-web#764): layout classes for every size and alignment (decision b2b5c488),
 * the defaults the schema does not carry, format sniffing, and the component: alt, caption, placeholder,
 * and only ever an <img> (decision 866167c1).
 */
import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import ImageParagraph from "../src/lib/components/ImageParagraph.svelte";
import { imageClasses, imageMime, toImage } from "../src/lib/essay/image-paragraph.js";

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SVG = enc('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');

describe("imageClasses", () => {
  it.each([
    ["full-width", "left", "image-paragraph image-paragraph--full"],
    ["full-width", "centre", "image-paragraph image-paragraph--full"],
    ["full-width", "right", "image-paragraph image-paragraph--full"],
    ["original", "left", "image-paragraph image-paragraph--original image-paragraph--left"],
    ["original", "centre", "image-paragraph image-paragraph--original image-paragraph--centre"],
    ["original", "right", "image-paragraph image-paragraph--original image-paragraph--right"],
  ] as const)("%s / %s", (size, align, classes) => {
    expect(imageClasses(size, align)).toBe(classes);
  });
});

describe("toImage", () => {
  const rec = (fieldValues: Record<string, unknown>) =>
    ({ instanceId: "i", typeId: "t", typeVersion: 1, fieldValues }) as never;
  it("defaults to full width, centred, when the record sets no layout", () => {
    expect(toImage(rec({ alt_text: "A" }), null)).toEqual({
      alt: "A",
      caption: "",
      size: "full-width",
      align: "centre",
      documentId: null,
    });
  });
  it("reads the layout, caption and attachment", () => {
    const r = rec({ alt_text: "A", caption: "C", image_size: "original", image_align: "right" });
    expect(toImage(r, "d1")).toEqual({ alt: "A", caption: "C", size: "original", align: "right", documentId: "d1" });
  });
});

describe("imageMime", () => {
  it("knows PNG, JPEG, WebP and SVG from their bytes, and nothing else", () => {
    expect(imageMime(PNG)).toBe("image/png");
    expect(imageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageMime(enc("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(imageMime(SVG)).toBe("image/svg+xml");
    expect(imageMime(enc('<?xml version="1.0"?>\n<svg/>'))).toBe("image/svg+xml");
    expect(imageMime(enc("<html><body></body></html>"))).toBeNull();
    expect(imageMime(enc("plain text"))).toBeNull();
  });
});

describe("ImageParagraph", () => {
  it("shows the image in a figure with its alt text and caption, as an <img> only", () => {
    const { container } = render(ImageParagraph, { alt: "A circle", caption: "The caption", bytes: SVG });
    const img = container.querySelector("figure > img");
    expect(img?.getAttribute("alt")).toBe("A circle");
    expect(img?.getAttribute("src")).toMatch(/^blob:/);
    expect(container.querySelector("figcaption")?.textContent).toBe("The caption");
    expect(container.querySelector("svg, object, iframe, embed")).toBeNull();
    expect(container.querySelector("figure")?.className).toBe("image-paragraph image-paragraph--full");
  });
  it("lays out at original size and alignment", () => {
    const { container } = render(ImageParagraph, { alt: "A", size: "original", align: "left", bytes: PNG });
    expect(container.querySelector("figure")?.className).toBe(
      "image-paragraph image-paragraph--original image-paragraph--left"
    );
  });
  it("shows a placeholder with the alt text when the attachment is missing or not an image", () => {
    for (const bytes of [null, enc("not an image")]) {
      const { container, unmount } = render(ImageParagraph, { alt: "Never attached", bytes });
      expect(container.querySelector("img")).toBeNull();
      const ph = container.querySelector('[data-part="placeholder"]');
      expect(ph?.textContent).toBe("Never attached");
      expect(ph?.getAttribute("role")).toBe("img");
      expect(ph?.getAttribute("aria-label")).toBe("Never attached");
      unmount();
    }
  });
  it("has no caption element without a caption", () => {
    const { container } = render(ImageParagraph, { alt: "A", bytes: PNG });
    expect(container.querySelector("figcaption")).toBeNull();
  });
});
