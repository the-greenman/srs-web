import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { VISUAL_DEFAULT } from "../playwright.config";
import { closeMenus, openMenu } from "./helpers";

/** srs-web#834: a paragraph looks the same while edited visually as it does at rest. */
test.use({ storageState: VISUAL_DEFAULT });
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
// No soft line break: the editor shows one as a line, the rendered text as a space.
const MARKDOWN = [
  "# Heading one",
  "## Heading two",
  "### Heading three",
  "#### Heading four",
  "Office text flows with **bold**, *italic*, ~~struck~~, `code` and a [link](https://example.com), long enough to wrap onto a second line of the paragraph.",
  "- one\n- two\n  - nested",
  "1. first\n2. second",
  "> A quote\n>\n> of two paragraphs",
  "```\ncode block " + "long ".repeat(60).trim() + "\n```",
  "##### Heading five",
  "###### Heading six",
  "Last words.",
].join("\n\n");

/** Every element's box and type. Tags differ harmlessly (li > p, s for del), so leaves are matched by their text. */
const look = (root: Locator) =>
  root.evaluate((el) => {
    const top = el.getBoundingClientRect().top;
    const out: unknown[] = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const box = r.getBoundingClientRect();
      const s = getComputedStyle(n.parentElement as Element);
      out.push({
        text: n.textContent.trim().replace(/\s+/g, " ").slice(0, 30),
        x: Math.round(box.left),
        y: Math.round(box.top - top),
        size: s.fontSize,
        weight: s.fontWeight,
        family: s.fontFamily,
        line: s.lineHeight,
        spacing: s.letterSpacing,
        transform: s.textTransform,
        color: s.color,
        ligatures: s.fontVariantLigatures + s.fontFeatureSettings,
      });
    }
    const { width, height } = el.getBoundingClientRect();
    out.push({ width: Math.round(width), height: Math.round(height) });
    return out;
  });

for (const width of [1280, 390]) {
  test(`a paragraph and the purpose look the same edited as at rest, at ${width}px`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
    await page.getByTestId("package-editor-essay").click();
    await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
    await openMenu(page, "View");
    await page.getByTestId("edit-markdown").click();
    await closeMenus(page);
    for (const [at, base] of [
      [page.locator(".essay-shell__page .block-stack__item").first(), "block"],
      [page.locator(".essay-shell__purpose"), "purpose"],
    ] as const) {
      await at.locator(`.${base}__render`).click();
      await page.keyboard.press("Control+a");
      await page.keyboard.insertText(MARKDOWN);
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      await expect(at.locator(`.${base}__render h1`)).toBeVisible();
    }
    await openMenu(page, "View");
    await page.getByTestId("edit-markdown").click();
    await closeMenus(page);
    await page.setViewportSize({ width, height: 900 });
    for (const [at, base] of [
      [page.locator(".essay-shell__page .block-stack__item").first(), "block"],
      [page.locator(".essay-shell__purpose"), "purpose"],
    ] as const) {
      const rest = await look(at.locator(`.${base}__render`));
      await at.locator(`.${base}__render`).focus();
      await expect(at.locator(".ProseMirror")).toBeFocused();
      expect(await look(at.locator(".ProseMirror"))).toEqual(rest);
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    }
  });
}
