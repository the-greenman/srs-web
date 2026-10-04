import { expect, test } from "@playwright/test";

/** styleguide.spec.ts — the hidden live /styleguide route (srs-web#420, ADR-019). */
test.describe("Styleguide", () => {
  test("renders every section without errors, and the theme switcher reskins", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/styleguide");
    // poll: the styleguide is a lazy chunk, so the first count can race the mount
    await expect.poll(() => page.locator("section h2").count()).toBeGreaterThanOrEqual(9);
    await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
    const bg = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-bg"));
    const before = await bg();

    await page.getByLabel("Theme").selectOption("Demo");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "demo");
    expect(await bg()).not.toBe(before);
    expect(errors).toEqual([]);
  });

  test("a trailing slash also renders the styleguide", async ({ page }) => {
    await page.goto("/styleguide/");
    await expect(page.getByRole("heading", { name: "Styleguide", level: 1 })).toBeVisible();
  });

  test("the app root still mounts and does not link to the styleguide", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await expect(page.locator('a[href*="styleguide"]')).toHaveCount(0);
  });

  for (const path of ["/", "/styleguide"]) {
    test(`ink-surface filter is defined exactly once on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await page.locator("filter#ink-surface").count()).toBe(1);
      expect(await page.evaluate(() => document.getElementById("ink-surface") !== null)).toBe(true);
    });
  }
});
