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
/** Threads are hidden by default (srs-web#364): open one via its margin badge. */
async function openThread(page: Page, paragraph: number) {
  const badge = items(page).nth(paragraph).getByTestId("comment-badge");
  if ((await badge.getAttribute("aria-expanded")) !== "true") await badge.click();
}
async function reply(page: Page, paragraph: number, text: string, name?: string) {
  const thread = items(page).nth(paragraph);
  await openThread(page, paragraph);
  if (name) await thread.getByLabel("Your name").fill(name);
  await thread.getByLabel("Reply").fill(text);
  await thread.getByRole("button", { name: "Comment", exact: true }).click();
}

test("a human comment shows the human author", async ({ page }) => {
  await open(page);
  await reply(page, 0, "Nice opening.", "Ada");
  const c = items(page).nth(0).getByTestId("comment");
  await expect(c).toHaveCount(1);
  await expect(c.getByTestId("actor-name")).toHaveText("Ada");
  await expect(c.getByTestId("actor-kind")).toHaveText("human");
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
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "agent-test", version: "0" },
  });
  await reply(page, 1, "human first", "Ada");
  await expect(items(page).nth(1).getByTestId("comment")).toHaveCount(1);
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

  const both = items(page).nth(1).getByTestId("comment");
  await expect(both).toHaveCount(2);
  // the human reply keeps its author after the agent wrote (independent actors, srs-rust#1174)
  await expect(both.nth(0).getByTestId("actor-name")).toHaveText("Ada");
  await expect(both.nth(0).getByTestId("actor-kind")).toHaveText("human");
  const c = both.nth(1);
  // name = the client's clientInfo.name (engine-filled); id = the host-minted relay id
  await expect(c.getByTestId("actor-name")).toHaveText("agent-test");
  const hostId = await page.evaluate(
    () => JSON.parse(localStorage.getItem("srs-web.agent-connections") ?? "[]")[0]?.id
  );
  expect(hostId).toMatch(/^agent:[0-9a-f-]{36}$/);
  expect(JSON.stringify(rec)).toContain(hostId as string);
  await expect(c.getByTestId("actor-kind")).toHaveText("ai");
  await expect(c).toContainText("Consider rephrasing.");
});

test("threads are hidden by default; the badge shows the count and opens one; comment mode shows all", async ({ page }) => {
  await open(page);
  await reply(page, 0, "one", "Ada");
  await expect(items(page).nth(0).getByTestId("comment-badge")).toHaveText("1");
  await items(page).nth(0).getByTestId("comment-badge").click(); // close
  await expect(page.getByTestId("comment-thread")).toHaveCount(0);
  await page.getByTestId("comment-mode").click();
  await expect(page.getByTestId("comment-thread")).toHaveCount(await items(page).count());
});

test("zoom shows one paragraph with its thread; Esc returns", async ({ page }) => {
  await open(page);
  const total = await items(page).count();
  await items(page).nth(1).hover(); // the idle tool stack ignores the pointer (it overlays the next paragraph)
  await items(page).nth(1).getByRole("button", { name: /^Zoom to/ }).click({ force: true });
  await expect(items(page)).toHaveCount(1);
  await expect(page.getByTestId("comment-thread")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(items(page)).toHaveCount(total);
});

test("addresses: deep link zooms, Back leaves zoom, copy link carries the paragraph id (srs-web#373)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const total = await items(page).count();
  const id = (await items(page).nth(1).locator(".block").getAttribute("data-block-id"))!;
  await items(page).nth(1).hover(); // the idle tool stack ignores the pointer (it overlays the next paragraph)
  await items(page).nth(1).getByRole("button", { name: /^Copy link to/ }).click({ force: true });
  await expect(page.getByTestId("address-notice")).toHaveText(/Link copied/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`p=${id}`);

  await items(page).nth(1).hover(); // the idle tool stack ignores the pointer (it overlays the next paragraph)
  await items(page).nth(1).getByRole("button", { name: /^Zoom to/ }).click({ force: true });
  await expect(items(page)).toHaveCount(1);
  const zoomed = page.url();
  expect(zoomed).toContain(`z=${id}`);
  await page.goBack();
  await expect(items(page)).toHaveCount(total);

  // A fresh load of a zoomed URL comes back zoomed.
  await page.goto("about:blank");
  await page.goto(zoomed);
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(items(page)).toHaveCount(1);
});

// srs-web#431 / #432: one thread-visibility state.
const threads = (page: Page) => page.getByTestId("comment-thread");
const badge = (page: Page, n: number) => items(page).nth(n).getByTestId("comment-badge");
const eye = async (page: Page, n: number) => {
  await items(page).nth(n).hover();
  await items(page).nth(n).locator(".eye").click({ force: true });
};

