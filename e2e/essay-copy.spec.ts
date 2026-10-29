import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

/** essay-copy.spec.ts: "Copy as markdown" / "Copy as HTML" put the visible essay on the clipboard. */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

test("Copy as markdown and Copy as HTML write the essay to the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  await openMenu(page, "Document");
  await page.getByTestId("copy-markdown").click();
  const md = await page.evaluate(() => navigator.clipboard.readText());
  expect(md).toMatch(/^# On small democracy/m);
  expect(md).toContain("First paragraph.");

  await openMenu(page, "Document");
  await page.getByTestId("copy-html").click();
  // The write is async: poll until the html part lands.
  await expect.poll(() => page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return item.types.includes("text/html") ? await (await item.getType("text/html")).text() : "";
  })).toContain("On small democracy");
});
