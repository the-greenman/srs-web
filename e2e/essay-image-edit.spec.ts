import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-image-edit.spec.ts — srs-web#765: adding and editing an essay image paragraph, behind its flag
 * (`srs-web.flag.essay-images`, off until srs-web#766). Fixture: essay-images.srs (srs-web#764): a text
 * paragraph, then seven image paragraphs.
 */
const ESSAY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "essay-images.srs"
);
const FLAG = "srs-web.flag.essay-images";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAFUlEQVR42mOQC1gARx96NOCIgXoSADk8KyGfULlCAAAAAElFTkSuQmCC",
  "base64"
);
const HOSTILE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
);

async function open(page: Page, flag: boolean) {
  if (flag) await page.addInitScript((k) => localStorage.setItem(k, "1"), FLAG);
  page.on("dialog", (d) => {
    throw new Error(`dialog: ${d.message()}`);
  });
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.locator(".essay-shell__page .block-stack__item")).toHaveCount(8);
}
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const figures = (page: Page) => page.locator(".essay-shell__page .block-stack__item figure");
const editor = (page: Page) => page.getByTestId("image-editor");

test("flag off: nothing changes; no image action, and image paragraphs stay read-only", async ({
  page,
}) => {
  await open(page, false);
  await items(page).first().getByTestId("paragraph-menu").click();
  await expect(page.getByRole("menuitem", { name: "Add paragraph below" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Add image below" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(figures(page)).toHaveCount(7);
  await expect(items(page).nth(1).locator(".block")).toHaveCount(0);
});

test("adds an image paragraph by mouse, edits it by keyboard, and undo takes the add back", async ({
  page,
}) => {
  await open(page, true);
  await items(page).first().getByTestId("paragraph-menu").click();
  await page.getByRole("menuitem", { name: "Add image below" }).click();
  const ed = editor(page);
  await expect(ed).toBeVisible();
  const add = ed.getByTestId("image-save");
  await expect(add).toBeDisabled();
  await ed
    .locator('input[type="file"]')
    .setInputFiles({ name: "dots.png", mimeType: "image/png", buffer: PNG });
  await expect(ed.getByTestId("image-drop")).toHaveAccessibleName(
    "Image: dots.png (choose another)"
  );
  await expect(add).toBeDisabled(); // alt text is required
  await ed.getByTestId("image-alt").fill("Two dots");
  await ed.getByTestId("image-caption").fill("A small picture");
  await add.click();
  await expect(ed).toHaveCount(0);
  await expect(figures(page)).toHaveCount(8);
  const added = items(page).nth(1);
  await expect(added.locator("figure img")).toHaveAttribute("alt", "Two dots");
  await expect(added.locator("figcaption")).toHaveText("A small picture");
  const slot = added.locator(".image-paragraph-slot");
  await expect(slot).toBeFocused();

  // keyboard: Enter opens the editor; original size, right; Save
  await page.keyboard.press("Enter");
  await expect(editor(page).getByTestId("image-alt")).toBeFocused();
  await expect(editor(page).getByTestId("image-align")).toBeDisabled();
  await editor(page).getByTestId("image-size").selectOption("original");
  await editor(page).getByTestId("image-align").selectOption("right");
  await editor(page).getByTestId("image-alt").press("Enter"); // submits the form
  await expect(editor(page)).toHaveCount(0);
  await expect(added.locator("figure")).toHaveClass(
    /image-paragraph--original image-paragraph--right/
  );
  await expect(slot).toBeFocused();

  // Escape leaves the editor without writing
  await page.keyboard.press("Enter");
  await editor(page).getByTestId("image-alt").fill("");
  await expect(editor(page).getByTestId("image-save")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);
  await expect(added.locator("figure img")).toHaveAttribute("alt", "Two dots");

  // arrows move between paragraphs as one block; Alt+Down moves it
  await slot.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(items(page).nth(2).locator("figure img")).toHaveAttribute("alt", "Two dots");

  // undo (move, edit, add) brings the essay back to seven images
  await page
    .locator(".essay-shell__page h1, .essay-shell__page")
    .first()
    .click({ position: { x: 2, y: 2 } });
  for (let i = 0; i < 3; i++) await page.keyboard.press("ControlOrMeta+z");
  await expect(figures(page)).toHaveCount(7);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(figures(page)).toHaveCount(8);
  await expect(items(page).nth(1).locator("figure img")).toHaveAttribute("alt", "Two dots"); // the image came back
});

test("refusals read in plain words, and nothing is written", async ({ page }) => {
  await open(page, true);
  await items(page).first().getByTestId("paragraph-menu").click();
  await page.getByRole("menuitem", { name: "Add image below" }).click();
  const ed = editor(page);
  await ed
    .locator('input[type="file"]')
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(ed).toContainText("notes.txt: not a PNG, JPEG, WebP or SVG image (text/plain)");
  await ed
    .locator('input[type="file"]')
    .setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: HOSTILE });
  await ed.getByTestId("image-alt").fill("Bad");
  await ed.getByTestId("image-save").click();
  await expect(ed.getByTestId("image-refusal")).toHaveText(
    "This SVG contains a script or a link to another file, so it can't be used. Export it again as a plain SVG."
  );
  await expect(ed).not.toContainText("svg-unsafe");
  await ed.getByTestId("image-cancel").click();
  await expect(figures(page)).toHaveCount(7);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  test("edits an image paragraph from its menu by tapping", async ({ page }) => {
    await open(page, true);
    const second = items(page).nth(1);
    await second.getByTestId("paragraph-menu").tap();
    await page.getByRole("menuitem", { name: "Edit image…" }).tap();
    await editor(page).getByTestId("image-caption").fill("Tapped caption");
    await editor(page).getByTestId("image-save").tap();
    await expect(second.locator("figcaption")).toHaveText("Tapped caption");
  });
});
