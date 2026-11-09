import http from "node:http";
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { navItem, newRecord, openPackageEditor, routeRelayChannels } from "./helpers";

/**
 * spike-transcript-transport.spec.ts — semanticops.com#59: how should a live transcript reach the open governance
 * editor? (a) server-sent events from the local engine on 127.0.0.1, or (b) MCP writes through the relay into the
 * tab's own session. Both replay the same cues (the transcribe lab fixture, no whisper) at the same rate while a
 * person types a minute, and print one JSON line of numbers each. A spike: it measures, it asserts only that the
 * typed text survives. Run: SPIKE=1 SPIKE_SPEED=5 npx playwright test e2e/spike-transcript-transport.spec.ts --workers 1
 */
const TIMELINE = process.env.SPIKE_TIMELINE ?? path.join(os.homedir(), "dev/semanticops/transcribe/fixtures/meeting.timeline.json");
const SPEED = Number(process.env.SPIKE_SPEED ?? 5);
const GALLERY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "gallery.srsj");
type Cue = { n: number; id: string; start: number; end: number; text: string };
const cues: Cue[] = existsSync(TIMELINE)
  ? JSON.parse(readFileSync(TIMELINE, "utf8")).turns.map((t: { start: number; end: number; text: string }, i: number) => ({ n: i + 1, id: `s-${i + 1}`, start: t.start, end: t.end, text: t.text }))
  : [];
const at = (c: Cue) => (c.end / SPEED) * 1000; // a cue is sent when its speech ends, at SPEED× real time
const MINUTE = "Agreed to apply for the parish grant; Priya drafts it by Friday. ";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, median: s[s.length >> 1] ?? null, p90: s[Math.floor(s.length * 0.9)] ?? null, max: s.at(-1) ?? null };
};

// A spike, not a regression test: it runs only on request, on a machine with the transcribe fixture.
test.skip(!process.env.SPIKE, "spike: run with SPIKE=1");
test.skip(!cues.length, `no fixture at ${TIMELINE} (node ~/dev/semanticops/transcribe/fixtures/make-audio.mjs)`);
test.describe.configure({ mode: "serial", timeout: 180_000 });

async function openGovernance(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(GALLERY);
  await openPackageEditor(page, "governance");
  await expect(navItem(page, /Decision Log/)).toBeVisible({ timeout: 5000 });
}
// The minute being typed: a new decision's first text field, typed into one key at a time while cues arrive.
async function startMinute(page: Page) {
  await navItem(page, /Decision Log/).click();
  await newRecord(page);
  const field = page.getByTestId("record-form").locator("input[type=text], textarea").first();
  await expect(field).toBeVisible({ timeout: 5000 });
  await field.click();
  return field;
}
async function typeFor(page: Page, ms: number) {
  let typed = "";
  for (const t0 = Date.now(); Date.now() - t0 < ms; ) { const ch = MINUTE[typed.length % MINUTE.length]; await page.keyboard.type(ch); typed += ch; await sleep(120); }
  return typed;
}
// Main-thread blocking in the tab: the sum and the worst of long tasks (> 50 ms) while the cues arrive.
const watchLongTasks = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __long: number[] }; w.__long = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(e.duration); }).observe({ type: "longtask", buffered: false });
});
const longTasks = (page: Page) => page.evaluate(() => (window as unknown as { __long: number[] }).__long);

// The engine's format (transcribe serve.mjs): `event: cue` {n, id, start, end, text}, then `event: end`.
function sseServer() {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin ?? "*";
    const cors = { "access-control-allow-origin": origin, vary: "Origin", "access-control-allow-private-network": "true" };
    if (req.method === "OPTIONS") { res.writeHead(204, { ...cors, "access-control-allow-methods": "GET" }); return res.end(); }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", ...cors });
    const t0 = Date.now(), timers = cues.map((c) => setTimeout(() => res.write(`event: cue\ndata: ${JSON.stringify({ ...c, sentAt: Date.now() })}\n\n`), at(c)));
    timers.push(setTimeout(() => { res.write(`event: end\ndata: {"t":${Date.now() - t0}}\n\n`); res.end(); }, at(cues.at(-1) as Cue) + 200));
    req.on("close", () => timers.forEach(clearTimeout));
  });
  return new Promise<{ url: string; close: () => void }>((r) => server.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}/cues`, close: () => server.close() })));
}

test("(a) server-sent events from 127.0.0.1 into the governance editor", async ({ page }) => {
  const sse = await sseServer();
  try {
    await openGovernance(page);
    const field = await startMinute(page);
    await watchLongTasks(page);
    // Stand-in for the meeting panel (srs-web#768 is not built): append each cue to the page and note when it showed.
    await page.evaluate((url) => {
      const w = window as unknown as { __delays: number[]; __done: boolean; __error: string | null };
      w.__delays = []; w.__done = false; w.__error = null;
      const panel = Object.assign(document.createElement("ol"), { id: "spike-panel" }); document.body.append(panel);
      const es = new EventSource(url);
      es.addEventListener("cue", (e) => { const c = JSON.parse((e as MessageEvent).data); panel.append(Object.assign(document.createElement("li"), { textContent: c.text })); w.__delays.push(Date.now() - c.sentAt); });
      es.addEventListener("end", () => { w.__done = true; es.close(); });
      es.onerror = () => { if (!w.__done) w.__error = "eventsource error"; };
    }, sse.url);
    const typed = await typeFor(page, at(cues.at(-1) as Cue));
    await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done, null, { timeout: 30000 });
    const r = await page.evaluate(() => { const w = window as unknown as { __delays: number[]; __error: string | null }; return { delays: w.__delays, error: w.__error }; });
    const lt = await longTasks(page);
    const value = await field.inputValue();
    console.log(`SPIKE(a) ${JSON.stringify({ speed: SPEED, cues: cues.length, received: r.delays.length, error: r.error, deliveryMs: stats(r.delays), longTasks: { count: lt.length, totalMs: Math.round(lt.reduce((a, b) => a + b, 0)), maxMs: Math.round(Math.max(0, ...lt)) }, typed: typed.length, typingSurvived: value.endsWith(typed) })}`);
    expect(value.endsWith(typed)).toBe(true);
  } finally { sse.close(); }
});

test("(a') a page on a public https origin reaching 127.0.0.1", async ({ page }) => {
  // The real editor is https://app.semanticops.com; route a stand-in public origin and see what headless Chromium does.
  const sse = await sseServer();
  try {
    const consoleLines: string[] = [];
    page.on("console", (m) => consoleLines.push(m.text().slice(0, 240)));
    await page.route("https://app.spike.test/", (r) => r.fulfill({ contentType: "text/html", body: "<!doctype html><title>spike</title>" }));
    const attempt = async () => {
      await page.goto("https://app.spike.test/");
      return page.evaluate((url) => new Promise<string>((done) => {
        const es = new EventSource(url); const t = setTimeout(() => { es.close(); done("timeout"); }, 8000);
        es.addEventListener("cue", () => { clearTimeout(t); es.close(); done("received"); });
        es.onerror = () => { clearTimeout(t); es.close(); done("error"); };
      }), sse.url);
    };
    const denied = await attempt();
    // Chrome's Local Network Access asks the person; granting it stands in for the person clicking Allow once.
    let granted: string;
    try { await page.context().grantPermissions(["local-network-access"]); granted = await attempt(); } catch (e) { granted = `grant unsupported: ${(e as Error).message.slice(0, 80)}`; }
    console.log(`SPIKE(a') ${JSON.stringify({ origin: "https://app.spike.test", target: "http://127.0.0.1", withoutPermission: denied, withPermission: granted, browser: page.context().browser()?.version(), console: consoleLines.slice(0, 3) })}`);
  } finally { sse.close(); }
});

