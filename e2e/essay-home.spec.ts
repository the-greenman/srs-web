import { expect, test } from "@playwright/test";

/**
 * essay-home.spec.ts — srs-web#700: `/essay` (and essay.semanticops.com) shows the essay home, whose
 * words are help records; New essay starts an essay; `/` keeps the generic landing.
 */
const START = '[data-feature="essay-home.start"]';

test("/essay shows the essay home; New essay lands in the essay shell", async ({ page }) => {
  await page.goto("/essay");
  await expect(page.locator(START)).toHaveText("Start an essay", { timeout: 15000 });
  await expect(page.getByTestId("generic-file-picker")).toHaveCount(0);
  await page.locator(START).click();
  await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 15000 });
});

test("/essay says what makes the editor different and links to muDemocracy", async ({ page }) => {
  await page.goto("/essay");
  const different = page.getByTestId("essay-home-different");
  await expect(different.getByRole("heading", { name: "What it can't do" })).toBeVisible({ timeout: 15000 });
  await expect(different.getByRole("link", { name: "muDemocracy" })).toHaveAttribute("href", "https://mudemocracy.org");
});

test("on a phone, starting and opening come before what makes it different", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("/essay");
  const y = async (l: import("@playwright/test").Locator) => (await l.boundingBox())?.y ?? Number.NaN;
  await expect(page.locator(START)).toBeVisible({ timeout: 15000 });
  const different = await y(page.getByTestId("essay-home-different"));
  expect(await y(page.locator(START))).toBeLessThan(different);
  expect(await y(page.getByText("Open a file"))).toBeLessThan(different);
});

test("/essay?new=essay lands in the essay shell", async ({ page }) => {
  await page.goto("/essay?new=essay");
  await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 15000 });
});

test("a repository opened on the essay home lands in the essay shell, unasked (#710)", async ({ page }) => {
  await page.goto("/essay?open=/examples/on-small-democracy.srsj");
  await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 15000 });
});

test("the same link on / does not choose the essay shell (#710)", async ({ page }) => {
  await page.goto("/?open=/examples/on-small-democracy.srsj");
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".essay-shell__page")).toHaveCount(0);
});

test("Favourites and recent shows on the essay home only when it has entries (#730)", async ({ page }) => {
  await page.goto("/essay");
  await expect(page.locator(START)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("recent-repos")).toHaveCount(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("srs-web-recent", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("lists");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("lists", "readwrite");
          tx.objectStore("lists").put(
            [
              {
                key: "github:o/r:main:d",
                source: { kind: "github", where: "o/r:main:d" },
                label: "a-rather-long-owner-name/a-rather-long-repository-name",
                starred: false,
                lastOpened: "2026-11-01T00:00:00.000Z",
              },
            ],
            "repos"
          );
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      })
  );
  await page.reload();
  await expect(page.getByTestId("recent-item")).toContainText("a-rather-long-owner-name", { timeout: 15000 });
  await expect(page.locator(START)).toBeVisible();
  await page.getByTestId("recent-star").click();
  await expect(page.getByTestId("recent-star")).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 400, height: 800 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(400);
  await page.getByTestId("recent-remove").click();
  await expect(page.getByTestId("recent-repos")).toHaveCount(0);
});

test("/ keeps the generic landing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(START)).toHaveCount(0);
});
