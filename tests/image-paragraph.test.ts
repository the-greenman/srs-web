// @vitest-environment happy-dom
/**
 * Essay image paragraph (srs-web#764): layout classes for every size and alignment (decision b2b5c488),
 * the defaults the schema does not carry, format sniffing, and the component: alt, caption, placeholder,
 * and only ever an <img> (decision 866167c1).
 */
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import ImageParagraph from "../src/lib/components/ImageParagraph.svelte";
import ImageParagraphEditor from "../src/lib/components/ImageParagraphEditor.svelte";
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

describe("editing (srs-web#765)", () => {
  it("is off unless this browser's flag is set", async () => {
    const { imageParagraphsOn } = await import("../src/lib/essay/image-paragraph.js");
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
    expect(imageParagraphsOn()).toBe(false);
    store.set("srs-web.flag.essay-images", "1");
    expect(imageParagraphsOn()).toBe(true);
    vi.stubGlobal("localStorage", undefined); // storage blocked: off
    expect(imageParagraphsOn()).toBe(false);
    vi.unstubAllGlobals();
  });
  it("writes alt text trimmed, no empty caption, and alignment only at original size", async () => {
    const { imageFieldValues } = await import("../src/lib/essay/image-paragraph.js");
    expect(
      imageFieldValues({ alt: " A ", caption: "  ", size: "full-width", align: "left" })
    ).toEqual({
      alt_text: "A",
      caption: undefined,
      image_size: "full-width",
      image_align: undefined,
    });
    expect(imageFieldValues({ alt: "A", caption: "C", size: "original", align: "right" })).toEqual({
      alt_text: "A",
      caption: "C",
      image_size: "original",
      image_align: "right",
    });
  });
  it("says a refusal in plain words, by the error's code and never its message", async () => {
    const { imageRefusal } = await import("../src/lib/essay/image-paragraph.js");
    const err = (code: string) => Object.assign(new Error("svg-unsafe raw text"), { code });
    expect(imageRefusal(err("svg-unsafe"))).toMatch(
      /^This SVG contains a script or a link to another file/
    );
    expect(imageRefusal(err("invalid-input"))).toMatch(/its type or size/);
    expect(imageRefusal(err("some-other-code"))).toBe("The image could not be saved.");
    expect(imageRefusal(new Error("Upgrade it first"))).toBe("Upgrade it first");
  });
});

describe("ImageParagraphEditor (srs-web#765)", () => {
  const png = () => new File([PNG], "band.png", { type: "image/png" });
  const choose = (container: HTMLElement, file: File) =>
    fireEvent.drop(container.querySelector('[data-testid="image-drop"]')!, {
      dataTransfer: { types: ["Files"], files: [file] },
    });
  it("adds nothing until there is an image and alt text, then saves both", async () => {
    const onsave = vi.fn(async () => null);
    const { container, getByTestId } = render(ImageParagraphEditor, {
      id: "n",
      onsave,
      oncancel: vi.fn(),
    });
    const save = getByTestId("image-save") as HTMLButtonElement;
    expect(save.textContent).toBe("Add image");
    expect(save.disabled).toBe(true);
    await fireEvent.input(getByTestId("image-alt"), { target: { value: "A band" } });
    expect(save.disabled).toBe(true); // no image yet
    await choose(container, png());
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(getByTestId("image-drop").getAttribute("aria-label")).toBe(
      "Image: band.png (choose another)"
    );
    expect(container.querySelector("figure img")?.getAttribute("alt")).toBe("A band"); // the preview
    await fireEvent.submit(container.querySelector("form")!);
    expect(onsave).toHaveBeenCalledWith(
      { alt: "A band", caption: "", size: "full-width", align: "centre" },
      expect.objectContaining({ name: "band.png", type: "image/png" })
    );
  });
  it("refuses a file that is not an image in plain words, and shows the core's refusal", async () => {
    const onsave = vi.fn(
      async () => "This SVG contains a script or a link to another file, so it can't be used."
    );
    const { container, getByTestId, findByText } = render(ImageParagraphEditor, {
      id: "r",
      onsave,
      oncancel: vi.fn(),
    });
    await choose(container, new File(["x"], "notes.txt", { type: "text/plain" }));
    await findByText(/notes\.txt: not a PNG, JPEG, WebP or SVG image \(text\/plain\)/);
    await choose(container, png());
    await fireEvent.input(getByTestId("image-alt"), { target: { value: "A" } });
    await fireEvent.submit(container.querySelector("form")!);
    expect(
      (await findByText(/This SVG contains a script/)).closest('[data-testid="image-refusal"]')
    ).not.toBeNull();
  });
  it("edits without a new file; alignment only at original size; Escape cancels", async () => {
    const onsave = vi.fn(async () => null);
    const oncancel = vi.fn();
    const full = { alt: "A", caption: "C", size: "full-width" as const, align: "centre" as const };
    const first = render(ImageParagraphEditor, {
      id: "f",
      initial: full,
      bytes: PNG,
      onsave,
      oncancel,
    });
    expect((first.getByTestId("image-align") as HTMLSelectElement).disabled).toBe(true);
    first.unmount();
    // (a select's change is not driven here: happy-dom has no :checked; Playwright covers it)
    const initial = { ...full, size: "original" as const, align: "left" as const };
    const { container, getByTestId } = render(ImageParagraphEditor, {
      id: "e",
      initial,
      bytes: PNG,
      onsave,
      oncancel,
    });
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect((getByTestId("image-align") as HTMLSelectElement).disabled).toBe(false);
    await fireEvent.input(getByTestId("image-alt"), { target: { value: "" } });
    expect((getByTestId("image-save") as HTMLButtonElement).disabled).toBe(true); // alt text is required
    await fireEvent.input(getByTestId("image-alt"), { target: { value: "B" } });
    await fireEvent.submit(container.querySelector("form")!);
    expect(onsave).toHaveBeenCalledWith(
      { alt: "B", caption: "C", size: "original", align: "left" },
      null
    );
    await fireEvent.keyDown(getByTestId("image-caption"), { key: "Escape" });
    expect(oncancel).toHaveBeenCalled();
  });
});
