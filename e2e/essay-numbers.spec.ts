import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/** Paragraph numbers (srs-web#829): the same on the page and in Layers, following the outline. */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

test("numbers match in page and Layers, renumber on indent and move, survive hide and zoom", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  const onPage = page.locator(".essay-shell__page").getByTestId("paragraph-number");
  const inLayers = page.locator(".layers__number");
  const expectNumbers = async (ns: string[]) => {
    await expect(onPage).toHaveText(ns.map((n) => `Paragraph ${n}`));
    await expect(inLayers).toHaveText(ns);
  };
  const third = page.locator(".essay-shell__page .block", { hasText: "Third paragraph." });
  const handle = third.locator(".block__handle");

  await expectNumbers(["1", "2", "3"]);
  await handle.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expectNumbers(["1", "2", "2.1"]);

  await page.locator(".essay-shell__page .block").first().hover();
  await page.locator(".essay-shell__page .block__strip .eye").first().click();
  await expect(page.locator(".essay-shell__page .block__closed").first()).toBeVisible();
  await expectNumbers(["1", "2", "2.1"]);

  await third.hover();
  await third.getByRole("button", { name: /zoom/i }).first().click();
  await expect(onPage).toHaveText(["Paragraph 2.1"]);
  await page.getByTestId("zoom-exit").click();

  await handle.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await expectNumbers(["1", "2", "3"]);
  await handle.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(third.getByTestId("paragraph-number")).toHaveText("Paragraph 2");
});
