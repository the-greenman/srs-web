import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { openInspectorDrawer, openLenses, openMenu, openNavDrawer, waitForRecoveryCopy } from "./helpers.js";

/**
 * lenses.spec.ts — srs-web#547: the built-in Lenses view (ADR-022, ADR-025) and its one hash address
 * (ADR-023) on the published spec bundle. Facts from plans/547-lenses-view.md "Bindings and fixture facts".
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => path.join(here, "fixtures", n);
const SPEC = fx("srs-spec.srs");
const CORS = { "access-control-allow-origin": "*" };

const READING = "2ea344e1-f64e-4817-99f7-fe1b1e4046ce"; // first navigation section
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
    await expect(page.getByTestId("lens-switcher").getByRole("navigation", { name: "Lenses" }).getByRole("button")).toHaveCount(9);
    await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-current", "true");
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
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
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
    await followLink(page, ["Package"], "Field");
    await expect(trailItems(page)).toHaveCount(2);
    await page.getByTestId(tab(READING)).click(); // holds neither Package nor Field
    await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-current", "true");
    await expect(firstRow(page)).toHaveAttribute("aria-current", "true");
    // the visible trail holds only links followed inside the current lens: empty after a switch
    await expect(page.getByTestId("lens-trail")).toHaveCount(0);
    // the switch is still history: browser Back returns to the old lens, record and trail
    await page.goBack();
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
    await expect(title(page)).toHaveText("Field");
    await expect(trailItems(page)).toHaveCount(2);
  });

  test("Explore > Lenses returns to the last lens address of this session", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page);
    await openLenses(page);
    await pickPackage(page);
    await page.getByTestId("lens-by").selectOption("type");
    await page.getByTestId("lens-ctx-by").selectOption("none");
    const before = await hashOf(page);
    await openMenu(page, "Go");
    await page.getByTestId("toolbar-explorer").click();
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible();
    await openLenses(page);
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
    await expect(title(page)).toHaveText("Package");
    await expect(page.getByTestId("lens-by")).toHaveValue("type");
    await expect(page.getByTestId("lens-ctx-by")).toHaveValue("none");
    expect(await hashOf(page)).toBe(before);
    expect(errors).toEqual([]);
  });

  test("the Explorer button at the top of the Lenses nav returns to the explorer", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await page.getByTestId("lens-explorer").click();
    await expect(page.getByTestId("generic-srs-shell")).toBeVisible();
    expect(await hashOf(page)).toBe("");
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
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
    expect(new URL(page.url()).search).toBe("");
  });

  test("an externally written hash selects lens and record", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page);
    await page.evaluate((h) => {
      location.hash = h;
    }, lensHash(`nav:${DISTRIBUTION}`, PACKAGE));
    await expect(page.getByTestId("lens-shell")).toBeVisible();
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
    await expect(title(page)).toHaveText("Package");
    expect(errors).toEqual([]);
  });

  test("an unresolvable id selects nothing, with no page error", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page, lensHash(`nav:${DISTRIBUTION}`, "00000000-0000-4000-8000-000000000000"));
    await expect(page.getByTestId("lens-focus")).toContainText("Select something to read it here.");
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
    // an unknown lens falls back to the first tab, also without an error
    await page.evaluate(() => {
      location.hash = "#lens=nav%3Anowhere";
    });
    await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-current", "true");
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
    await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
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
    await page.setViewportSize({ width: 1440, height: 900 });
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
    // at 1440, on the record with the longest label: "Unsaved changes" and Layout stay whole, and the
    // title keeps its room (it wraps to two lines before it ellipsises)
    const labels = await page.getByTestId("lens-collection").locator(".lens-list__label").allTextContents();
    const longest = labels.reduce((a, b) => (b.length > a.length ? b : a));
    await page.getByTestId("lens-collection").getByTestId("lens-item").filter({ hasText: longest }).first().click();
    const size = async (sel: string) =>
      page.locator(sel).first().evaluate((e) => ({ w: e.clientWidth, sw: e.scrollWidth, h: e.clientHeight }));
    for (const sel of ["[data-testid=document-dirty-status]", ".lens-shell .lens-layout"]) {
      const b = await size(sel);
      expect(b.sw, sel).toBeLessThanOrEqual(b.w);
    }
    const name = await size(".lens-shell .toolbar__name");
    expect(name.w).toBeGreaterThan(200);
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
    await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-current", "true");
    expect(errors).toEqual([]);
  });
});

test.describe("lenses — layouts", () => {
  test("board and graph layouts open on the decision type lens with no page error", async ({ page }) => {
    const errors = watchErrors(page);
    await openSpec(page, lensHash(`type:${DECISION_TYPE}`));
    const first = await title(page).textContent();

    // Board: the Collection is a table in the main pane; Focus and Context sit in the inspector.
    await page.getByTestId("lens-layout").selectOption("board");
    const board = page.locator(".lens-board").getByTestId("lens-collection");
    await expect(board).toHaveAttribute("data-mode", "table");
    await expect(board.locator("thead th")).not.toHaveCount(0);
    await expect(board.getByTestId("lens-item").first()).toBeVisible();
    await expect(page.locator(".lens-inspector-focus").getByTestId("lens-focus")).toBeVisible();
    await board.getByTestId("lens-item").nth(1).click();
    await expect(title(page)).not.toHaveText(first ?? "");

    // Graph: the selection's links, edges named as Context names its groups.
    await page.getByTestId("lens-layout").selectOption("graph");
    await pickPackage(page);
    await expect(page.getByTestId("lens-graph").getByTestId("scoped-graph")).toBeVisible();
    const legend = await page.getByTestId("graph-legend").locator("li").allTextContents();
    const groups = await page.getByTestId("lens-context").locator(".lens-context-group").allTextContents();
    expect(legend.some((l) => /Depends on/.test(l))).toBe(true);
    for (const l of legend) {
      const name = l.replace(/^[←→]\s*/, "").replace(/\s*\d+$/, "").trim();
      expect(groups.some((g) => g.includes(name)), name).toBe(true);
    }
    const leaving = page.getByTestId("lens-graph").locator('g.neighbour[data-tone="leaving"]').first();
    await expect(leaving).toBeVisible();
    // The tone is named, not only drawn: aria-label and the legend's line key.
    await expect(leaving).toHaveAttribute("aria-label", /, leaving the set: /);
    await expect(page.getByTestId("graph-tone-key")).toContainText("Solid: inside the set");
    await expect(page.getByTestId("graph-tone-key")).toContainText("Dashed: leaving the set");
    // At most GRAPH_LINKS (12) a side are drawn; when some are left out the graph says so.
    const drawn = await page.getByTestId("lens-graph").locator("g.neighbour").count();
    expect(drawn).toBeLessThanOrEqual(24);
    const cap = page.getByTestId("lens-graph-cap");
    if (await cap.count()) await expect(cap).toHaveText(new RegExp(`^${drawn} of \\d+ links$`));
    expect(errors).toEqual([]);
  });
});

