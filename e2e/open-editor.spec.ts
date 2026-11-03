import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { READ_DEFAULT } from "../playwright.config";
import { openMenu } from "./helpers.js";

/**
 * open-editor.spec.ts — srs-web#699: `?open=<url>&editor=<id>` names the editor on a read-only link.
 * The examples are the real files under public/examples, served from a mocked https origin (the built
 * app, as CI runs it, refuses http links; ADR-021).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = ["autonomy-against-coordination", "nobody-owns-the-commons", "on-small-democracy"];
const CORS = { "access-control-allow-origin": "*" };

async function serve(page: Page, url: string, file: string, type: string) {
  await page.route(url, (route) =>
    route.fulfill({ body: readFileSync(file), headers: { ...CORS, "content-type": type } }),
  );
}
const example = async (page: Page, name: string) => {
  const url = `https://semanticops.test/examples/${name}.srsj`;
  await serve(page, url, path.join(here, "..", "public", "examples", `${name}.srsj`), "application/json");
  return encodeURIComponent(url);
};

for (const name of EXAMPLES)
  test(`editor=essay opens ${name} read-only in the essay editor`, async ({ page }) => {
    await page.goto(`/?open=${await example(page, name)}&editor=essay`);
    await expect(page.locator(".essay-shell__page")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".essay-shell__page")).toHaveAttribute("inert", "");
    await expect(page.getByTestId("read-only-note")).toBeVisible();
    await expect(page.getByTestId("package-upgrade-notice")).toHaveCount(0);
    await expect(page.getByTestId("save-document")).toHaveCount(0);
    await openMenu(page, "Document");
    await expect(page.getByTestId("save-copy")).toBeVisible();
    await expect(page.getByTestId("new-document")).toHaveCount(0);
    await expect(page.getByTestId("copy-document")).toHaveCount(0);
    expect(new URL(page.url()).search).toBe("");
  });

test("editor=site (not read-only capable) lands where a read-only link did", async ({ page }) => {
  await page.goto(`/?open=${await example(page, EXAMPLES[2]!)}&editor=site`);
  await expect(page.getByTestId("read-only-note")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".essay-shell__page")).toHaveCount(0);
  await expect(page.getByTestId("save-document")).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
});

test("a read-only link with no editor lands as before, listing Essay among the package editors", async ({
  page,
}) => {
  await page.goto(`/?open=${await example(page, EXAMPLES[2]!)}`);
  await expect(page.getByTestId("read-only-note")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".essay-shell__page")).toHaveCount(0);
  await expect(page.getByTestId("package-editor-essay").first()).toBeVisible();
});

test.describe("a repository with a front door", () => {
  test.use({ storageState: READ_DEFAULT });
  test("an unusable editor request leaves the read-only link on Read", async ({ page }) => {
    const url = "https://semanticops.test/spec.srs";
    await serve(page, url, path.join(here, "fixtures", "srs-spec.srs"), "application/zip");
    await page.goto(`/?open=${encodeURIComponent(url)}&editor=site`);
    await expect(page.getByTestId("read-shell")).toBeVisible({ timeout: 30000 });
  });
});
