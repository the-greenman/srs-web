import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * agent-channels.spec.ts — srs-web#358: one relay channel + MCP session per agent, each with its
 * own host-minted actor id; the write guard applies to every session; disconnecting one keeps
 * the others working. Fixture: essay.srsj (revision 9).
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const items = (page: Page) => page.locator(".essay-shell__page .block-stack__item");

test("two agents: distinct authors and ids, guard on both, disconnect leaves the other", async ({
  page,
}) => {
  let minted = 0;
  await page.route("https://relay.test/v1/channels", (route) => {
    const k = ++minted;
    return route.fulfill({
      json: {
        channel: `c${k}`,
        callerUrl: `https://relay.test/v1/channels/c${k}/call/CALLER${k}`,
        executorUrl: `wss://relay.test/v1/channels/c${k}/executor/EXEC${k}`,
      },
    });
  });
  const sockets = new Map<number, { send: (f: unknown) => void; url: string }>();
  const replies = new Map<string, (r: { status: number; body?: string }) => void>();
  await page.routeWebSocket(/relay\.test.*executor/, (ws) => {
    const k = Number(/EXEC(\d)/.exec(ws.url())?.[1]);
    sockets.set(k, { send: (f) => ws.send(JSON.stringify(f)), url: ws.url() });
    ws.onMessage((m) => {
      const f = JSON.parse(String(m));
      replies.get(f.requestId)?.(f.response);
    });
  });
  let n = 0;
  async function rpc(agent: number, method: string, params?: unknown) {
    const requestId = `req${++n}`;
    const sock = sockets.get(agent) as { send: (f: unknown) => void; url: string };
    const done = new Promise<{ status: number; body?: string }>((res) =>
      replies.set(requestId, res)
    );
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
        body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: n, method, params })).toString(
          "base64url"
        ),
      },
    });
    const r = await done;
    return JSON.parse(Buffer.from(r.body ?? "", "base64url").toString());
  }
  const tool = (a: number, name: string, args: unknown) =>
    rpc(a, "tools/call", { name, arguments: args });
  const init = (a: number, name: string) =>
    rpc(a, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name, version: "0" },
    });

  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });

  await page.getByTestId("mcp-connect-open").click();
  await page.getByTestId("mcp-connect-agent").click();
  await expect(page.getByTestId("mcp-status")).toHaveText(["Connected", "Connected"]);
  await expect(page.getByTestId("mcp-caller-url")).toHaveCount(2);
  const ids: string[] = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("srs-web.agent-connections") ?? "[]").map(
      (c: { id: string }) => c.id
    )
  );
  expect(new Set(ids).size).toBe(2);

  await init(1, "alpha");
  await init(2, "beta");
  const paragraph = (await items(page)
    .nth(1)
    .locator("[data-block-id]")
    .getAttribute("data-block-id")) as string;

  async function comment(agent: number, textValue: string) {
    const rec = await tool(agent, "record_create", {
      type: "com.mudemocracy.essay/comment",
      fieldValues: { comment_text: textValue },
    });
    expect(rec.result?.isError, JSON.stringify(rec)).not.toBe(true);
    const id = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(rec.result))?.[0] as string;
    const rel = await tool(agent, "relation_create", {
      relationType: "com.mudemocracy.essay/comments-on",
      sourceInstanceId: id,
      targetInstanceId: paragraph,
    });
    expect(rel.result?.isError, JSON.stringify(rel)).not.toBe(true);
    return JSON.stringify(rec);
  }
  const recA = await comment(1, "from alpha");
  const recB = await comment(2, "from beta");
  await items(page).nth(1).getByTestId("comment-badge").click();
  const c = items(page).nth(1).getByTestId("comment");
  await expect(c).toHaveCount(2);
  await expect(c.getByTestId("actor-name")).toHaveText(["alpha", "beta"]);
  expect(recA).toContain(ids[0]);
  expect(recB).toContain(ids[1]);

  // write guard on both sessions
  for (const a of [1, 2]) {
    const w = await tool(a, "record_update", {
      instanceId: paragraph,
      fieldValues: { paragraph_title: "x", body: "Rewritten." },
    });
    expect(JSON.stringify(w.result)).toContain("Rejected by the session write guard");
  }

  // disconnect agent 1: agent 2 keeps working
  await page.getByTestId("mcp-disconnect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveCount(1);
  // disconnect keeps the entry; forget removes it
  await expect(page.getByTestId("mcp-library-item")).toHaveCount(1);
  await page.getByTestId("mcp-library-forget").click();
  await expect(page.getByTestId("mcp-library-item")).toHaveCount(0);
  await comment(2, "beta again");
  await expect(c).toHaveCount(3);
  const left = await page.evaluate(
    () => JSON.parse(localStorage.getItem("srs-web.agent-connections") ?? "[]").length
  );
  expect(left).toBe(1); // agent 1 forgotten
});

