import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openPackageEditor } from "./helpers";

/**
 * agent-library.spec.ts — srs-web#442: relays and agents are user-managed libraries, and the agent
 * surface is always present. Every test starts on a fresh profile (playwright.config pins
 * VITE_MCP_RELAY_URL empty, so no relay exists unless a test adds one).
 */
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const ESSAY = path.join(FIXTURES, "essay.srsj");
const MUSRS = path.join(FIXTURES, "muSrs.srsj");

async function load(page: Page, file: string, width = 1280, editor = true) {
  await page.setViewportSize({ width: 1280, height: 800 }); // the package picker is hidden on a phone
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(file);
  if (file === ESSAY && editor) {
    await page.getByTestId("package-editor-essay").click();
    await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  }
  await page.setViewportSize({ width, height: 900 });
}

test.describe("Go > Agents…", () => {
  test("essay editor, no relay: the action focuses the panel's first control", async ({ page }) => {
    await load(page, ESSAY);
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page.getByTestId("toolbar-agents").click();
    await expect(page.getByTestId("agent-panel-empty")).toHaveText("No relay · Add a relay");
    await expect(page.getByTestId("relay-add-open")).toBeFocused(); // the first control
  });

  test("essay editor at a drawer width opens the inspector drawer showing the panel", async ({ page }) => {
    await load(page, ESSAY, 1000);
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page.getByTestId("toolbar-agents").click();
    await expect(page.getByTestId("shell-drawer-inspector")).toBeVisible();
    await expect(page.getByTestId("shell-drawer-inspector").getByTestId("agent-panel")).toBeVisible();
  });

  test("essay editor, narrow: the action is in the overflow menu", async ({ page }) => {
    await load(page, ESSAY, 390);
    await page.getByTestId("header-menu").click();
    await page.getByTestId("toolbar-agents").click();
    await expect(page.getByTestId("shell-drawer-inspector").getByTestId("agent-panel")).toBeVisible();
  });

  test("generic explorer, no relay: the action opens and focuses the dock", async ({ page }) => {
    await load(page, ESSAY, 1280, false); // no editor chosen: the generic explorer
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page.getByTestId("toolbar-agents").click();
    await expect(page.locator(".mcp-dock").getByTestId("agent-panel-empty")).toBeVisible();
    await expect(page.getByTestId("relay-add-open")).toBeFocused(); // the first control
  });

  test("a menu-less Topbar shell (Guides) still reaches the dock at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(MUSRS);
    await openPackageEditor(page, "guides");
    await page.setViewportSize({ width: 390, height: 800 });
    const dock = page.locator(".mcp-dock");
    await dock.getByText("Agents", { exact: true }).click(); // collapsed until a relay exists
    await expect(dock.getByTestId("agent-panel-empty")).toBeVisible();
    await dock.getByTestId("relay-label").fill("Phone relay");
    await dock.getByTestId("relay-url").fill("https://phone.test");
    await dock.getByTestId("relay-save").click();
    await expect(dock.getByTestId("relay-item")).toContainText("Phone relay");
    const b = (await dock.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
  });
});
