import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { routeRelayChannels } from "./helpers";

/**
 * agent-reopen.spec.ts — srs-web#418: agent channels survive a reload. Agents open on a repository
 * reopen when it opens again (same channel, after the write guard), and the client's own
 * `initialize` is replayed into the fresh session; with none stored the call gets HTTP 404.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const OTHER = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay-empty.srsj");
const INIT_KEY = "srs-web.mcp-init.";

type Reply = { status: number; body: string };

/** Records every executor socket and every frame it receives; `rpc` drives the latest one. */
async function mockExecutor(page: Page) {
  const refuse = { next: false }; // close the next socket before it can serve
  const sockets: { url: string; send: (f: unknown) => void }[] = [];
  const replies = new Map<string, (r: Reply) => void>();
  const frames: string[] = []; // every request body the executor was sent, in order
  await page.routeWebSocket(/relay\.test.*executor/, (ws) => {
    if (refuse.next) {
      refuse.next = false;
      sockets.push({ url: ws.url(), send: () => {} });
      return void ws.close();
    }
    sockets.push({ url: ws.url(), send: (f) => ws.send(JSON.stringify(f)) });
    ws.onMessage((m) => {
      const f = JSON.parse(String(m));
      replies.get(f.requestId)?.({
        status: f.response.status,
        body: Buffer.from(f.response.body ?? "", "base64url").toString(),
      });
    });
  });
  let n = 0;
  async function raw(body: string): Promise<Reply> {
    const requestId = `req${++n}`;
    const sock = sockets[sockets.length - 1];
    const done = new Promise<Reply>((res) => replies.set(requestId, res));
    frames.push(body);
    sock.send({
      version: 1,
      type: "request",
      requestId,
      executorGeneration: new URL(sock.url).searchParams.get("generation"),
      deadlineUnixMs: Date.now() + 30000,
      request: {
        method: "POST",
        contentType: "application/json",
        headers: {},
        body: Buffer.from(body).toString("base64url"),
      },
    });
    return done;
  }
  const rpc = (method: string, params?: unknown) =>
    raw(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }));
  const notify = (method: string) => raw(JSON.stringify({ jsonrpc: "2.0", method }));
  const init = (name = "claude-code") =>
    rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name, version: "0" } });
  const json = (r: Reply) => JSON.parse(r.body);
  return { sockets, frames, rpc, notify, init, json, refuse };
}

async function openDoc(page: Page, file = ESSAY, pkg = "package-editor-essay") {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(file);
  await page.getByTestId(pkg).click();
}
const essayOpen = async (page: Page) => {
  await openDoc(page);
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
};

async function setup(page: Page) {
  let bootstraps = 0;
  page.on("request", (r) => r.url().endsWith("/v1/channels") && bootstraps++);
  await routeRelayChannels(page, { fixed: true });
  const ex = await mockExecutor(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("srs-web.mcp-relay-url"))
      localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test");
  });
  return { ...ex, bootstraps: () => bootstraps };
}
const connect = async (page: Page) => {
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
};
const status = (page: Page) => page.getByTestId("mcp-status");
const storedInits = (page: Page) =>
  page.evaluate(
    (p) => Object.keys(localStorage).filter((k) => k.startsWith(p)),
    INIT_KEY
  );

test("a reload reopens the connected agent on the same channel, with no click", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  const first = ex.sockets[0].url.split("?")[0];
  await page.reload();
  await essayOpen(page);
  await expect(status(page)).toHaveText("Connected", { timeout: 15000 });
  expect(ex.sockets[ex.sockets.length - 1].url.split("?")[0]).toBe(first);
  expect(ex.bootstraps()).toBe(1);
});

test("a different repository after the reload does not reopen the agent", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  const before = ex.sockets.length;
  await page.reload();
  await openDoc(page, OTHER);
  await page.waitForTimeout(2500);
  expect(ex.sockets.length).toBe(before);
  await expect(status(page)).toHaveCount(0);
});

test("a second tab does not open a channel the first holds", async ({ page, context }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  const second = await context.newPage();
  const ex2 = await mockExecutor(second);
  await routeRelayChannels(second, { fixed: true });
  await essayOpen(second);
  await expect(second.getByTestId("mcp-in-use")).toBeVisible();
  await second.waitForTimeout(2500); // past the one retry
  expect(ex2.sockets).toHaveLength(0);
  expect(ex.sockets).toHaveLength(1);
});

test("a disconnected agent is not reopened by a reload", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  await page.getByTestId("mcp-disconnect").first().click();
  const before = ex.sockets.length;
  await page.reload();
  await essayOpen(page);
  await page.waitForTimeout(2500);
  expect(ex.sockets.length).toBe(before);
  await expect(status(page)).toHaveCount(0);
});