test("draw a set", async ({ page, browser }) => {
  const errors = watchErrors(page);
  await openSpec(page);
  await openLenses(page);
  await page.getByTestId(tab(DISTRIBUTION)).click();
  const collection = page.getByTestId("lens-collection");
  const rows = collection.getByTestId("lens-item");

  // Check two concepts and show them as a set: the My set tab appears and is current.
  await expect(page.getByTestId("lens-tab-set")).toHaveCount(0);
  await page.getByTestId("lens-select-toggle").click();
  const checks = collection.getByTestId("lens-check");
  await checks.nth(0).click();
  await checks.nth(1).click();
  await expect(page.getByTestId("lens-show-set")).toHaveText("Show as a set (2)");
  await page.getByTestId("lens-show-set").click();
  await expect(page.getByTestId("lens-tab-set")).toHaveAttribute("aria-current", "true");
  expect(await hashOf(page)).toContain("lens=set");
  await expect(rows).toHaveCount(2);

  // Add everything the two checked link to: the checks grow (a draft), My set waits for "Replace My set
  // with these"; any skipped hub is listed with its own "+".
  await expect(page.getByTestId("lens-add-all")).toHaveText("Add everything the 2 checked link to");
  await page.getByTestId("lens-add-all").click();
  const show = page.getByTestId("lens-show-set");
  await expect(show).toHaveText(/^Replace My set with these \(\d+\)$/);
  const grown = Number(/\((\d+)\)/.exec((await show.textContent()) ?? "")?.[1]);
  expect(grown).toBeGreaterThan(2);
  await expect(rows).toHaveCount(2);
  const skipped = page.getByTestId("lens-skipped");
  if (await skipped.count()) await expect(skipped.getByTestId("lens-skipped-add")).not.toHaveCount(0);
  await show.click();
  await expect(rows).toHaveCount(grown);
  await expect(show).toHaveCount(0);

  // One rule on My set too: unchecking changes the draft only; Clear selection keeps My set.
  await page.getByTestId("lens-select-toggle").click();
  await checks.nth(0).click();
  await expect(show).toHaveText(`Replace My set with these (${grown - 1})`);
  await expect(rows).toHaveCount(grown);
  await page.getByTestId("lens-clear-checks").click();
  await expect(checks.nth(0)).not.toBeChecked();
  await expect(page.getByTestId("lens-tab-set")).toHaveAttribute("aria-current", "true");
  await expect(rows).toHaveCount(grown);

  // Tell apart by Type groups the set.
  await page.getByTestId("lens-by").selectOption("type");
  await expect(collection.getByTestId("lens-group").first()).toBeVisible();

  // Context inside/outside: a record added from the links has links inside the set and links leaving it.
  await page.getByTestId("lens-ctx-by").selectOption("boundary");
  const groupLabels = () =>
    page.getByTestId("lens-context").getByTestId("lens-context-group").evaluateAll((gs) => gs.map((g) => g.getAttribute("data-label")));
  let both = false;
  for (let i = 0; i < grown && !both; i++) {
    await rows.nth(i).click();
    await expect(page.getByTestId("lens-context")).toHaveAttribute("data-by", "boundary");
    const ls = await groupLabels();
    both = ls.includes("Inside this set") && ls.includes("Leaving this set");
  }
  expect(both).toBe(true);

  // Remove My set deletes it: the tab goes and the first tab is shown.
  await expect(page.getByTestId("lens-remove-set")).toHaveText("Remove My set");
  await page.getByTestId("lens-remove-set").click();
  await expect(page.getByTestId("lens-tab-set")).toHaveCount(0);
  await expect(page.getByTestId(tab(READING))).toHaveAttribute("aria-current", "true");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("srs-web.lens-set.")))).toEqual([]);
  expect(errors).toEqual([]);

  // A lens=set link opened in another browser (no stored set) falls back to the first tab with a notice.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await openSpec(fresh, "#lens=set");
  await expect(fresh.getByTestId("lens-set-notice")).toBeVisible();
  await expect(fresh.getByTestId(tab(READING))).toHaveAttribute("aria-current", "true");
  await expect(fresh.getByTestId("lens-tab-set")).toHaveCount(0);
  await other.close();
});

