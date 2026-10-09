import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { openLenses, openMenu, waitForRecoveryCopy } from "./helpers.js";

/**
 * lenses.spec.ts — srs-web#547: the built-in Lenses view (ADR-022, ADR-025) and its one hash address
 * (ADR-023) on the published spec bundle. Facts from plans/547-lenses-view.md "Bindings and fixture facts".
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => path.join(here, "fixtures", n);
const SPEC = fx("srs-spec.srs");
const CORS = { "access-control-allow-origin": "*" };

const READING = "2ea344e1-f64e-4817-99f7-fe1b1e4046ce"; // first navigation section
const FOUNDATIONS = "752dad23-8a6d-44e5-98c9-f081d2cc634e";
const DISTRIBUTION = "97838af7-50f8-4da2-9d8f-d7dbf9296c80";
const PACKAGE = "006a853f-7e58-4842-85e4-ad75d4b0fe5d";
const DECISION_TYPE = "6a000004-0000-4000-a000-000000000004";
const tab = (id: string) => `lens-tab-nav:${id}`;
const lensHash = (lens: string, id?: string) =>
  `#lens=${encodeURIComponent(lens)}${id ? `&id=${id}` : ""}`;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function openSpec(page: Page, hash = ""): Promise<void> {
  await page.goto(`/${hash}`);
  await page.locator('input[type="file"]#srsj-file').setInputFiles(SPEC);
  await expect(page.getByTestId(hash ? "lens-shell" : "generic-srs-shell")).toBeVisible({ timeout: 30000 });
}

const title = (page: Page) => page.getByTestId("lens-focus").locator('[data-part="title"]').first();
const trailItems = (page: Page) => page.getByTestId("lens-trail").locator("li");
const ctxItems = (page: Page) => page.getByTestId("lens-context").getByTestId("lens-context-item");
const firstRow = (page: Page) => page.getByTestId("lens-collection").locator(".lens-list__row").first();
const hashOf = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash));

/** Labels of the Context links, read from the item buttons (neighbour label only). */
async function contextLabels(page: Page): Promise<string[]> {
  return page
    .getByTestId("lens-context")
    .getByTestId("lens-context-item")
    .locator(".lens-context-item__label")
    .allTextContents();
}

/** Follow the Context link labelled `want`, else the first whose label is not in `avoid`; returns its label. */
async function followLink(page: Page, avoid: string[], want?: string): Promise<string> {
  const labels = await contextLabels(page);
  const i = want ? labels.indexOf(want) : labels.findIndex((l) => l && !avoid.includes(l));
  expect(i, `links: ${JSON.stringify(labels)}`).toBeGreaterThanOrEqual(0);
  await ctxItems(page).nth(i).click();
  await expect(title(page)).toHaveText(labels[i]);
  return labels[i];
}

async function pickPackage(page: Page): Promise<void> {
  await page.getByTestId(tab(DISTRIBUTION)).click();
  await page.getByTestId("lens-collection").getByTestId("lens-item").filter({ hasText: /^Package/ }).first().click();
  await expect(title(page)).toHaveText("Package");
}