test("after a reopen the write guard still refuses a guarded essay write", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  await ex.init();
  await page.reload();
  await essayOpen(page);
  await expect(status(page)).toHaveText("Connected", { timeout: 15000 });
  const paragraph = (await page
    .locator(".essay-shell__page .block-stack__item")
    .nth(1)
    .locator("[data-block-id]")
    .getAttribute("data-block-id")) as string;
  const call = async (name: string, args: unknown) =>
    ex.json(await ex.rpc("tools/call", { name, arguments: args }));
  const w = await call("record_update", {
    instanceId: paragraph,
    fieldValues: { paragraph_title: "x", body: "Rewritten." },
  });
  expect(JSON.stringify(w.result)).toContain("Rejected by the session write guard");
  const rec = await call("record_create", {
    type: "com.mudemocracy.essay/comment",
    fieldValues: { comment_text: "after reopen" },
  });
  expect(rec.result?.isError, JSON.stringify(rec)).not.toBe(true);
});

test("a reload replays the client's initialize: no re-initialize, the actor name is kept", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  await ex.init("claude-code");
  await ex.notify("notifications/initialized");
  const comment = async (text: string) => {
    const rec = ex.json(
      await ex.rpc("tools/call", {
        name: "record_create",
        arguments: { type: "com.mudemocracy.essay/comment", fieldValues: { comment_text: text } },
      })
    );
    expect(rec.result?.isError, JSON.stringify(rec)).not.toBe(true);
    return JSON.stringify(rec.result);
  };
  const before = await comment("before");
  const actorOf = (s: string) => /"name\\?":\\?"([^"\\]+)/.exec(s)?.[1];

  await page.reload();
  await essayOpen(page);
  await expect(status(page)).toHaveText("Connected", { timeout: 15000 });
  const frames = ex.frames.length;
  const list = await ex.rpc("tools/list");
  expect(list.status).toBe(200);
  expect(ex.json(list).result.tools.length).toBeGreaterThan(0);
  const after = await comment("after");
  expect(ex.frames.slice(frames).some((f) => f.includes('"initialize"') && !f.includes("tools/"))).toBe(false);
  expect(actorOf(before)).toBe("claude-code");
  expect(actorOf(after)).toBe("claude-code");

  // ordering variant: the notification arrives first after a reload
  await page.reload();
  await essayOpen(page);
  await expect(status(page)).toHaveText("Connected", { timeout: 15000 });
  await ex.notify("notifications/initialized");
  const again = await ex.rpc("tools/list");
  expect(again.status).toBe(200);
});

test("with nothing stored a call on a fresh session is 404, and initialize recovers", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  await ex.init();
  await page.evaluate((p) => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(p)) localStorage.removeItem(k);
  }, INIT_KEY);
  await page.reload();
  await essayOpen(page);
  await expect(status(page)).toHaveText("Connected", { timeout: 15000 });
  const list = await ex.rpc("tools/list");
  expect(list.status).toBe(404);
  expect(list.body).toContain("not initialized");
  expect((await ex.init()).status).toBe(200);
  expect((await ex.rpc("tools/list")).status).toBe(200);
});

test("a reopen refused by a lingering socket takes over exactly once; manual Connect never does", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  const takeovers = () => ex.sockets.filter((s) => s.url.includes("takeover=true")).length;

  // reload: the reopen's first socket is refused (the relay still holds the dead page's), then one takeover
  await page.reload();
  ex.refuse.next = true;
  await essayOpen(page);
  await expect(status(page)).toHaveText("Connected", { timeout: 15000 });
  expect(takeovers()).toBe(1);

  // a manual Connect that is refused stays refused
  await page.getByTestId("mcp-disconnect").first().click();
  await expect(page.getByTestId("mcp-library-connect")).toBeEnabled(); // right after Disconnect, no focus event
  await page.waitForTimeout(500); // and it stays enabled
  await expect(page.getByTestId("mcp-library-connect")).toBeEnabled();
  ex.refuse.next = true;
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(status(page)).toHaveText("Connection refused", { timeout: 15000 });
  await page.waitForTimeout(1500);
  expect(takeovers()).toBe(1);
  await expect(status(page)).toHaveText("Connection refused");
});

test("Rotate and Forget discard the stored initialize", async ({ page }) => {
  const ex = await setup(page);
  await essayOpen(page);
  await connect(page);
  await ex.init();
  expect(await storedInits(page)).toHaveLength(1);
  await page.getByTestId("agent-menu").first().click();
  await page.getByTestId("mcp-rotate").click();
  await expect.poll(() => storedInits(page)).toHaveLength(0);
  await expect(status(page)).toHaveText("Connected", { timeout: 15000 });
  await ex.init();
  expect(await storedInits(page)).toHaveLength(1);
  await page.getByTestId("agent-menu").first().click();
  await page.getByTestId("mcp-library-forget").click();
  await expect.poll(() => storedInits(page)).toHaveLength(0);
});
