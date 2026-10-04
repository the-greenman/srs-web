import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openInspectorDrawer } from "./helpers.js";

/**
 * essay-touch.spec.ts — srs-web#382: the per-paragraph ⋯ action menu and the end-of-page
 * "Add paragraph" button, driven by taps at a phone viewport (same fixture as essay-editor.spec.ts).
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const { defaultBrowserType: _browser, ...phone } = devices["iPhone 13"];
test.use(phone);

async function open(page: Page) {
  // The editor picker is not reachable at phone width yet (srs-web#381): pick at desktop width, then shrink.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").tap();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  await page.setViewportSize(phone.viewport);
  // The rail becomes a drawer on the media-query change: wait for its trigger so helpers do not race it.
  await expect(page.getByTestId("inspector-trigger")).toBeVisible();
}

const bodies = (page: Page) => page.locator(".essay-shell__page :is(.block__render, .block__body)");
const menuOf = (page: Page, n: number) => page.locator(".essay-shell__page").getByTestId("paragraph-menu").nth(n);
const depths = (page: Page) =>
  page
    .locator(".essay-shell__page .block-stack__item")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.getPropertyValue("--depth")));

test("touch: ⋯ is the only gutter tool, at least 44px, with 44px rows", async ({ page }) => {
  await open(page);
  await expect(page.locator(".essay-shell__page .block__strip").first()).toBeHidden();
  for (const t of [menuOf(page, 0), page.locator(".block__handle").first(), page.getByTestId("add-paragraph")]) {
    const box = (await t.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await menuOf(page, 0).tap();
  await expect(menuOf(page, 0)).toHaveAttribute("aria-expanded", "true");
  const row = (await page.getByTestId("paragraph-menu-down").boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(menuOf(page, 0)).toBeFocused();
});

test("touch: add via menu and via the end button", async ({ page }) => {
  await open(page);
  await menuOf(page, 0).tap();
  await page.getByTestId("paragraph-menu-add").tap();
  await expect(bodies(page)).toHaveCount(4);
  await expect(page.locator(".essay-shell__page .block__body")).toBeFocused();
  await page.getByTestId("add-paragraph").tap();
  await expect(bodies(page)).toHaveCount(5);
  await expect(bodies(page).last()).toBeFocused();
});

test("touch: move down, then indent and outdent, change the outline", async ({ page }) => {
  await open(page);
  await expect(bodies(page)).toHaveText(["First paragraph.", "Second paragraph.", "Third paragraph."]);
  await menuOf(page, 0).tap();
  await page.getByTestId("paragraph-menu-down").tap();
  await expect(bodies(page)).toHaveText(["Second paragraph.", "First paragraph.", "Third paragraph."]);

  const before = await depths(page);
  await menuOf(page, 2).tap();
  await page.getByTestId("paragraph-menu-indent").tap();
  await expect.poll(() => depths(page)).not.toEqual(before);
  expect((await depths(page))[2]).toBe(String(Number(before[2]) + 1));
  await menuOf(page, 2).tap();
  await page.getByTestId("paragraph-menu-outdent").tap();
  await expect.poll(() => depths(page)).toEqual(before);
});

test("touch: Layers rows reorder through their own ⋯", async ({ page }) => {
  await open(page);
  await openInspectorDrawer(page); // the Layers panel is in the inspector drawer at phone width
  // The drawer mounts the panels fresh at phone width, so they start collapsed (collapseWhen): expand Layers.
  const layers = page.locator("details.panel", { hasText: "Layers" }).first();
  await expect(layers).toBeVisible();
  if (!(await layers.evaluate((el: HTMLDetailsElement) => el.open))) await layers.locator("summary").first().tap();
  await expect(layers).toHaveAttribute("open", "");
  await page.locator(".layers").getByTestId("layer-menu").first().tap();
  await page.getByTestId("layer-menu-down").tap();
  await expect(bodies(page)).toHaveText(["Second paragraph.", "First paragraph.", "Third paragraph."]);
});
