import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { NO_ACTOR } from "../playwright.config";
import { closeMenus, openMenu, waitForRecoveryCopy } from "./helpers";

/**
 * srs-web#752: the essay edits visually by default; View > Edit as markdown is the way to the source.
 * Every test runs at desktop and at phone width. Nothing here sets the mode except the switch itself.
 * Fixture essay.srsj: "First paragraph." / "Second paragraph." / "Third paragraph.".
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
const body = (page: Page, n: number) => items(page).nth(n).locator('[data-focus-key^="body:"]');
const visual = (page: Page, n: number) => items(page).nth(n).locator(".ProseMirror");
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Formatting" });
const depth = (page: Page, n: number) =>
  items(page).nth(n).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--depth"));
/** The visual editor places its caret a frame after focus; a writer is never faster. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const MARKDOWN = "* one __two__\n* _three_";
const TABLE = "| a | b |\n|---|---|\n| 1 | 2 |";
const IMAGE = "Look: ![a cat](https://example.com/cat.png)";

for (const phone of [false, true]) {
  test.describe(phone ? "phone width" : "desktop", () => {
    const narrow = (page: Page) =>
      phone ? page.setViewportSize({ width: 390, height: 780 }) : Promise.resolve();
    async function load(page: Page) {
      await page.goto("/");
      await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
      await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
      // The editor picker is not reachable at phone width yet (srs-web#381): opened at desktop width, then shrunk.
      await page.getByTestId("package-editor-essay").click();
      await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
      await narrow(page);
    }
    const menu = (page: Page, name: "Document" | "View") =>
      phone ? page.getByTestId("header-menu").click() : openMenu(page, name);
    async function toggle(page: Page) {
      await menu(page, "View");
      await page.getByTestId("edit-markdown").click();
      await closeMenus(page);
    }
    /** Leave the paragraph (the title is not an edit surface until clicked; the page corner is). */
    async function leave(page: Page) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(toolbar(page)).toHaveCount(0);
    }
    async function openVisual(page: Page, n: number) {
      await body(page, n).click();
      await expect(visual(page, n)).toBeFocused();
      await frames(page);
    }
    async function writeSource(page: Page, n: number, text: string) {
      await body(page, n).click();
      await expect(body(page, n)).toHaveAttribute("contenteditable", "plaintext-only");
      await page.keyboard.press("Control+a");
      await page.keyboard.insertText(text);
      await leave(page);
    }
    async function exported(page: Page): Promise<string> {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        (async () => {
          await menu(page, "Document");
          await page.getByTestId("export-markdown").click();
        })(),
      ]);
      const chunks: Buffer[] = [];
      for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
      return Buffer.concat(chunks).toString("utf8");
    }
    /** Paste an image as a file and as HTML into the focused editor. */
    const pasteImage = (page: Page) =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const file = new DataTransfer();
        file.items.add(new File([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], "a.png", { type: "image/png" }));
        const html = new DataTransfer();
        html.setData("text/html", `<img src="data:image/png;base64,${png}" alt="a">`);
        for (const clipboardData of [file, html])
          el.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
      });

    test("a writer formats with only the toolbar, in a paragraph and in the purpose; the export is plain markdown", async ({ page }) => {
      await load(page);
      await openVisual(page, 0);
      await page.keyboard.press("Control+a");
      await toolbar(page).getByRole("button", { name: "Bold", exact: true }).click();
      await expect(visual(page, 0).locator("strong")).toHaveText("First paragraph.");
      await leave(page);
      await openVisual(page, 1);
      await toolbar(page).getByRole("button", { name: "Bulleted list", exact: true }).click();
      await expect(visual(page, 1).locator("li")).toHaveCount(1);
      await leave(page);
      const purpose = page.locator(".essay-shell__purpose");
      await purpose.locator(".purpose__render").click();
      await expect(purpose.locator(".ProseMirror")).toBeFocused();
      await frames(page);
      await toolbar(page).getByRole("button", { name: "Italic", exact: true }).click();
      await page.keyboard.type("Persuade");
      await leave(page);
      await expect(purpose.locator(".purpose__render em")).toHaveText("Persuade");
      const md = await exported(page);
      expect(md).toContain("**First paragraph.**");
      expect(md).toContain("- Second paragraph.");
      expect(md).not.toMatch(/<\w/);
    });

    test("the switch shows the markdown, survives a reload, and returns; Markdown help follows it", async ({ page }) => {
      await load(page);
      await toggle(page);
      await writeSource(page, 0, "A **bold** word.");
      await waitForRecoveryCopy(page);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.reload();
      await page.getByTestId("restore-session").click();
      await page.getByTestId("package-editor-essay").click();
      await narrow(page);
      await body(page, 0).click();
      await expect(body(page, 0)).toHaveAttribute("contenteditable", "plaintext-only");
      await expect(body(page, 0)).toHaveText("A **bold** word.");
      await leave(page);
      await menu(page, "View");
      await expect(page.getByTestId("edit-markdown")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("toolbar-help")).toBeVisible();
      await page.getByTestId("edit-markdown").click();
      await closeMenus(page);
      await openVisual(page, 0);
      await expect(visual(page, 0).locator("strong")).toHaveText("bold");
      await leave(page);
      await menu(page, "View");
      await expect(page.getByTestId("edit-markdown")).toHaveAttribute("aria-checked", "false");
      await expect(page.getByTestId("toolbar-help")).toHaveCount(0);
    });

    test("a paragraph opened and left is byte-identical; one holding a table or an image opens as source, intact", async ({ page }) => {
      await load(page);
      await toggle(page);
      for (const [n, text] of [MARKDOWN, TABLE, IMAGE].entries()) await writeSource(page, n, text);
      const before = await exported(page);
      await toggle(page);
      await openVisual(page, 0); // markup the visual editor would write differently
      await page.waitForTimeout(600); // past the save pause
      await leave(page);
      for (const [n, text] of [[1, TABLE], [2, IMAGE]] as const) {
        await body(page, n).click();
        await expect(body(page, n)).toHaveAttribute("contenteditable", "plaintext-only");
        await expect(items(page).nth(n).locator(".block__note")).toContainText("Shown as markdown source");
        expect(await body(page, n).evaluate((el) => el.textContent)).toBe(text);
        await leave(page);
      }
      expect(await exported(page)).toBe(before);
      expect(before).toContain(MARKDOWN);
      await toggle(page);
      await body(page, 0).click();
      expect(await body(page, 0).evaluate((el) => el.textContent)).toBe(MARKDOWN);
    });

    for (const source of [false, true])
      test(`a pasted image adds nothing to the record (${source ? "markdown" : "visual"})`, async ({ page }) => {
        await load(page);
        if (source) await toggle(page);
        const before = await exported(page);
        await body(page, 0).click();
        await expect(source ? body(page, 0) : visual(page, 0)).toBeFocused();
        await frames(page);
        await pasteImage(page);
        await page.waitForTimeout(600); // past the save pause
        await leave(page);
        expect(await exported(page)).toBe(before);
      });

    for (const source of [false, true])
      test(`split, arrow navigation and indent work (${source ? "markdown" : "visual"})`, async ({ page }) => {
        await load(page);
        if (source) await toggle(page);
        const open = async (n: number) => {
          await body(page, n).click();
          await expect(source ? body(page, n) : visual(page, n)).toBeFocused();
          await expect(body(page, n)).toHaveAttribute("contenteditable", source ? "plaintext-only" : "true");
          await page.waitForTimeout(250); // for 200 ms after focus ProseMirror undoes a jump to the start of the text
        };
        await open(0);
        await page.keyboard.press("Home");
        await page.waitForTimeout(100);
        for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(100); // a key's selection reaches the editor on the next selectionchange
        await page.keyboard.press("Control+Enter");
        await expect(items(page)).toHaveCount(4);
        await expect(body(page, 0)).toHaveText("First");
        await expect(body(page, 1)).toHaveText("paragraph.");
        await open(1);
        await page.keyboard.press("ArrowUp");
        await expect(body(page, 0)).toBeFocused();
        await expect(body(page, 0)).toHaveAttribute("contenteditable", source ? "plaintext-only" : "true");
        await frames(page);
        await page.keyboard.press("ArrowDown");
        await expect(body(page, 1)).toBeFocused();
        await open(2);
        await page.keyboard.press("Home");
        await page.waitForTimeout(100); // a key's selection reaches the editor on the next selectionchange
        await page.keyboard.press("Tab");
        await expect.poll(() => depth(page, 2)).toBe("1");
      });

    test("while the editor loads the paragraph stays as it was, focused; if it cannot load, it opens as source", async ({ page }) => {
      let release = () => {};
      const held = new Promise<void>((r) => (release = r));
      await page.route(/visual-markdown/, async (route) => {
        await held;
        await route.abort();
      });
      await load(page);
      const box = await body(page, 0).boundingBox();
      await body(page, 0).click();
      await expect(body(page, 0)).toHaveAttribute("aria-busy", "true");
      await expect(body(page, 0)).toBeFocused();
      await expect(body(page, 0)).toHaveText("First paragraph.");
      expect((await body(page, 0).boundingBox())!.height).toBeCloseTo(box!.height, 0);
      release();
      await expect(body(page, 0)).toHaveAttribute("contenteditable", "plaintext-only");
      await expect(body(page, 0)).toBeFocused();
      await expect(items(page).nth(0).locator(".block__note")).toContainText("could not be loaded");
    });

    test.describe("storage blocked", () => {
      /** Reading or writing `key` (every key when absent) throws, as with site data blocked. */
      const block = (page: Page, key?: string) =>
        page.addInitScript((key) => {
          const refuse = () => {
            throw new DOMException("blocked", "SecurityError");
          };
          if (!key) {
            Object.defineProperty(window, "localStorage", { get: refuse });
            return;
          }
          for (const name of ["getItem", "setItem"] as const) {
            const real = Storage.prototype[name] as (...a: string[]) => string | null;
            Storage.prototype[name] = function (this: Storage, k: string, v: string) {
              return k === key ? refuse() : real.call(this, k, v);
            } as never;
          }
        }, key);

      test("the edit mode cannot be stored: visual mode, and the switch works for the visit", async ({ page }) => {
        await block(page, "srs-web.essay.edit-mode");
        await load(page);
        await openVisual(page, 0);
        await leave(page);
        await toggle(page);
        await body(page, 0).click();
        await expect(body(page, 0)).toHaveAttribute("contenteditable", "plaintext-only");
      });

      // Writing then needs a sign-in: the name gate cannot keep a name (srs-web#828).
      test.describe("all of it", () => {
        test.use({ storageState: NO_ACTOR });
        test("a new essay still opens, with the switch off", async ({ page }) => {
          await narrow(page);
          await block(page);
          await page.goto("/?new=essay");
          await page.getByRole("button", { name: "Close", exact: true }).click(); // the first-run help
          await expect(page.locator(".essay-shell__page")).toBeVisible();
          await menu(page, "View");
          await expect(page.getByTestId("edit-markdown")).toHaveAttribute("aria-checked", "false");
        });
      });
    });
  });
}
