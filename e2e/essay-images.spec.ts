import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-images.spec.ts — srs-web#764: essay image paragraphs in the reading view (decisions b2b5c488,
 * 72bcd83e, 866167c1). Fixture: essay-images.srs (build-essay-images-fixture.sh): a text paragraph, then
 * PNG and SVG image paragraphs at full width and original size (left, centre, right), one HOSTILE SVG
 * written by hand past the core's attach check, and one with no attachment.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay-images.srs");
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const figures = (page: Page) => page.getByTestId("essay-reader").locator("figure");
const decoded = (page: Page, scope: string) =>
  expect
    .poll(() =>
      page
        .locator(`${scope} figure img`)
        .evaluateAll((imgs) =>
          imgs.length > 0 && imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0)
        )
    )
    .toBe(true);

/** The reading view: the fixture as a read-only link (`?open=…&editor=essay`, srs-web#699). */
async function open(page: Page) {
  const url = "https://semanticops.test/fixtures/essay-images.srs";
  await page.route(url, (route) =>
    route.fulfill({
      body: readFileSync(ESSAY),
      headers: { "access-control-allow-origin": "*", "content-type": "application/zip" },
    })
  );
  await page.goto(`/?open=${encodeURIComponent(url)}&editor=essay`);
  await expect(page.getByTestId("essay-reader")).toBeVisible({ timeout: 20000 });
  await expect(figures(page)).toHaveCount(7);
  await decoded(page, '[data-testid="essay-reader"]'); // a broken image would have no natural size
}

/** The image's box inside its figure, in CSS pixels. */
const boxes = (page: Page, n: number) =>
  figures(page)
    .nth(n)
    .evaluate((f) => {
      const r = (e: Element) => e.getBoundingClientRect();
      const img = f.querySelector("img") as HTMLImageElement;
      return { fig: r(f).toJSON(), img: r(img).toJSON(), natural: img.naturalWidth };
    });

for (const [name, viewport] of [
  ["desktop", DESKTOP],
  ["phone", PHONE],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test("image paragraphs render at full width and original size, as <img> only", async ({ page }) => {
      await open(page);
      const reader = page.getByTestId("essay-reader");
      await expect(reader.locator(".essay-reader__paragraph")).toHaveText("A paragraph of text before the pictures.");
      await expect(figures(page).nth(0).locator("img")).toHaveAttribute("alt", "An orange band across a blue field");
      await expect(figures(page).nth(0).locator("figcaption")).toHaveText("The band at full width");

      // full width fills the column (PNG and SVG)
      for (const n of [0, 4]) {
        const b = await boxes(page, n);
        expect(Math.abs(b.img.width - b.fig.width)).toBeLessThanOrEqual(1);
      }
      // original size: its own width, never wider than the column; left, centre, right
      for (const [n, align] of [
        [1, "left"],
        [2, "centre"],
        [3, "right"],
      ] as const) {
        const b = await boxes(page, n);
        expect(b.img.width).toBeLessThanOrEqual(b.fig.width + 0.5);
        expect(Math.abs(b.img.width - Math.min(b.natural, b.fig.width))).toBeLessThanOrEqual(1);
        if (align === "left") expect(Math.abs(b.img.left - b.fig.left)).toBeLessThanOrEqual(1);
        if (align === "right") expect(Math.abs(b.img.right - b.fig.right)).toBeLessThanOrEqual(1);
        if (align === "centre")
          expect(Math.abs(b.img.left - b.fig.left - (b.fig.right - b.img.right))).toBeLessThanOrEqual(1);
      }
      // the missing attachment is a placeholder with the alt text, never a broken image
      const missing = figures(page).nth(6);
      await expect(missing.locator("img")).toHaveCount(0);
      await expect(missing.getByRole("img", { name: "A picture that was never attached" })).toBeVisible();
      // the page never wraps text beside a figure: each figure spans the column
      const widths = await figures(page).evaluateAll((fs) => fs.map((f) => f.getBoundingClientRect().width));
      expect(new Set(widths.map(Math.round)).size).toBe(1);
      await expect(reader.locator("svg, object, iframe, embed")).toHaveCount(0);
    });

    test("visual snapshots of the layouts", async ({ page }) => {
      await open(page);
      // no captions in these, so the pixels do not depend on fonts
      for (const [n, label] of [
        [1, "png-original-left"],
        [3, "svg-original-right"],
        [4, "svg-full-width"],
      ] as const)
        await expect(figures(page).nth(n)).toHaveScreenshot(`${label}-${name}.png`, { maxDiffPixelRatio: 0.01 });
    });
  });
}

test("a hostile SVG never runs: no dialog, no script output, no request, and only an <img>", async ({ page }) => {
  const dialogs: string[] = [];
  const logs: string[] = [];
  const requests: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  page.on("console", (m) => logs.push(m.text()));
  page.on("request", (r) => requests.push(r.url()));
  await open(page);
  const hostile = figures(page).nth(5);
  await expect(hostile.locator("figcaption")).toHaveText("This SVG carries a script");
  await expect(hostile.locator("img")).toHaveAttribute("src", /^blob:/);
  // the figure holds an <img> and its caption, nothing else
  expect(await hostile.evaluate((f) => [...f.children].map((c) => c.tagName))).toEqual(["IMG", "FIGCAPTION"]);
  await page.waitForTimeout(500); // give an onload handler every chance to fire
  expect(dialogs).toEqual([]);
  expect(logs.filter((l) => l.includes("HOSTILE"))).toEqual([]);
  expect(requests.filter((u) => u.includes("example.com"))).toEqual([]);
  // nowhere in the document is there inline SVG markup from the essay, or an embedding element
  await expect(page.getByTestId("essay-reader").locator("svg, object, iframe, embed")).toHaveCount(0);
});

test("the writer's page shows the image paragraphs too, as figures, never as text blocks", async ({ page }) => {
  page.on("dialog", (d) => {
    throw new Error(`dialog: ${d.message()}`);
  });
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  const items = page.locator(".essay-shell__page .block-stack__item");
  await expect(items).toHaveCount(8);
  await expect(items.locator("figure")).toHaveCount(7);
  await expect(items.locator("figure").locator("[contenteditable], textarea, input")).toHaveCount(0);
  await decoded(page, ".essay-shell__page");
  await expect(page.locator(".essay-shell__page figure svg, .essay-shell__page object, .essay-shell__page iframe")).toHaveCount(0);
});
