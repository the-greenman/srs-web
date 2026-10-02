import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-comments.spec.ts — srs-web#359: per-paragraph comment threads with RFC-046 authors.
 * The engine stamps `createdBy`; the UI only displays it. Fixture: essay.srsj (revision 9).
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}
async function reply(page: Page, paragraph: number, text: string, name?: string) {
  const thread = items(page).nth(paragraph);
  if (name) await thread.getByLabel("Your name").fill(name);
  await thread.getByLabel("Reply").fill(text);
  await thread.getByRole("button", { name: "Comment" }).click();
}

test("a human comment shows the human author", async ({ page }) => {
  await open(page);
  await reply(page, 0, "Nice opening.", "Ada");
  const c = items(page).nth(0).getByTestId("comment");
  await expect(c).toHaveCount(1);
  await expect(c.getByTestId("comment-author")).toHaveText("Ada");
  await expect(c.getByTestId("comment-kind")).toHaveText("human");
  await expect(c).toContainText("Nice opening.");
  // the name is remembered: the next reply no longer asks for it
  await expect(items(page).nth(0).getByLabel("Your name")).toHaveCount(0);
});

test("comments on two paragraphs stay separate and oldest first", async ({ page }) => {
  await open(page);
  await reply(page, 0, "first on one", "Ada");
  await expect(items(page).nth(0).getByTestId("comment")).toHaveCount(1);
  await reply(page, 1, "only on two");
  await reply(page, 0, "second on one");
  await expect(items(page).nth(0).getByTestId("comment")).toHaveCount(2);
  await expect(items(page).nth(0).locator(".comments__text")).toHaveText([
    "first on one",
    "second on one",
  ]);
  await expect(items(page).nth(1).locator(".comments__text")).toHaveText(["only on two"]);
  await expect(items(page).nth(2).getByTestId("comment")).toHaveCount(0);
});

test("an MCP-created comment shows the agent author, live", async ({ page }) => {
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
  async function rpc(method: string, params?: unknown) {
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
        body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: n, method, params })).toString(
          "base64url"
        ),
      },
    });
    const r = await done;
    return JSON.parse(Buffer.from(r.body ?? "", "base64url").toString());
  }
  const tool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });

  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await open(page);
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "agent-test", version: "0" },
  });
  const paragraph = (await items(page)
    .nth(1)
    .locator("[data-block-id]")
    .getAttribute("data-block-id")) as string;

  const rec = await tool("record_create", {
    type: "com.mudemocracy.essay/comment",
    fieldValues: { comment_text: "Consider rephrasing." },
  });
  expect(rec.result?.isError, JSON.stringify(rec)).not.toBe(true);
  const id = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(rec.result))?.[0] as string;
  const rel = await tool("relation_create", {
    relationType: "com.mudemocracy.essay/comments-on",
    sourceInstanceId: id,
    targetInstanceId: paragraph,
  });
  expect(rel.result?.isError, JSON.stringify(rel)).not.toBe(true);

  const c = items(page).nth(1).getByTestId("comment");
  await expect(c).toHaveCount(1);
  // name = the client's clientInfo.name (engine-filled); id = the host-minted relay id
  await expect(c.getByTestId("comment-author")).toHaveText("agent-test");
  const hostId = await page.evaluate(() => localStorage.getItem("srs-web.relay-agent-id"));
  expect(hostId).toMatch(/^agent:[0-9a-f-]{36}$/);
  expect(JSON.stringify(rec)).toContain(hostId as string);
  await expect(c.getByTestId("comment-kind")).toHaveText("ai");
  await expect(c).toContainText("Consider rephrasing.");
});
