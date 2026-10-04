import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * helpers.ts — shared e2e helpers.
 *
 * The generic shell (srs-web#322) replaced the old mode-picker → per-mode file
 * picker flow with a single generic file picker. A repository is opened once
 * (generic-file-picker), lands in GenericSrsShell, and Governance/Guides are
 * now optional package editors reached from *inside* the loaded shell rather
 * than chosen up front. Use this after a repository is loaded to switch into
 * one of those editors.
 */
export async function openPackageEditor(
  page: Page,
  editor: "governance" | "guides"
): Promise<void> {
  await page.getByTestId(`package-editor-${editor}`).click();
}

/**
 * The revision migration prompt must appear (the document is below revision 9); accept it.
 * Use only where a migration is expected — a missing prompt fails the test.
 */
export async function acceptMigration(page: Page, ...ids: string[]): Promise<void> {
  const prompt = page.getByTestId("migration-prompt");
  await expect(prompt).toBeVisible({ timeout: 10000 });
  for (const id of ids) await expect(prompt).toContainText(id);
  await page.getByTestId("migration-apply").click();
  await expect(prompt).not.toBeVisible();
}

/** One relay channel per agent, each opened from the Agents panel; returns the MCP helpers. */
export async function connectAgents(page: Page, essayPath: string, count: number) {
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
  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(essayPath);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });
  if (count > 1) await page.getByTestId("mcp-connect-open").click();
  for (let i = 1; i < count; i++) await page.getByTestId("mcp-connect-agent").click();
  await expect(page.getByTestId("mcp-status")).toHaveCount(count);
  const names = ["alpha", "beta", "gamma", "delta"];
  for (let a = 1; a <= count; a++)
    await rpc(a, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: names[a - 1], version: "0" },
    });
  const tool = (a: number, name: string, args: unknown) =>
    rpc(a, "tools/call", { name, arguments: args });
  /** A comment record plus `comments-on` its target, written by agent `a`. */
  async function comment(a: number, text: string, target: string) {
    const rec = await tool(a, "record_create", {
      type: "com.mudemocracy.essay/comment",
      fieldValues: { comment_text: text },
    });
    expect(rec.result?.isError, JSON.stringify(rec)).not.toBe(true);
    const id = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(rec.result))?.[0] as string;
    const rel = await tool(a, "relation_create", {
      relationType: "com.mudemocracy.essay/comments-on",
      sourceInstanceId: id,
      targetInstanceId: target,
    });
    expect(rel.result?.isError, JSON.stringify(rel)).not.toBe(true);
    return id;
  }
  /** A note related to `target` by `relationType` (an attachment margin row), written by agent `a`. */
  async function attach(
    a: number,
    title: string,
    text: string,
    target: string,
    relationType = "evidences"
  ) {
    const note = await tool(a, "note_create", {
      title,
      sections: [{ name: "claim", content: text }],
    });
    expect(note.result?.isError, JSON.stringify(note)).not.toBe(true);
    const id = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(JSON.stringify(note.result))?.[0] as string;
    const rel = await tool(a, "relation_create", {
      relationType,
      sourceInstanceId: id,
      targetInstanceId: target,
    });
    expect(rel.result?.isError, JSON.stringify(rel)).not.toBe(true);
  }
  /** A paragraph-to-paragraph relation (a relation margin row), written by agent `a`. */
  async function relate(a: number, source: string, target: string, relationType = "derived-from") {
    const rel = await tool(a, "relation_create", {
      relationType,
      sourceInstanceId: source,
      targetInstanceId: target,
    });
    expect(rel.result?.isError, JSON.stringify(rel)).not.toBe(true);
  }
  return { rpc, tool, comment, attach, relate };
}

/** Open a Toolbar group menu (wide tiers); a no-op when it is already open. */
export async function openMenu(page: Page, group: "Document" | "View" | "Go"): Promise<void> {
  const trigger = page.getByRole("button", { name: group, exact: true });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
}

/** Escape, then wait until no popover is open (the toggle event lands a tick after the key). */
export async function closeMenus(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator(":popover-open")).toHaveCount(0);
  // aria-expanded follows the toggle event a tick later; reopening before it lands would be undone by it.
  await expect(page.locator('[aria-haspopup="menu"][aria-expanded="true"]')).toHaveCount(0);
}

/** Open a group menu, click one item, and close the menu again (View stays open on toggle). */
export async function menuItem(
  page: Page,
  group: "Document" | "View" | "Go",
  testid: string
): Promise<void> {
  await openMenu(page, group);
  await page.getByTestId(testid).click();
  if ((await page.locator(":popover-open").count()) > 0) await closeMenus(page);
}

/** The Comments toggle's aria-checked ("true" | "false" | "mixed"), read through the View menu. */
export async function commentsState(page: Page): Promise<string | null> {
  await openMenu(page, "View");
  const v = await page.getByTestId("comment-mode").getAttribute("aria-checked");
  await closeMenus(page);
  return v;
}
