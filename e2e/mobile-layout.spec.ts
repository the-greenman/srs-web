import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openInspectorDrawer } from "./helpers.js";

/** srs-web#383: phone layout of the essay editor (text width, header overflow, inline margin, thread/zoom/help). */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
test.use(phone);

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page
    .getByTestId("package-editor-mobile-essay")
    .or(page.getByTestId("package-editor-essay"))
    .locator("visible=true")
    .first()
    .tap();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

const widths = [
  { name: "390", viewport: { width: 390, height: 844 } },
  { name: "360", viewport: { width: 360, height: 740 } },
];

for (const { name, viewport } of widths) {
  test.describe(`${name}px portrait`, () => {
    test.use({ viewport });

    test("text column is at least 85% of the viewport; panels start collapsed", async ({
      page,
    }) => {
      await open(page);
      const box = (await page.locator(".essay-shell__page .block__render").first().boundingBox())!;
      expect(box.width / viewport.width).toBeGreaterThanOrEqual(0.85);
      // The panels live in the closed inspector drawer: open it, then they start collapsed.
      await openInspectorDrawer(page);
      for (const title of ["Layers", "Draft"]) {
        await expect(page.locator("details.panel", { hasText: title }).first()).not.toHaveAttribute(
          "open",
          ""
        );
      }
    });

    test("header fits one row; the overflow menu holds the actions", async ({ page }) => {
      await open(page);
      expect((await page.getByTestId("toolbar").boundingBox())!.height).toBeLessThan(72);
      await expect(page.getByTestId("comment-mode")).toBeHidden();
      await expect(page.getByTestId("inspector-trigger")).toBeVisible(); // the rail's trigger sits in the bar
      await page.getByTestId("header-menu").tap();
      for (const id of [
        "new-document",
        "copy-document",
        "toolbar-help",
        "margin-variant",
        "comment-mode",
        "toolbar-export",
        "toolbar-other",
      ]) {
        await expect(page.getByTestId(id)).toBeVisible();
      }
      await page.getByTestId("comment-mode").tap();
      await expect(page.getByTestId("comment-thread").first()).toBeVisible();
    });

    test("margin badge sits inline in the title row", async ({ page }) => {
      await open(page);
      const block = page.locator(".essay-shell__page .block").first();
      const b = (await block.boundingBox())!;
      const badge = (await block.locator(".comment-badge").boundingBox())!;
      const body = (await block.locator(".block__render").boundingBox())!;
      expect(badge.y).toBeGreaterThanOrEqual(b.y);
      expect(badge.y + badge.height).toBeLessThanOrEqual(body.y + 1);
      expect(body.width).toBeGreaterThan(b.width - 2);
    });

    test("thread stacks name, reply and button; zoom bar is one row; help closes", async ({
      page,
    }) => {
      await open(page);
      await page.getByTestId("header-menu").tap();
      await page.getByTestId("comment-mode").tap();
      const reply = page.getByRole("textbox", { name: "Reply" }).first();
      const send = page.getByRole("button", { name: "Comment", exact: true }).first();
      const r = (await reply.boundingBox())!;
      const s = (await send.boundingBox())!;
      expect(s.y).toBeGreaterThanOrEqual(r.y + r.height - 1);
      expect(s.width).toBeGreaterThan(r.width * 0.9);

      await page.locator(".essay-shell__page").getByTestId("paragraph-menu").first().tap();
      await page.getByTestId("paragraph-menu-zoom").tap();
      const [a, c] = await Promise.all([
        page.getByTestId("zoom-exit").boundingBox(),
        page.getByTestId("zoom-copy-link").boundingBox(),
      ]);
      expect(Math.abs(a!.y - c!.y)).toBeLessThan(2);
      expect(a!.height).toBeLessThan(60);

      await page.getByTestId("header-menu").tap();
      await page.getByTestId("toolbar-help").tap();
      const pop = page.getByRole("region", { name: "Markdown cheat-sheet" });
      await expect(pop).toBeVisible();
      await expect(pop).toContainText("long-press");
      await page.getByRole("button", { name: "Close Markdown help" }).tap();
      await expect(pop).toBeHidden();
    });
  });
}

test.describe("landscape", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('"Add title" sits inside the block box', async ({ page }) => {
    await open(page);
    const block = page
      .locator(".essay-shell__page .block", { has: page.locator(".block__head.is-collapsed") })
      .first();
    await block.locator(".block__render").tap();
    const label = block.getByRole("button", { name: /Add title|Paragraph title/ });
    await expect(label).toBeVisible();
    const b = (await block.boundingBox())!;
    const l = (await label.boundingBox())!;
    expect(l.y).toBeGreaterThanOrEqual(b.y);
    expect(l.y + l.height).toBeLessThanOrEqual(b.y + b.height);
  });
});