test.describe("lenses — shell and address", () => {
  test("Explore > Lenses opens the first section lens and Go > Explorer returns", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page);
    await openLenses(page);
    await expect(page.getByTestId("lens-switcher").getByRole("tab")).toHaveCount(9);
    await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-selected", "true");
    expect(await hashOf(page)).toMatch(new RegExp(`^#lens=nav:${READING}&id=[0-9a-f-]{36}$`));

    await openMenu(page, "Go");
    await page.getByTestId("toolbar-explorer").click();
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible();
    expect(await hashOf(page)).toBe("");
    expect(errors).toEqual([]);
  });

  test("entering a lens selects its first member", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page);
    await openLenses(page);
    await expect(firstRow(page)).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("lens-focus")).not.toContainText("Select something to read it here.");
    // a lens address with no id opens on its first member too
    await page.evaluate((h) => {
      location.hash = h;
    }, lensHash(`nav:${DISTRIBUTION}`));
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
    await expect(firstRow(page)).toHaveAttribute("aria-current", "true");
    expect(await hashOf(page)).toMatch(new RegExp(`^#lens=nav:${DISTRIBUTION}&id=[0-9a-f-]{36}$`));
    expect(errors).toEqual([]);
  });

  test("switching lens to a set that lacks the selection selects the new set's first member and Back returns to the old one", async ({
    page,
  }) => {
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    await page.getByTestId(tab(FOUNDATIONS)).click();
    await expect(page.getByTestId(tab(FOUNDATIONS))).toHaveAttribute("aria-selected", "true");
    await expect(firstRow(page)).toHaveAttribute("aria-current", "true");
    await expect(trailItems(page)).toHaveCount(2);
    await expect(trailItems(page).first()).toHaveText(/Package/);
    // the trail's Back
    await page.getByTestId("lens-back").click();
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
    await expect(title(page)).toHaveText("Package");
    // and browser Back, from a second switch
    await page.getByTestId(tab(FOUNDATIONS)).click();
    await expect(page.getByTestId(tab(FOUNDATIONS))).toHaveAttribute("aria-selected", "true");
    await page.goBack();
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
    await expect(title(page)).toHaveText("Package");
    await expect(page.getByTestId("lens-trail")).toHaveCount(0);
  });

  test("read-only ?open= offers Lenses without Edit", async ({ page }) => {
    const link = "https://semanticops.test/spec.srs";
    await page.route(link, (r) => r.fulfill({ body: readFileSync(SPEC), headers: { ...CORS, "content-type": "application/zip" } }));
    await page.goto(`/?open=${encodeURIComponent(link)}`);
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 30000 });
    await openLenses(page);
    await expect(page.getByTestId("read-only-note")).toContainText("read-only");
    await pickPackage(page);
    await expect(page.getByTestId("lens-edit")).toHaveCount(0);
    await expect(page.getByTestId("save-document")).toHaveCount(0);
    await openMenu(page, "Document");
    await expect(page.getByTestId("save-copy")).toBeVisible();
  });

  test("a hash given with ?open= survives the parameter clearing", async ({ page }) => {
    const link = "https://semanticops.test/spec.srs";
    await page.route(link, (r) => r.fulfill({ body: readFileSync(SPEC), headers: { ...CORS, "content-type": "application/zip" } }));
    await page.goto(`/?open=${encodeURIComponent(link)}${lensHash(`nav:${DISTRIBUTION}`, PACKAGE)}`);
    await expect(page.getByTestId("lens-shell")).toBeVisible({ timeout: 30000 });
    await expect(title(page)).toHaveText("Package");
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
    expect(new URL(page.url()).search).toBe("");
  });

  test("an externally written hash selects lens and record", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page);
    await page.evaluate((h) => {
      location.hash = h;
    }, lensHash(`nav:${DISTRIBUTION}`, PACKAGE));
    await expect(page.getByTestId("lens-shell")).toBeVisible();
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
    await expect(title(page)).toHaveText("Package");
    expect(errors).toEqual([]);
  });

  test("an unresolvable id selects nothing, with no page error", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page, lensHash(`nav:${DISTRIBUTION}`, "00000000-0000-4000-8000-000000000000"));
    await expect(page.getByTestId("lens-focus")).toContainText("Select something to read it here.");
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
    // an unknown lens falls back to the first tab, also without an error
    await page.evaluate(() => {
      location.hash = "#lens=nav%3Anowhere";
    });
    await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });

  test("browser Back after following two links walks both and the trail agrees", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    await expect(page.getByTestId("lens-trail")).toHaveCount(0);
    const first = await followLink(page, ["Package"], "Field"); // Package depends on Field
    await expect(trailItems(page)).toHaveCount(2);
    const second = await followLink(page, ["Package", first]);
    await expect(trailItems(page)).toHaveCount(3);
    await expect(trailItems(page)).toHaveText(["Package", first, second].map((t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

    await page.goBack();
    await expect(title(page)).toHaveText(first);
    await expect(trailItems(page)).toHaveCount(2);
    await page.getByTestId("lens-back").click();
    await expect(title(page)).toHaveText("Package");
    await expect(page.getByTestId("lens-trail")).toHaveCount(0);
  });

  test("Back between two entries with the same hash but a different trail restores that trail", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    // a link whose other end is also in this Collection
    const inSet = await page.getByTestId("lens-collection").getByTestId("lens-item").locator(".lens-list__label").allTextContents();
    const labels = await contextLabels(page);
    const i = labels.findIndex((l) => l !== "Package" && inSet.includes(l));
    expect(i).toBeGreaterThanOrEqual(0);
    await ctxItems(page).nth(i).click();
    await expect(title(page)).toHaveText(labels[i]);
    await expect(trailItems(page)).toHaveCount(2);
    const hashB = await hashOf(page);

    await page.getByTestId("lens-collection").getByTestId("lens-item").filter({ hasText: labels[i] }).first().click();
    await expect(page.getByTestId("lens-trail")).toHaveCount(0);
    expect(await hashOf(page)).toBe(hashB);

    await page.goBack();
    await expect(title(page)).toHaveText(labels[i]);
    await expect(trailItems(page)).toHaveCount(2);
  });

  test("a Breadcrumb item jumps back n entries and browser Forward returns", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    const first = await followLink(page, ["Package"], "Field"); // Package depends on Field
    await followLink(page, ["Package", first]);
    await page.getByTestId("lens-trail").getByRole("button", { name: "Package" }).click();
    await expect(title(page)).toHaveText("Package");
    await expect(page.getByTestId("lens-trail")).toHaveCount(0);
    await page.goForward();
    await expect(title(page)).toHaveText(first);
    await expect(trailItems(page)).toHaveCount(2);
  });

  test("Back from Generic into a lens hash reopens Lenses", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    await openMenu(page, "Go");
    await page.getByTestId("toolbar-explorer").click();
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("lens-shell")).toBeVisible();
    await expect(title(page)).toHaveText("Package");
  });

  test("reload then restore-session reopens the same lens, record and distinctions", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    // an edit makes a recovery copy to restore
    await page.getByTestId("lens-edit").click();
    const box = page.getByTestId("section-form").getByRole("textbox").first();
    await box.fill(`${await box.inputValue()} (edited)`);
    await page.locator("button[type=submit]", { hasText: "Save" }).click();
    await waitForRecoveryCopy(page);
    await page.getByTestId("lens-by").selectOption("type");
    await page.getByTestId("lens-ctx-by").selectOption("none");
    const before = await hashOf(page);
    expect(before).toContain("by=type");
    expect(before).toContain("ctxby=none");

    await page.reload();
    await page.getByTestId("restore-session").click();
    await expect(page.getByTestId("lens-shell")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
    await expect(title(page)).toHaveText("Package");
    await expect(page.getByTestId("lens-by")).toHaveValue("type");
    await expect(page.getByTestId("lens-ctx-by")).toHaveValue("none");
    expect(await hashOf(page)).toBe(before);
  });

  test("editor=lenses on a repo link opens Lenses", async ({ page }) => {
    const dir = fx("exploded");
    const files: Record<string, string> = {};
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else files[path.relative(dir, full).split(path.sep).join("/")] = readFileSync(full).toString("base64");
      }
    };
    walk(dir);
    await page.addInitScript((b64) => {
      const tree: Record<string, Uint8Array> = {};
      for (const [p, v] of Object.entries(b64)) tree[p] = Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
      // biome-ignore lint/suspicious/noExplicitAny: e2e fake-provider seam (cloud-storage.spec.ts pattern)
      (window as any).__SRS_STORAGE_PROVIDERS__ = {
        dropbox: { id: "dropbox", label: "Dropbox", configured: false },
        googleDrive: { id: "google-drive", label: "Google Drive", configured: false },
        github: {
          id: "github",
          label: "GitHub",
          configured: true,
          authenticate: async () => {},
          list: async () => [],
          defaultBranchOf: async () => "main",
          openTree: async () => ({
            provider: "github",
            id: "octo/gov:main:governance#repo",
            name: "governance",
            kind: "tree",
            capabilities: { read: true, write: true },
            revision: "tree-1",
            branch: "main",
            repoLabel: "octo/gov",
            saveToBranch: async () => {
              throw new Error("tree");
            },
            readTree: async () => ({ ...tree }),
            commitTree: async () => ({ revision: "tree-2" }),
          }),
        },
      };
    }, files);
    await page.goto("/?repo=octo/gov&path=governance&editor=lenses");
    await page.getByTestId("repo-link-open").click();
    await expect(page.getByTestId("lens-shell")).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test("Edit then Save marks the document unsaved", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
    await page.getByTestId("lens-edit").click();
    const box = page.getByTestId("section-form").getByRole("textbox").first();
    await box.fill(`${await box.inputValue()} (edited)`);
    await page.locator("button[type=submit]", { hasText: "Save" }).click();
    await expect(page.getByTestId("section-form")).toHaveCount(0);
    await expect(page.getByTestId("document-dirty-status")).toHaveText("Unsaved changes");
    await expect(page.getByTestId("save-document")).toBeEnabled();
  });

  test("My set is not offered", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page);
    await openLenses(page);
    await expect(page.getByTestId("lens-tab-set")).toHaveCount(0);
    await page.getByTestId("lens-more").click();
    await expect(page.getByRole("menuitem", { name: "My set" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      location.hash = "#lens=set";
    });
    await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-selected", "true");
    expect(errors).toEqual([]);
  });
});

