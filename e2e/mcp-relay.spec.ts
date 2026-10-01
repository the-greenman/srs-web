import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * mcp-relay.spec.ts — srs-web#307: the browser hosts the WASM MCP session behind
 * a (fake) generic relay. The fake relay speaks the relay wire protocol: it
 * pushes opaque request frames down the executor WebSocket and reads response
 * frames back. Asserts initialize -> tools/list -> read -> validated write,
 * that the write marks the document unsaved, and that nothing was persisted.
 */
const GALLERY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "gallery.srsj");
const b64 = (s: string) => Buffer.from(s).toString("base64url");

test("MCP caller drives the browser session through the relay", async ({ page }) => {
  const outbound: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost") && !r.url().startsWith("data:"))
      outbound.push(`${r.method()} ${r.url()}`);
  });
  await page.route("https://relay.test/v1/channels", (route) =>
    route.fulfill({
      json: {
        channel: "c",
        callerUrl: "https://relay.test/v1/channels/c/call/CALLER",
        executorUrl: "wss://relay.test/v1/channels/c/executor/EXEC",
      },
    })
  );

  type Frame = { requestId: string; executorGeneration: string };
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
  async function call(body: unknown): Promise<{ status: number; json?: any }> {
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
        body: b64(JSON.stringify(body)),
      },
    } satisfies Frame & Record<string, unknown>);
    const r = await done;
    return {
      status: r.status,
      json: r.body ? JSON.parse(Buffer.from(r.body, "base64url").toString()) : undefined,
    };
  }

  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(GALLERY);

  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await expect(page.getByTestId("mcp-caller-url")).toHaveValue(/\/call\/CALLER$/);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

  const init = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "fake", version: "0" },
    },
  });
  expect(init.status).toBe(200);
  expect(init.json.result.serverInfo).toBeTruthy();
  expect((await call({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);

  const tools = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = tools.json.result.tools.map((t: { name: string }) => t.name);
  expect(names).toEqual(expect.arrayContaining(["find", "note_create", "repo_validate"]));

  // Read: must not dirty the document.
  const find = await call({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "find", arguments: {} },
  });
  expect(find.json.result.isError).not.toBe(true);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

  // Validated write: lands in the working copy and marks it unsaved.
  const write = await call({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "note_create",
      arguments: { title: "Written over MCP", sections: [{ name: "body", content: "hello" }] },
    },
  });
  expect(write.json.error, JSON.stringify(write.json)).toBeUndefined();
  expect(write.json.result.isError, JSON.stringify(write.json)).not.toBe(true);
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();

  // Nothing was persisted anywhere: no provider or network write beyond the relay bootstrap.
  expect(outbound.filter((u) => !u.includes("relay.test"))).toEqual([]);
});

test("relay origin refusal on bootstrap surfaces invalid_origin", async ({ page }) => {
  await page.route("https://relay.test/v1/channels", (route) =>
    route.fulfill({ status: 400, json: { error: "invalid_origin" } })
  );
  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(GALLERY);
  await expect(page.getByTestId("mcp-status")).toHaveText("Connection failed", { timeout: 15000 });
  await expect(page.getByTestId("mcp-connection").getByRole("alert")).toContainText(
    "invalid_origin"
  );
});
