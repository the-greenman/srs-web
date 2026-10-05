import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openAdvanced, openPackageEditor, routeRelayChannels } from "./helpers";

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

/** Accept the executor WebSocket without serving requests: the row only needs to reach "Connected". */
const stubExecutors = (page: Page) => page.routeWebSocket(/relay2?\.test.*executor/, () => {});
const panel = (page: Page) => page.getByTestId("agent-panel");
async function addRelay(page: Page, label: string, url: string) {
  const open = page.getByTestId("relay-add-open");
  if ((await open.getAttribute("aria-expanded")) !== "true") await open.click();
  await page.getByTestId("relay-label").fill(label);
  await page.getByTestId("relay-url").fill(url);
  await page.getByTestId("relay-save").click();
}

test("fresh profile: the Agents panel is present with 'No relay' and 'Add a relay'", async ({
  page,
}) => {
  await load(page, ESSAY);
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId("agent-panel-empty")).toHaveText("No relay yet.");
  await expect(page.getByTestId("relay-add-open")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("mcp-library-item")).toHaveCount(0); // the seeded agent is hidden
});

test("a relay persists across reload; http is rejected inline", async ({ page }) => {
  await load(page, ESSAY);
  await addRelay(page, "Test relay", "http://relay.test");
  await expect(page.getByTestId("relay-error")).toContainText("https");
  await expect(page.getByTestId("relay-item")).toHaveCount(0);
  await page.getByTestId("relay-url").fill("https://relay.test");
  await page.getByTestId("relay-save").click();
  const item = page.getByTestId("relay-item");
  await expect(item).toContainText("Test relay");
  await expect(item).toContainText("https://relay.test");
  await expect(item).toContainText("Default");
  await page.reload();
  await load(page, ESSAY);
  await expect(page.getByTestId("relay-item")).toContainText("Test relay");
  await expect(page.getByTestId("agent-panel-empty")).toHaveCount(0);
});

test("connect an agent through a relay, rename it, disconnect, forget", async ({ page }) => {
  await routeRelayChannels(page);
  await stubExecutors(page);
  await load(page, ESSAY);
  await addRelay(page, "Test relay", "https://relay.test");
  // the first-run agent is bound to the relay as soon as one exists
  await page.getByTestId("mcp-library-connect").click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await openAdvanced(page);
  await expect(page.getByTestId("mcp-caller-url")).toHaveValue(
    /relay\.test\/v1\/channels\/c1\/call\/CALLER1/
  );
  await page.getByTestId("mcp-disconnect").click();
  const row = page.getByTestId("mcp-library-item");
  await row.getByTestId("agent-menu").click();
  await page.getByTestId("agent-rename").click();
  await page.getByTestId("agent-rename-input").fill("Scribe");
  await page.getByTestId("agent-rename-input").press("Enter");
  await expect(row).toContainText("Scribe");
  await expect(row).toContainText("Test relay");
  await row.getByTestId("agent-menu").click();
  await page.getByTestId("mcp-library-forget").click();
  await expect(page.getByTestId("toast")).toContainText("Agent forgotten");
  await expect(page.getByTestId("mcp-library-item")).toHaveCount(0);
});

test("two relays and two agents are distinct; a relay with agents cannot be removed", async ({
  page,
}) => {
  await routeRelayChannels(page);
  await routeRelayChannels(page, { host: "relay2.test" });
  await stubExecutors(page);
  await load(page, ESSAY);
  await addRelay(page, "Alpha relay", "https://relay.test");
  await addRelay(page, "Beta relay", "https://relay2.test");
  await expect(page.getByTestId("relay-item")).toHaveCount(2);
  await page.getByTestId("mcp-connect-open").click();
  await page.getByTestId("mcp-agent-label").fill("Second");
  await page.getByTestId("mcp-agent-relay").selectOption({ label: "Beta relay" });
  await page.getByTestId("mcp-connect-agent").click();
  await page
    .getByTestId("mcp-library-item")
    .filter({ hasNotText: "Second" })
    .getByTestId("mcp-library-connect")
    .click(); // the first-run agent, on Alpha
  await expect(page.getByTestId("mcp-status")).toHaveText(["Connected", "Connected"], {
    timeout: 15000,
  });
  const rows = page.getByTestId("mcp-agent-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Second" })).toContainText("Beta relay");
  await expect(rows.filter({ hasNotText: "Second" })).toContainText("Alpha relay");

  const beta = page.getByTestId("relay-item").filter({ hasText: "Beta relay" });
  await beta.getByTestId("relay-menu").click();
  await page.getByTestId("relay-menu-remove").click();
  await expect(beta.getByTestId("relay-row-error")).toContainText("Forget its 1 agent first.");
  await expect(page.getByTestId("relay-item")).toHaveCount(2);

  await rows.filter({ hasText: "Second" }).getByTestId("agent-menu").click();
  await page.getByTestId("mcp-library-forget").click();
  await beta.getByTestId("relay-menu").click();
  await page.getByTestId("relay-menu-remove").click();
  await expect(page.getByTestId("relay-item")).toHaveCount(1);
});

test("the legacy srs-web.mcp-relay-url key seeds a relay (the documented e2e/dev seed)", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await load(page, ESSAY);
  await expect(page.getByTestId("relay-item")).toContainText("https://relay.test");
  await expect(page.getByTestId("agent-panel-empty")).toHaveCount(0);
});

test.describe("Go > Agents…", () => {
  test("essay editor, no relay: the action focuses the panel's first control", async ({ page }) => {
    await load(page, ESSAY);
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page.getByTestId("toolbar-agents").click();
    await expect(page.getByTestId("agent-panel-empty")).toHaveText("No relay yet.");
    await expect(page.getByTestId("relay-add-open")).toBeFocused(); // the first control
  });

  test("essay editor at a drawer width opens the inspector drawer showing the panel", async ({
    page,
  }) => {
    await load(page, ESSAY, 1000);
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await page.getByTestId("toolbar-agents").click();
    await expect(page.getByTestId("shell-drawer-inspector")).toBeVisible();
    await expect(
      page.getByTestId("shell-drawer-inspector").getByTestId("agent-panel")
    ).toBeVisible();
  });

  test("essay editor, narrow: the action is in the overflow menu", async ({ page }) => {
    await load(page, ESSAY, 390);
    await page.getByTestId("header-menu").click();
    await page.getByTestId("toolbar-agents").click();
    await expect(
      page.getByTestId("shell-drawer-inspector").getByTestId("agent-panel")
    ).toBeVisible();
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
    const b = await dock.boundingBox();
    if (!b) throw new Error("dock has no box");
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
  });
});
