import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { closeMenus, commentsState, menuItem, openMenu, openMenus } from "./helpers";

/**
 * essay-toolbar.spec.ts — srs-web#423: the essay header is the generic Toolbar. One registry, one
 * renderer: labelled menus at 1440, icon-only at 768, title + Save + one overflow at 390.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
async function open(page: Page, width: number) {
  await page.setViewportSize({ width: 1280, height: 800 }); // the package picker is hidden on a phone
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  await page.setViewportSize({ width, height: 900 });
}

for (const width of [1440, 768]) {
  test(`${width}: Document, View, Go and Help are reachable; the bar is one row`, async ({ page }) => {
    await open(page, width);
    const bar = page.getByTestId("toolbar");
    for (const n of ["Document", "View", "Go"]) {
      await expect(page.getByRole("button", { name: n, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Markdown help", exact: true })).toBeVisible();
    // Save only exists for a writable document (a loaded .srsj is not); Toolbar.test and EssayShell.test cover it.
    expect((await bar.boundingBox())!.height).toBeLessThan(72);
    // title and every menu share one row
    const ys = await Promise.all(
      [bar.locator(".toolbar__title"), page.getByTestId("toolbar-menu-view")].map(
        async (l) => {
          const b = (await l.boundingBox())!;
          return b.y + b.height / 2;
        }
      )
    );
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(24);
  });

  test(`${width}: Wide and Comments are menuitemcheckbox; Comments shows mixed`, async ({ page }) => {
    await open(page, width);
    await openMenu(page, "View");
    const margin = page.getByTestId("margin-variant");
    const comments = page.getByTestId("comment-mode");
    await expect(margin).toHaveAttribute("role", "menuitemcheckbox");
    await expect(comments).toHaveAttribute("role", "menuitemcheckbox");
    await expect(margin).toHaveAttribute("aria-checked", "false");
    await margin.click();
    await expect(margin).toHaveAttribute("aria-checked", "true"); // View stays open on toggle
    await expect(page.locator(".app")).toHaveAttribute("data-margin", "expanded");
    await closeMenus(page);
    await items(page).nth(1).getByTestId("comment-badge").click();
    expect(await commentsState(page)).toBe("mixed");
    await menuItem(page, "View", "comment-mode"); // mixed -> all
    expect(await commentsState(page)).toBe("true");
    await menuItem(page, "View", "comment-mode"); // all -> none
    expect(await commentsState(page)).toBe("false");
  });

  test(`${width}: Escape closes a menu and returns focus to its trigger`, async ({ page }) => {
    await open(page, width);
    for (const n of ["Document", "View", "Go"] as const) {
      const trigger = page.getByRole("button", { name: n, exact: true });
      await trigger.click();
      await expect(openMenus(page)).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(openMenus(page)).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  });
}

test("390: the bar is title, Save and one overflow; every action is in it", async ({ page }) => {
  await open(page, 390);
  const bar = page.getByTestId("toolbar");
  // title + one overflow + the inspector trigger (the rail is a drawer on a phone) (+ Save when the document is writable; a loaded .srsj is not)
  await expect(bar.getByRole("button")).toHaveCount(2 + (await page.getByTestId("save-document").count()));
  await expect(page.getByTestId("header-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "Document", exact: true })).toHaveCount(0);
  expect((await bar.boundingBox())!.height).toBeLessThan(72);
  await page.getByTestId("header-menu").click();
  for (const id of ["new-document", "copy-document", "toolbar-export", "margin-variant", "comment-mode", "toolbar-other", "toolbar-help"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
});

// Every action the old ribbon had stays reachable by role and name at each width.
const OLD_TEN: [string, string, "Document" | "View" | "Go" | null][] = [
  ["New document", "new-document", "Document"],
  ["Copy document", "copy-document", "Document"],
  ["Copy for agent", "copy-for-agent", "Document"],
  ["Export", "toolbar-export", "Document"],
  ["Export markdown", "export-markdown", "Document"],
  ["Wide", "margin-variant", "View"],
  ["Comments", "comment-mode", "View"],
  ["Explorer", "toolbar-explorer", "Go"],
  ["Open another", "toolbar-other", "Go"],
  ["Markdown help", "toolbar-help", null],
];
for (const width of [1440, 768, 390]) {
  test(`${width}: all ten previous header actions are reachable by name`, async ({ page }) => {
    await open(page, width);
    for (const [name, testid, group] of OLD_TEN) {
      if (width === 390) await page.getByTestId("header-menu").click();
      else if (group) await openMenu(page, group);
      const target =
        width !== 390 && !group
          ? page.getByRole("button", { name, exact: true })
          : page.getByRole(/wide|comment/i.test(name) ? "menuitemcheckbox" : "menuitem", { name, exact: true });
      if (name === "Explorer" && (await page.getByTestId(testid).count()) === 0) {
        await closeMenus(page); // no Explorer in this host
        continue;
      }
      await expect(target, name).toBeVisible();
      await closeMenus(page);
    }
  });
}

test("390: Help from the overflow opens the Help popover and keeps focus inside it", async ({ page }) => {
  await open(page, 390);
  await page.getByTestId("header-menu").click();
  await page.getByTestId("toolbar-help").click();
  const help = page.getByRole("region", { name: "Markdown cheat-sheet" });
  await expect(help).toBeVisible();
  await expect(openMenus(page)).toHaveCount(1);
  // the overflow's close must not pull focus back to its trigger while Help is open
  await page.waitForTimeout(300);
  await expect(page.getByTestId("header-menu")).not.toBeFocused();
  await expect(help).toBeVisible();
});
