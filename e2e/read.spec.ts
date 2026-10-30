import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { READ_DEFAULT } from "../playwright.config";
import { openRead } from "./helpers.js";

// The viewer's default setting: no stored choice, so a repository with a front door opens on Read.
test.use({ storageState: READ_DEFAULT });

/**
 * read.spec.ts — srs-web#670: the built-in Read view (ADR-022, ADR-029) on the published spec bundle:
 * the front door, drilling two levels, Back and the breadcrumb (history.go), and the address surviving
 * a reload (reopening the document lands on the page the hash names).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.join(here, "fixtures", "srs-spec.srs");

const heading = (page: Page) => page.getByTestId("read-page").locator(".record-prose__title").first();
const items = (page: Page) => page.getByTestId("read-item");
const hashOf = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));

async function openSpec(page: Page): Promise<void> {
  await page.locator('input[type="file"]#srsj-file').setInputFiles(SPEC);
}

test("Read opens on the identity record and drills two levels; Back, the breadcrumb and reload agree", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await openSpec(page);
  // a repository with a front door opens on Read by default
  await expect(page.getByTestId("read-shell")).toBeVisible({ timeout: 30000 });

  const front = (await heading(page).textContent())?.trim();
  expect(front).toBeTruthy();
  expect(await hashOf(page)).toMatch(/^#read=[^&]+&id=/);
  await expect(items(page)).toHaveCount(9); // the spec's nine navigation sections

  const section = (await items(page).first().locator(".read-page__label").textContent())?.trim();
  await items(page).first().click();
  await expect(heading(page)).toHaveText(section!);
  const deeper = (await items(page).first().locator(".read-page__label").textContent())?.trim();
  await items(page).first().click();
  await expect(heading(page)).toHaveText(deeper!);
  await expect(page.getByTestId("read-trail").locator("li")).toHaveCount(3);

  await page.goBack();
  await expect(heading(page)).toHaveText(section!);
  await page.goForward();
  await expect(heading(page)).toHaveText(deeper!);
  await page.getByTestId("read-trail").getByRole("button", { name: front! }).click();
  await expect(heading(page)).toHaveText(front!);

  await items(page).first().click();
  await expect(heading(page)).toHaveText(section!);
  const hash = await hashOf(page);
  await page.reload();
  expect(await hashOf(page)).toBe(hash);
  await openSpec(page);
  await expect(page.getByTestId("read-shell")).toBeVisible({ timeout: 30000 });
  await expect(heading(page)).toHaveText(section!);

  expect(errors).toEqual([]);
});

test("the viewer can turn the default off: the next repository opens in the explorer, and Explore > Read still works", async ({ page }) => {
  await page.goto("/");
  await openSpec(page);
  await expect(page.getByTestId("read-shell")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByTestId("open-on-read").click();
  expect(await page.evaluate(() => localStorage.getItem("srs-web.open-on-read"))).toBe("0");
  await page.goto("/");
  await openSpec(page);
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 30000 });
  await openRead(page);
  await expect(page.getByTestId("read-page")).toBeVisible();
});