test("reload keeps ids and URLs; a typed label is the author; repo change keeps both agents", async ({
  page,
}) => {
  let minted = 0;
  await page.route("https://relay.test/v1/channels", (route) => {
    const k = ++minted;
    return route.fulfill({
      json: {
        channel: `c${k}`,
        callerUrl: `https://relay.test/v1/channels/c${k}/call/CALLER${k}`,
        executorUrl: `wss://relay.test/v1/channels/c${k}/executor/EXEC${k}`,
      },
    });
  });
  const sockets = new Map<number, { send: (f: unknown) => void; url: string }>();
  const replies = new Map<string, (r: { status: number; body?: string }) => void>();
  await page.routeWebSocket(/relay\.test.*executor/, (ws) => {
    const k = Number(/EXEC(\d)/.exec(ws.url())?.[1]);
    sockets.set(k, { send: (f) => ws.send(JSON.stringify(f)), url: ws.url() });
    ws.onMessage((m) => {
      const f = JSON.parse(String(m));
      replies.get(f.requestId)?.(f.response);
    });
  });
  let n = 0;
  async function rpc(agent: number, method: string, params?: unknown) {
    const requestId = `req${++n}`;
    const sock = sockets.get(agent) as { send: (f: unknown) => void; url: string };
    const done = new Promise<{ status: number; body?: string }>((res) =>
      replies.set(requestId, res)
    );
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
        body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: n, method, params })).toString(
          "base64url"
        ),
      },
    });
    const r = await done;
    return JSON.parse(Buffer.from(r.body ?? "", "base64url").toString());
  }
  const open = async () => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
    await page.getByTestId("package-editor-essay").click();
    await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  };
  await page.addInitScript(() => {
    if (!localStorage.getItem("srs-web.mcp-relay-url"))
      localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test");
  });
  await open();
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await page.getByTestId("mcp-connect-open").click();
  await page.getByTestId("mcp-agent-label").fill("Labelled");
  await page.getByTestId("mcp-connect-agent").click();
  await expect(page.getByTestId("mcp-status")).toHaveText(["Connected", "Connected"]);
  const snapshot = async () => ({
    ids: await page.evaluate(() => localStorage.getItem("srs-web.agent-connections")),
    urls: await page
      .getByTestId("mcp-caller-url")
      .evaluateAll((e) => e.map((i) => (i as HTMLInputElement).value)),
  });
  const before = await snapshot();

  // reload: same ids and caller URLs (no new channels minted)
  const mintedBefore = minted;
  await open();
  await expect(page.getByTestId("mcp-status")).toHaveCount(0); // nothing auto-connects
  await page.getByTestId("mcp-library-connect").first().click();
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText(["Connected", "Connected"], {
    timeout: 15000,
  });
  expect(await snapshot()).toEqual(before);
  expect(minted).toBe(mintedBefore);

  // typed label is the stamped author (agent 2), while agent 1 uses its clientInfo.name
  const init = (a: number, name: string) =>
    rpc(a, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name, version: "0" },
    });
  const k = (a: number) => [...sockets.keys()].sort()[a - 1];
  await init(k(1), "alpha");
  await init(k(2), "ignored-handle");
  const paragraph = (await page
    .locator(".essay-shell__page .block-stack__item")
    .nth(1)
    .locator("[data-block-id]")
    .getAttribute("data-block-id")) as string;
  const comment = async (a: number, t: string) => {
    const rec = await rpc(k(a), "tools/call", {
      name: "record_create",
      arguments: { type: "com.mudemocracy.essay/comment", fieldValues: { comment_text: t } },
    });
    const id = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(rec.result))?.[0] as string;
    const rel = await rpc(k(a), "tools/call", {
      name: "relation_create",
      arguments: {
        relationType: "com.mudemocracy.essay/comments-on",
        sourceInstanceId: id,
        targetInstanceId: paragraph,
      },
    });
    expect(rel.result?.isError, JSON.stringify(rel)).not.toBe(true);
  };
  await comment(1, "one");
  await comment(2, "two");
  await page.locator(".essay-shell__page .block-stack__item").nth(1).getByTestId("comment-badge").click();
  await expect(
    page.locator(".essay-shell__page .block-stack__item").nth(1).getByTestId("actor-name")
  ).toHaveText(["alpha", "Labelled"]);

  // repo change: reopen the document (reload); reconnect both from the library
  await open();
  await page.getByTestId("mcp-library-connect").first().click();
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText(["Connected", "Connected"], {
    timeout: 15000,
  });
});