test("(b) MCP writes through the relay into the tab's own session", async ({ page }) => {
  test.fail(true, "srs-web#772: an agent write empties the record form being typed in");
  // The relay is mocked as the agent specs do (routeRelayChannels + the executor WebSocket), so this measures the tab's
  // side of a write: the real relay adds a round trip through Cloudflare and carries the text off the machine.
  await routeRelayChannels(page, { fixed: true });
  let sock: { send: (f: unknown) => void; url: string } | undefined;
  const replies = new Map<string, (r: { status: number; body?: string }) => void>();
  await page.routeWebSocket(/relay\.test.*executor/, (ws) => {
    sock = { send: (f) => ws.send(JSON.stringify(f)), url: ws.url() };
    ws.onMessage((m) => { const f = JSON.parse(String(m)); replies.get(f.requestId)?.(f.response); });
  });
  let n = 0;
  async function rpc(method: string, params?: unknown) {
    const requestId = `req${++n}`, s = sock as { send: (f: unknown) => void; url: string };
    const done = new Promise<{ status: number; body?: string }>((res) => replies.set(requestId, res));
    s.send({ version: 1, type: "request", requestId, executorGeneration: new URL(s.url).searchParams.get("generation"), deadlineUnixMs: Date.now() + 30000,
      request: { method: "POST", contentType: "application/json", headers: {}, body: Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: n, method, params })).toString("base64url") } });
    const r = await done;
    return JSON.parse(Buffer.from(r.body ?? "", "base64url").toString());
  }
  const tool = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });

  await page.addInitScript(() => localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test"));
  await openGovernance(page);
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "spike", version: "0" } });
  const created = await tool("note_create", { title: "Live transcript (spike)", sections: [{ name: "transcript", content: "" }] });
  const noteId = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(created.result))?.[0];
  expect(noteId, JSON.stringify(created)).toBeTruthy();

  const field = await startMinute(page);
  await watchLongTasks(page);
  const rtt: number[] = [], errors: string[] = [];
  let text = "";
  const writer = (async () => {
    const t0 = Date.now();
    for (const c of cues) {
      await sleep(Math.max(0, at(c) - (Date.now() - t0)));
      text += `${c.text}\n`;
      const s = Date.now();
      const r = await tool("note_update", { instanceId: noteId, sections: [{ name: "transcript", content: text }] });
      rtt.push(Date.now() - s);
      if (r.result?.isError || r.error) errors.push(JSON.stringify(r.result ?? r.error).slice(0, 200));
    }
  })();
  const typed = await typeFor(page, at(cues.at(-1) as Cue));
  await writer;
  const lt = await longTasks(page);
  const value = await field.inputValue();
  // A whole meeting in one note: 52 minutes of speech is about 50 KB of text.
  const big: number[] = [];
  for (let i = 0; i < 3; i++) { const s = Date.now(); await tool("note_update", { instanceId: noteId, sections: [{ name: "transcript", content: text.repeat(Math.ceil(50_000 / text.length)) }] }); big.push(Date.now() - s); }
  console.log(`SPIKE(b) ${JSON.stringify({ speed: SPEED, cues: cues.length, writes: rtt.length, errors: errors.length, firstError: errors[0] ?? null, writeRoundTripMs: stats(rtt), at50KB: stats(big), longTasks: { count: lt.length, totalMs: Math.round(lt.reduce((a, b) => a + b, 0)), maxMs: Math.round(Math.max(0, ...lt)) }, typed: typed.length, typingSurvived: value.endsWith(typed), fieldKept: value.length, formOpen: await page.getByTestId("record-form").isVisible() })}`);
  expect(value.endsWith(typed)).toBe(true);
});