test("Comments: show all, then hide all; the header reflects all, mixed and none", async ({ page }) => {
  await open(page);
  const total = await items(page).count();
  const btn = page.getByTestId("comment-mode");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await btn.click();
  await expect(threads(page)).toHaveCount(total);
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await badge(page, 0).click(); // close one: the others stay
  await expect(threads(page)).toHaveCount(total - 1);
  await expect(btn).toHaveAttribute("aria-pressed", "mixed");
  await btn.click(); // mixed -> show all
  await expect(threads(page)).toHaveCount(total);
  await btn.click();
  await expect(threads(page)).toHaveCount(0);
  await expect(btn).toHaveAttribute("aria-pressed", "false");
});

test("a thread opened by its badge is gone after Comments on then off", async ({ page }) => {
  await open(page);
  await badge(page, 1).click();
  await expect(threads(page)).toHaveCount(1);
  await page.getByTestId("comment-mode").click(); // mixed -> all
  await page.getByTestId("comment-mode").click(); // all -> none
  await expect(threads(page)).toHaveCount(0);
});

test("posting keeps the thread open and the badge still closes it", async ({ page }) => {
  await open(page);
  await reply(page, 0, "stays", "Ada");
  await expect(items(page).nth(0).getByTestId("comment")).toHaveCount(1);
  await expect(threads(page)).toHaveCount(1);
  await badge(page, 0).click();
  await expect(threads(page)).toHaveCount(0);
});

test("a zoomed paragraph opens its thread, which can be closed", async ({ page }) => {
  await open(page);
  await items(page).nth(1).hover();
  await items(page).nth(1).getByRole("button", { name: /^Zoom to/ }).click({ force: true });
  await expect(threads(page)).toHaveCount(1);
  await badge(page, 0).click();
  await expect(threads(page)).toHaveCount(0);
});

test("a hidden paragraph shows no thread; unhiding brings it back", async ({ page }) => {
  await open(page);
  await badge(page, 0).click();
  await expect(threads(page)).toHaveCount(1);
  await eye(page, 0);
  await expect(threads(page)).toHaveCount(0);
  await page.locator(".layers").getByRole("button", { name: "Show Opening", exact: true }).click();
  await expect(threads(page)).toHaveCount(1);
});

test("hiding the parent hides a child's open thread", async ({ page }) => {
  await open(page);
  await items(page).nth(1).locator(".block__render, .block__body").first().click();
  await page.keyboard.press("Alt+ArrowRight"); // nest paragraph 2 under paragraph 1
  await badge(page, 1).click();
  await expect(threads(page)).toHaveCount(1);
  await eye(page, 0);
  await expect(threads(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Show Opening", exact: true }).first().click();
  await expect(threads(page)).toHaveCount(1);
});

test("hide one, show all, hide all, unhide it: its thread stays closed (hidden state untouched both ways)", async ({ page }) => {
  await open(page);
  await eye(page, 0);
  await page.getByTestId("comment-mode").click(); // show all: only the paragraphs in view
  await page.getByTestId("comment-mode").click(); // hide all
  await expect(threads(page)).toHaveCount(0);
  await page.locator(".layers").getByRole("button", { name: "Show Opening", exact: true }).click();
  await expect(threads(page)).toHaveCount(0);
});

test("show all while zoomed opens only the threads in view", async ({ page }) => {
  await open(page);
  await items(page).nth(1).hover();
  await items(page).nth(1).getByRole("button", { name: /^Zoom to/ }).click({ force: true });
  await badge(page, 0).click(); // close the zoom thread
  await page.getByTestId("comment-mode").click();
  await expect(threads(page)).toHaveCount(await items(page).count());
  await page.keyboard.press("Escape");
  const total = await items(page).count();
  await expect(threads(page)).toHaveCount(1); // the rest were never opened
  expect(total).toBeGreaterThan(1);
});

test("a hidden paragraph renders no margin at all", async ({ page }) => {
  await open(page);
  await eye(page, 0);
  await expect(items(page).nth(0).locator(".block__margin")).toHaveCount(0);
  await expect(badge(page, 0)).toHaveCount(0);
  await expect(threads(page)).toHaveCount(0);
});

test("deep link into a zoomed paragraph opens its thread, which the badge closes", async ({ page }) => {
  await open(page);
  await items(page).nth(1).hover();
  await items(page).nth(1).getByRole("button", { name: /^Zoom to/ }).click({ force: true });
  const zoomed = page.url();
  await page.goto("about:blank");
  await page.goto(zoomed);
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(items(page)).toHaveCount(1);
  await expect(threads(page)).toHaveCount(1);
  await badge(page, 0).click();
  await expect(threads(page)).toHaveCount(0);
});

test("Hide comments at the bottom closes the thread, focuses the badge and updates the header", async ({ page }) => {
  await open(page);
  await badge(page, 1).click();
  await expect(page.getByTestId("comment-mode")).toHaveAttribute("aria-pressed", "mixed");
  await items(page).nth(1).getByRole("button", { name: "Hide comments" }).click();
  await expect(threads(page)).toHaveCount(0);
  await expect(badge(page, 1)).toHaveAttribute("aria-expanded", "false");
  await expect(badge(page, 1)).toBeFocused();
  await expect(page.getByTestId("comment-mode")).toHaveAttribute("aria-pressed", "false");
});
