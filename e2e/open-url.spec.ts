import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { acceptMigration, openMenu, routeRelayChannels } from "./helpers.js";

/**
 * open-url.spec.ts — srs-web#471: `?open=<https url>` opens an archive read-only through the same
 * loader as "From this device". The archive is served by a mocked https origin (CORS-open, like
 * semanticops.com/agents/semanticops.srs).
 */
const fx = (n: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", n);
const CORS = { "access-control-allow-origin": "*" };

async function serve(page: Page, url: string, file: string, type = "application/zip") {
  await page.route(url, (route) =>
    route.fulfill({ body: readFileSync(fx(file)), headers: { ...CORS, "content-type": type } })
  );
}

test("opens a .srs from a link read-only, names the host, clears the parameter", async ({ page }) => {
  const link = "https://semanticops.test/try/meeting.srs";
  await serve(page, link, "pagetest.srs");
  const requests: string[] = [];
  page.on("request", (r) => r.url() === link && requests.push(r.headers().cookie ?? "none"));
  await page.goto(`/?open=${encodeURIComponent(link)}`);
  await acceptMigration(page); // pagetest.srs predates revision 9; the migration is in memory, never saved
  await expect(page.getByTestId("generic-srs-shell")).toBeVisible({ timeout: 20000 });
  expect(requests).toEqual(["none"]);

  // the source is stated, read-only is stated, and the parameter left the address bar
  await expect(page.getByTestId("read-only-note")).toContainText("Opened from semanticops.test, read-only");
  expect(new URL(page.url()).search).toBe("");

  // content renders (the homepage composition) but is not editable: no editor, no Save, no package editors
  await page.getByRole("button", { name: /homepage/i }).first().click();
  await expect(page.getByTestId("document-full-preview").or(page.locator(".generic-preview"))).toBeVisible();
  await expect(page.getByTestId("blueprint-document-editor")).toHaveCount(0);
  await expect(page.getByTestId("save-document")).toHaveCount(0);
  await expect(page.locator('[data-testid^="package-editor-"]')).toHaveCount(0);

  // records open for reading, with no Edit fields
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await page.getByTestId("record-row").first().click();
  await expect(page.getByText("Select a record to inspect")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit fields" })).toHaveCount(0);

  // Save a copy… is a secondary action in the Document menu
  await openMenu(page, "Document");
  await expect(page.getByTestId("save-copy")).toBeVisible();
  // it downloads a copy (an ordinary archive) and the opened one stays read-only
  const download = page.waitForEvent("download");
  await page.getByTestId("save-copy").click();
  await page.getByTestId("save-to-local").click();
  expect((await download).suggestedFilename()).toMatch(/\.srs$/);
  await expect(page.getByTestId("read-only-note")).toBeVisible();
});

test("opens a .srsj from a link too, and a reload does not re-fetch", async ({ page }) => {
  const link = "https://semanticops.test/try/meeting.srsj";
  await serve(page, link, "gallery.srsj", "application/json");
  let fetches = 0;
  page.on("request", (r) => r.url() === link && fetches++);
  await page.goto(`/?open=${encodeURIComponent(link)}`);
  await expect(page.getByTestId("read-only-note")).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid^="package-editor-"]')).toHaveCount(0);
  expect(fetches).toBe(1);
  await page.reload();
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  expect(fetches).toBe(1);
});

test.describe("refusals", () => {
  const cases: [string, string, (p: Page) => Promise<void>, RegExp][] = [
    ["http link", "http://example.com/a.srs", async () => {}, /Only https/],
    [
      "html response",
      "https://semanticops.test/a.srs",
      (p) => p.route("https://semanticops.test/a.srs", (r) => r.fulfill({ body: "<html>", headers: CORS })),
      /not an SRS archive/,
    ],
    [
      "404",
      "https://semanticops.test/b.srs",
      (p) => p.route("https://semanticops.test/b.srs", (r) => r.fulfill({ status: 404, headers: CORS })),
      /404/,
    ],
    [
      "network or CORS failure",
      "https://semanticops.test/c.srs",
      (p) => p.route("https://semanticops.test/c.srs", (r) => r.abort()),
      /CORS/,
    ],
    [
      "too large",
      "https://semanticops.test/d.srs",
      (p) =>
        p.route("https://semanticops.test/d.srs", (r) =>
          r.fulfill({ body: "PK", headers: { ...CORS, "content-length": String(60 * 1024 * 1024) } })
        ),
      /50 MB/,
    ],
  ];
  for (const [name, link, setup, message] of cases) {
    test(`shows the error: ${name}`, async ({ page }) => {
      await setup(page);
      await page.goto(`/?open=${encodeURIComponent(link)}`);
      await expect(page.getByText(message)).toBeVisible({ timeout: 20000 });
      expect(new URL(page.url()).search).toBe("");
    });
  }
});

test("agent writes to a repository opened from a link are refused by the core guard", async ({ page }) => {
  const link = "https://semanticops.test/try/essay.srsj";
  await serve(page, link, "essay.srsj", "application/json");
  await routeRelayChannels(page, { fixed: true });
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
  const rpc = async (method: string, params?: unknown) => {
    const requestId = `req${++n}`;
    const done = new Promise<{ status: number; body?: string }>((res) => replies.set(requestId, res));
    toExecutor({
      version: 1,
      type: "request",
      requestId,
      executorGeneration: new URL(executorUrl).searchParams.get("generation"),
      deadlineUnixMs: Date.now() + 30000,
      request: {
        method: "POST",
        contentType: "application/json",
        headers: {},
        body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: n, method, params })).toString("base64url"),
      },
    });
    const r = await done;
    return JSON.parse(Buffer.from(r.body ?? "", "base64url").toString());
  };
  const tool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });
  await page.addInitScript(() => localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test"));

  await page.goto(`/?open=${encodeURIComponent(link)}`);
  await expect(page.getByTestId("read-only-note")).toBeVisible({ timeout: 20000 });
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake", version: "0" } });

  const found = await tool("find", { contentMatch: "First paragraph." });
  const id = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(found.result))?.[0] as string;
  expect(id).toBeTruthy();
  const w = await tool("record_update", { instanceId: id, fieldValues: { body: "Rewritten by agent." } });
  expect(w.result.isError, JSON.stringify(w)).toBe(true);
  expect(JSON.stringify(w)).toContain("Rejected by the session write guard");
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
});
