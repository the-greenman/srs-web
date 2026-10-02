import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-write-guard.spec.ts — srs-web#356: the essay editor declares the engine write guard
 * (srs-rust#1165). Through the real relay + WASM session: agents cannot write essay text,
 * may fill an empty paragraph_title once, and may comment (new record + relation).
 */
const bodies = (page: Page) => page.locator(".essay-shell__page .block__body");
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}
type Rpc = {
  error?: unknown;
  result: { serverInfo?: unknown; tools?: { name: string }[]; isError?: boolean };
};
const b64 = (s: string) => Buffer.from(s).toString("base64url");

test("agent writes cannot change the essay text but can comment", async ({ page }) => {
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
  async function rpc(method: string, params?: unknown): Promise<Rpc> {
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
        body: b64(JSON.stringify({ jsonrpc: "2.0", id: n, method, params })),
      },
    });
    const r = await done;
    return JSON.parse(Buffer.from(r.body ?? "", "base64url").toString());
  }
  const tool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });
  const text = (r: Rpc) => JSON.stringify(r.result);

  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await open(page);
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "fake", version: "0" },
  });

  const idOf = async (i: number) =>
    (await page
      .locator(".essay-shell__page [data-block-id]")
      .nth(i)
      .getAttribute("data-block-id")) as string;
  const opening = await idOf(0);
  const third = await idOf(2);
  expect(opening && third).toBeTruthy();

  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

  // body write: rejected by the engine; text unchanged, document not dirty
  const w = await tool("record_update", {
    instanceId: opening,
    fieldValues: { paragraph_title: "Opening", body: "Rewritten by agent." },
  });
  expect(w.result.isError, text(w)).toBe(true);
  expect(text(w)).toContain("Rejected by the session write guard");
  await expect(bodies(page).first()).toHaveText("First paragraph.");
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

  // title: fillable while empty, rejected once set
  const fill = (title: string) =>
    tool("record_update", {
      instanceId: third,
      fieldValues: { body: "Third paragraph.", paragraph_title: title },
    });
  const filled = await fill("Closing");
  expect(filled.result.isError, text(filled)).not.toBe(true);
  expect(text(await fill("Changed"))).toContain("Rejected by the session write guard");

  // comment: a new record plus a relation to the paragraph succeeds
  const note = await tool("note_create", {
    title: "Comment",
    sections: [{ name: "body", content: "Consider rephrasing." }],
  });
  expect(note.result.isError, text(note)).not.toBe(true);
  const noteId = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(text(note))?.[0] as string;
  const rel = await tool("relation_create", {
    relationType: "refines",
    sourceInstanceId: noteId,
    targetInstanceId: opening,
  });
  expect(rel.result.isError, text(rel)).not.toBe(true);
});