test("agent activity: connected count, chip in the feed, paragraph flashes, click focuses it", async ({
  page,
}) => {
  let minted = 0;
  await page.route("https://relay.test/v1/channels", (route) => {
    const k = ++minted;
    return route.fulfill({
      json: {
        channel: `c${k}`,
        callerUrl: `https://relay.test/v1/channels/c${k}/call/CALLER${k}`,
        executorUrl: `wss://relay.test/v1/channels/c${k}/executor/EXEC${k}`,
      },
    });
  });
  const sockets = new Map<number, { send: (f: unknown) => void; url: string }>();
  const replies = new Map<string, (r: { status: number; body?: string }) => void>();
  await page.routeWebSocket(/relay\.test.*executor/, (ws) => {
    const k = Number(/EXEC(\d)/.exec(ws.url())?.[1]);
    sockets.set(k, { send: (f) => ws.send(JSON.stringify(f)), url: ws.url() });
    ws.onMessage((m) => {
      const f = JSON.parse(String(m));
      replies.get(f.requestId)?.(f.response);
    });
  });
  let n = 0;
  async function rpc(agent: number, method: string, params?: unknown) {
    const requestId = `req${++n}`;
    const sock = sockets.get(agent) as { send: (f: unknown) => void; url: string };
    const done = new Promise<{ status: number; body?: string }>((res) =>
      replies.set(requestId, res)
    );
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
        body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: n, method, params })).toString(
          "base64url"
        ),
      },
    });
    const r = await done;
    return JSON.parse(Buffer.from(r.body ?? "", "base64url").toString());
  }
  const tool = (a: number, name: string, args: unknown) =>
    rpc(a, "tools/call", { name, arguments: args });

  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await page.getByTestId("mcp-connect-open").click();
  await page.getByTestId("mcp-connect-agent").click();
  await expect(page.getByTestId("mcp-status")).toHaveText(["Connected", "Connected"]);
  const agents = page.locator(".panel", { hasText: "Agents" }).first();
  await expect(agents.locator(".panel__aside")).toHaveText("2/2");

  await rpc(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "alpha", version: "0" },
  });
  const block = items(page).nth(1).locator("[data-block-id]");
  const paragraph = (await block.getAttribute("data-block-id")) as string;
  const rec = await tool(1, "record_create", {
    type: "com.mudemocracy.essay/comment",
    fieldValues: { comment_text: "noted" },
  });
  const id = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(rec.result))?.[0] as string;
  await tool(1, "relation_create", {
    relationType: "com.mudemocracy.essay/comments-on",
    sourceInstanceId: id,
    targetInstanceId: paragraph,
  });

  const feed = page.getByTestId("agent-feed-entry");
  await expect(feed).toHaveCount(2);
  await expect(feed.first().getByTestId("actor-name")).toHaveText("alpha");
  await expect(feed.first()).toContainText("linked");
  await expect(block).toHaveClass(/is-live/);

  await feed.first().getByTestId("agent-feed-focus").click();
  await expect(page.locator(`[data-focus-key="body:${paragraph}"]`)).toBeFocused();
});
