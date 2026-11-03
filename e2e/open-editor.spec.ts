import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers.js";

/**
 * open-editor.spec.ts — srs-web#699: `?open=<url>&editor=<id>` names the editor on a read-only link.
 * The examples are static files served from public/examples by the dev server itself.
 */
const example = (origin: string, name = "on-small-democracy") =>
  `${origin}/examples/${name}.srsj`;
const EXAMPLES = [
  "autonomy-against-coordination",
  "nobody-owns-the-commons",
  "on-small-democracy",
];

for (const name of EXAMPLES)
  test(`editor=essay opens ${name} read-only in the essay editor`, async ({
    page,
    baseURL,
  }) => {
    await page.goto(
      `/?open=${encodeURIComponent(example(baseURL!, name))}&editor=essay`,
    );
    await expect(page.locator(".essay-shell__page")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId("package-upgrade-notice")).toHaveCount(0);
    await expect(page.getByTestId("save-document")).toHaveCount(0);
    await openMenu(page, "Document");
    await expect(page.getByTestId("save-copy")).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
  });

test("editor=site (not read-only capable) lands where a read-only link did", async ({
  page,
  baseURL,
}) => {
  await page.goto(
    `/?open=${encodeURIComponent(example(baseURL!))}&editor=site`,
  );
  await expect(page.getByTestId("read-only-note")).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".essay-shell__page")).toHaveCount(0);
  await expect(page.getByTestId("save-document")).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
});