test.describe("lenses — phone (390 wide)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("on a phone, following a link or picking a record closes the drawer", async ({ page }) => {
    await openSpec(page);
    await openLenses(page);
    await page.getByTestId(tab(DISTRIBUTION)).click();
    await openNavDrawer(page);
    await page.getByTestId("lens-collection").getByTestId("lens-item").filter({ hasText: /^Package/ }).first().click();
    await expect(page.getByTestId("shell-drawer-nav")).toBeHidden();
    await expect(title(page)).toHaveText("Package");
    await openInspectorDrawer(page);
    await followLink(page, ["Package"], "Field");
    await expect(page.getByTestId("shell-drawer-inspector")).toBeHidden();
    await expect(page.getByTestId("lens-back")).toBeVisible();
  });

  test("on a phone, Select keeps the drawer open, checkboxes are 24px targets inside the gutter, and the toolbar does not clip", async ({
    page,
  }) => {
    await openSpec(page);
    await openLenses(page);
    // The toolbar: every control inside the viewport, nothing in the status clipped.
    const bar = await page.locator(".lens-shell .toolbar").first().evaluate((t) => ({
      overflow: t.scrollWidth - t.clientWidth,
      outside: [...t.querySelectorAll("button, select")].filter((e) => e.getBoundingClientRect().right > innerWidth).length,
      clipped: [...t.querySelectorAll(".toolbar__status > *")].filter((e) => e.scrollWidth > e.clientWidth).length,
    }));
    expect(bar).toEqual({ overflow: 0, outside: 0, clipped: 0 });
    await page.getByTestId(tab(DISTRIBUTION)).click();
    await openNavDrawer(page);
    await page.getByTestId("lens-select-toggle").click();
    await expect(page.getByTestId("shell-drawer-nav")).toBeVisible();
    await expect(page.getByTestId("lens-select-toggle")).toHaveAttribute("aria-pressed", "true");
    const target = await page.getByTestId("lens-check").first().locator("xpath=..").boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(24);
    expect(target?.height).toBeGreaterThanOrEqual(24);
    expect(target?.x).toBeGreaterThanOrEqual(16);
    await page.getByTestId("lens-check").first().click();
    await expect(page.getByTestId("shell-drawer-nav")).toBeVisible();
    await expect(page.getByTestId("lens-show-set")).toHaveText("Show as a set (1)");
  });
});

test("journey — srs-spec", async ({ page }) => {
  const errors = watchErrors(page);
  // 1. Explore > Lenses: nine section tabs
  await openSpec(page);
  await openLenses(page);
  await expect(page.getByTestId("lens-switcher").getByRole("navigation", { name: "Lenses" }).getByRole("button")).toHaveCount(9);

  // 2. Distribution, then the concept Package: Read shows it; Context has a "Depends on" group with a count
  await pickPackage(page);
  await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
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
  await expect(page.getByTestId(tab(DISTRIBUTION))).not.toHaveAttribute("aria-current", "true");
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
  await expect(page.getByTestId(tab(DISTRIBUTION))).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("lens-collection").locator('.lens-list__row[aria-current="true"]')).toContainText("Package");
  expect(await hashOf(page)).toContain(`id=${PACKAGE}`);

  // 9. Go > Explorer
  await openMenu(page, "Go");
  await page.getByTestId("toolbar-explorer").click();
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible();

  // 10. No page errors
  expect(errors).toEqual([]);
});