test("journey — srs-spec", async ({ page }) => {
  const errors = watchErrors(page);
  // 1. Explore > Lenses: nine section tabs
  await openSpec(page);
  await openLenses(page);
  await expect(page.getByTestId("lens-switcher").getByRole("tab")).toHaveCount(9);

  // 2. Distribution, then the concept Package: Read shows it; Context has a "Depends on" group with a count
  await pickPackage(page);
  await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("lens-context")).toContainText(/Depends on/);
  await expect(page.getByTestId("lens-context")).toContainText(/Depends on[^\n]*\d/);

  // 3. Follow the prerequisite Field: two trail items; browser Back returns to Package, trail empty
  await followLink(page, ["Package"], "Field");
  await expect(trailItems(page)).toHaveCount(2);
  await page.goBack();
  await expect(title(page)).toHaveText("Package");
  await expect(page.getByTestId("lens-trail")).toHaveCount(0);

  // 4. Tell apart by Type groups the Collection; the hash gains by=type
  await page.getByTestId("lens-by").selectOption("type");
  await expect(page.getByTestId("lens-collection").getByTestId("lens-group").first()).toBeVisible();
  expect(await hashOf(page)).toContain("by=type");

  // 5. The decision type lens offers no field option (gap 6); a by=field: address falls back to Type
  await page.evaluate((h) => {
    location.hash = h;
  }, `${lensHash(`type:${DECISION_TYPE}`)}&by=field%3A00000000-0000-4000-8000-000000000001`);
  await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "false");
  expect(await hashOf(page)).toContain(`lens=type:${DECISION_TYPE}`);
  const options = await page.getByTestId("lens-by").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(options.some((v) => v.startsWith("field:"))).toBe(false);
  await expect(page.getByTestId("lens-by")).toHaveValue("type");

  // 6. Back on Package: Reader layout, then Document highlights the selected block
  await page.evaluate((h) => {
    location.hash = h;
  }, lensHash(`nav:${DISTRIBUTION}`, PACKAGE));
  await expect(title(page)).toHaveText("Package");
  await page.getByTestId("lens-layout").selectOption("reader");
  await page.getByTestId("lens-mode").selectOption("document");
  const selected = page.locator(`[data-testid="lens-block"][data-instance-id="${PACKAGE}"]`);
  await expect(selected).toHaveClass(/lens-block--selected/);

  // 7. Edit in place, Cancel: nothing unsaved; Edit, Save: unsaved
  await page.getByTestId("lens-edit").click();
  const form = page.getByTestId("section-form");
  const box = form.getByRole("textbox").first();
  await box.fill(`${await box.inputValue()} (edited)`);
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  await page.getByTestId("lens-edit").click();
  await form.getByRole("textbox").first().fill(`${await form.getByRole("textbox").first().inputValue()} (edited)`);
  await form.locator("button[type=submit]", { hasText: "Save" }).click();
  await expect(page.getByTestId("document-dirty-status")).toHaveText("Unsaved changes");
  await waitForRecoveryCopy(page);

  // 8. Reload, restore: the same lens and record
  await page.reload();
  await page.getByTestId("restore-session").click();
  await expect(page.getByTestId("lens-shell")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("lens-collection").locator('.lens-list__row[aria-current="true"]')).toContainText("Package");
  expect(await hashOf(page)).toContain(`id=${PACKAGE}`);

  // 9. Go > Explorer
  await openMenu(page, "Go");
  await page.getByTestId("toolbar-explorer").click();
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible();

  // 10. No page errors
  expect(errors).toEqual([]);
});
