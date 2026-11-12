import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openMenu } from "./helpers";

/**
 * essay-image-export.spec.ts — srs-web#766: Copy as HTML carries each image paragraph as the reading
 * view shows it: the image (an <img>), its alt text, its caption and its layout (decision b2b5c488).
 * Fixture: essay-images.srs (srs-web#764), image paragraphs at full width and original size, left,
 * centre and right, one hostile SVG and one with no file.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay-images.srs");

/** Each figure with an image: its alt, caption and where the image sits in the figure. */
const layouts = (page: Page, scope: string) =>
  page.locator(`${scope} figure`).evaluateAll((figs) =>
    figs.flatMap((f) => {
      const img = f.querySelector("img");
      if (!img) return [];
      const a = f.getBoundingClientRect();
      const b = img.getBoundingClientRect();
      const near = (x: number, y: number) => Math.abs(x - y) < 2;
      const pos = near(a.width, b.width)
        ? "full"
        : near(a.left, b.left)
          ? "left"
          : near(a.right, b.right)
            ? "right"
            : "centre";
      return [{ alt: img.alt, caption: f.querySelector("figcaption")?.textContent?.trim() ?? "", pos }];
    })
  );

test("Copy as HTML puts each image on the clipboard with its alt text, caption and layout, as the reading view shows it", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // The reading view: the fixture as a read-only link (srs-web#699).
  const reader = await context.newPage();
  const url = "https://semanticops.test/fixtures/essay-images.srs";
  await reader.route(url, (route) =>
    route.fulfill({
      body: readFileSync(ESSAY),
      headers: { "access-control-allow-origin": "*", "content-type": "application/zip" },
    })
  );
  await reader.goto(`/?open=${encodeURIComponent(url)}&editor=essay`);
  await expect(reader.getByTestId("essay-reader").locator("figure")).toHaveCount(7, { timeout: 20000 });
  const width = await reader
    .getByTestId("essay-reader")
    .locator("figure")
    .first()
    .evaluate((f) => f.getBoundingClientRect().width);
  await expect
    .poll(() =>
      reader
        .locator('[data-testid="essay-reader"] figure img')
        .evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0))
    )
    .toBe(true);
  const read = await layouts(reader, '[data-testid="essay-reader"]');
  expect(read.map((r) => r.pos)).toEqual(expect.arrayContaining(["full", "left", "centre", "right"]));

  // The editor: Copy as HTML.
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.locator(".essay-shell__page figure")).toHaveCount(7);
  await openMenu(page, "Document");
  await page.getByTestId("copy-html").click();
  let html = "";
  await expect
    .poll(async () => {
      html = await page.evaluate(async () => {
        const [item] = await navigator.clipboard.read();
        return item.types.includes("text/html") ? await (await item.getType("text/html")).text() : "";
      });
      return html;
    })
    .toContain("<figure");
  expect(html).not.toContain("<svg"); // images only through <img> (D6)
  expect(html).toContain("<em>A picture that was never attached</em>"); // no file: its alt text

  // The pasted HTML, laid out at the reading view's width, places every image the same way.
  const pasted = await context.newPage();
  await pasted.setContent(`<div id="paste" style="width:${width}px">${html}</div>`);
  await expect
    .poll(() =>
      pasted
        .locator("#paste img")
        .evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0))
    )
    .toBe(true);
  expect(await layouts(pasted, "#paste")).toEqual(read);
});
