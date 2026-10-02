import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-editor.spec.ts — srs-web#328: the essay writing surface on a fixture repo built with
 * the srs CLI (build.417) from the essay package of muDemocracy.org#229 (see
 * fixtures/build-essay-fixture.sh). Fixture: essay "On small democracy" with paragraphs
 * Opening / Claim / (untitled "Third paragraph.") and a draft area holding "Spare".
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

const bodies = (page: Page) => page.locator(".essay-shell__page .block__body");
const layerLabels = (page: Page) => page.locator(".layers .layers__label");
const depthOf = (page: Page, text: string) =>
  page
    .locator(".essay-shell__page .block-stack__item", { hasText: text })
    .first()
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--depth"));

test("write, reorder, nest, hide, draft out and back", async ({ page }) => {
  await open(page);
  await expect(bodies(page)).toHaveText([
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  await expect(page.locator(".draft-tray")).toContainText("Spare");

  // type -> Ctrl+Enter creates a new paragraph after the current one, focused
  await bodies(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+Enter");
  await expect(bodies(page)).toHaveCount(4);
  await expect(bodies(page).nth(3)).toBeFocused();
  await page.keyboard.type("Fourth paragraph.");
  await bodies(page).nth(0).click(); // blur commits through the engine
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  await expect(bodies(page)).toHaveText([
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
    "Fourth paragraph.",
  ]);

  // keyboard reorder: Alt+ArrowUp on the Claim handle moves it above Opening
  const claimHandle = page.getByRole("button", { name: /^Move Claim\./ });
  await claimHandle.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(bodies(page).first()).toHaveText("Second paragraph.");
  await expect(claimHandle).toBeFocused();

  // native drag in the layers panel: drag "Fourth paragraph." onto the top of "Claim"
  await layerLabels(page)
    .filter({ hasText: "Fourth paragraph." })
    .dragTo(layerLabels(page).filter({ hasText: "Claim" }), { targetPosition: { x: 20, y: 1 } });
  await expect(bodies(page).first()).toHaveText("Fourth paragraph.");

  // nest: Alt+ArrowRight indents (layout depth); the group is shown nested in layers
  await page.getByRole("button", { name: /^Move Opening\./ }).focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => depthOf(page, "First paragraph.")).toBe("1");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(() => depthOf(page, "First paragraph.")).toBe("0");

  // Tab at the start of a block indents too
  await bodies(page).nth(3).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect.poll(() => depthOf(page, "Third paragraph.")).toBe("1");

  // hide follows Photoshop: hiding a parent hides its nested run; children show as hidden-by-parent
  const thirdEye = page.locator(".essay-shell__page .block-stack__item").nth(3).locator(".eye");
  await page.getByRole("button", { name: "Hide Opening", exact: true }).first().click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await expect(page.getByText("Hidden by parent")).toHaveCount(1);
  await expect(thirdEye).toBeDisabled();
  await expect(page.locator(".layers .eye--inherited")).toHaveCount(1);
  await expect(page.locator(".layers .eye.is-off")).toHaveCount(2);
  // unhiding the parent restores the child to its own state
  await page.getByRole("button", { name: "Show Opening", exact: true }).first().click();
  await expect(page.getByText("Hidden by parent")).toHaveCount(0);
  await expect(page.getByText("Hidden paragraph")).toHaveCount(0);
  // a directly hidden child stays hidden after the parent toggles
  await thirdEye.click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await page.getByRole("button", { name: "Hide Opening", exact: true }).first().click();
  await page.getByRole("button", { name: "Show Opening", exact: true }).first().click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await expect(page.getByText("Hidden by parent")).toHaveCount(0);
  await thirdEye.click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(0);

  // draft: pull out via the block action, then put back via the tray
  await page.getByRole("button", { name: /Move Claim to draft/ }).click();
  await expect(bodies(page)).toHaveCount(3);
  await expect(page.locator(".draft-tray")).toContainText("Claim");
  await page.getByRole("button", { name: "Put back Claim" }).click();
  await expect(bodies(page)).toHaveCount(4);

  // native drag from the tray into the essay (put back at a chosen position)
  await page
    .locator(".draft-tray__label", { hasText: "Spare" })
    .dragTo(page.locator(".essay-shell__page .block-stack__item").first(), {
      targetPosition: { x: 40, y: 2 },
    });
  await expect(bodies(page).first()).toHaveText("Drafted paragraph.");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
});

test("an MCP-side write re-renders the essay", async ({ page }) => {
  await page.route("https://relay.test/v1/channels", (route) =>
    route.fulfill({
      json: {
        channel: "c",
        callerUrl: "https://relay.test/v1/channels/c/call/CALLER",
        executorUrl: "wss://relay.test/v1/channels/c/executor/EXEC",
      },
    })
  );
  let toExecutor: (frame: unknown) => void = () => {};
  const replies = new Map<string, (r: { status: number; body?: string }) => void>();
  let executorUrl = "";
  await page.routeWebSocket(/relay\.test.*executor/, (ws) => {
    executorUrl = ws.url();
    toExecutor = (f) => ws.send(JSON.stringify(f));
    ws.onMessage((m) => {
      const f = JSON.parse(String(m));
      replies.get(f.requestId)?.(f.response);
    });
  });
  let n = 0;
  async function call(body: unknown) {
    const requestId = `req${++n}`;
    const generation = new URL(executorUrl).searchParams.get("generation") as string;
    const done = new Promise<{ status: number; body?: string }>((res) =>
      replies.set(requestId, res)
    );
    toExecutor({
      version: 1,
      type: "request",
      requestId,
      executorGeneration: generation,
      deadlineUnixMs: Date.now() + 30000,
      request: {
        method: "POST",
        contentType: "application/json",
        headers: {},
        body: Buffer.from(JSON.stringify(body)).toString("base64url"),
      },
    });
    const r = await done;
    return r.body ? JSON.parse(Buffer.from(r.body, "base64url").toString()) : undefined;
  }

  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await open(page);
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });

  await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "fake", version: "0" },
    },
  });
  await call({ jsonrpc: "2.0", method: "notifications/initialized" });
  const found = await call({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "find", arguments: { contentMatch: "Second paragraph" } },
  });
  const text = JSON.stringify(found);
  const id = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
  expect(id, text).toBeTruthy();
  const upd = await call({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "record_update",
      arguments: {
        instanceId: id,
        fieldValues: { paragraph_title: "Claim", body: "Rewritten by an agent." },
      },
    },
  });
  expect(upd.result.isError, JSON.stringify(upd)).not.toBe(true);

  await expect(bodies(page).nth(1)).toHaveText("Rewritten by an agent.");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
});
