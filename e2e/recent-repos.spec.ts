import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * recent-repos.spec.ts — edits to the "Favourites and recent" list survive a reload (srs-web#728).
 * The entry is seeded, so no GitHub sign-in is needed; star and remove go through the same save as
 * recording an opened repository.
 */
const ENTRY = {
  key: "github:o/r:main:d",
  source: { kind: "github", where: "o/r:main:d" },
  label: "o/r",
  starred: false,
  lastOpened: "2026-11-01T00:00:00.000Z",
};

async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.evaluate(
    (entry) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("srs-web-recent", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("lists");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("lists", "readwrite");
          tx.objectStore("lists").put([entry], "repos");
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
    ENTRY
  );
  await page.reload();
  await expect(page.getByTestId("recent-item")).toHaveCount(1, { timeout: 15000 });
}

/** The stored list. Polled by the tests: the click does not await the save. */
const stored = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ starred: boolean }[]>((resolve, reject) => {
        const open = indexedDB.open("srs-web-recent", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("lists").objectStore("lists").get("repos");
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result);
          };
        };
      })
  );

test("a star survives a reload", async ({ page }) => {
  await start(page);
  await page.getByTestId("recent-star").click();
  await expect.poll(async () => (await stored(page))[0]?.starred).toBe(true);
  await page.reload();
  await expect(page.getByTestId("recent-star")).toHaveAttribute("aria-pressed", "true", {
    timeout: 15000,
  });
});

test("a removed entry stays removed after a reload", async ({ page }) => {
  await start(page);
  await page.getByTestId("recent-remove").click();
  await expect.poll(async () => (await stored(page)).length).toBe(0);
  await page.reload();
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("recent-item")).toHaveCount(0);
});
