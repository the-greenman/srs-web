import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { connectAgents, routeRelayChannels } from "./helpers";

/**
 * essay-write-guard.spec.ts — srs-web#356: the essay editor declares the engine write guard
 * (srs-rust#1165). Through the real relay + WASM session: agents cannot write essay text,
 * may fill an empty paragraph_title once, and may comment (new record + relation), and may delete only a relation they created (relation_delete, srs-rust#1249).
 */
const bodies = (page: Page) => page.locator(".essay-shell__page :is(.block__render, .block__body)");
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({
    timeout: 15000,
  });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}
type Rpc = {
  error?: unknown;
  result: {
    contents?: { text: string }[];
    serverInfo?: unknown;
    tools?: { name: string }[];
    isError?: boolean;
  };
};
const b64 = (s: string) => Buffer.from(s).toString("base64url");

test("agent writes cannot change the essay text but can comment", async ({ page }) => {
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
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", {
    timeout: 15000,
  });
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

  // relation_delete is own-only (srs-rust#1249): the agent removes the relation it created ...
  const relId =
    /"relationId\\?":\\?"([0-9a-f-]{36})/.exec(text(rel))?.[1] ??
    /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(text(rel))?.[0];
  expect(relId, text(rel)).toBeTruthy();
  const del = await tool("relation_delete", { relationId: relId });
  expect(del.result.isError, text(del)).not.toBe(true);

  // ... but not one the human created (a comment through the UI).
  const first = page.locator(".essay-shell__page .block-stack__item").first();
  await first.getByTestId("comment-badge").click();
  await first.getByLabel("Your name").fill("Ada");
  await first.getByLabel("Reply").fill("Human comment.");
  await first.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(first.getByTestId("comment")).toHaveCount(1);
  // The context read now carries each relation's id; the guard refuses to delete the human's.
  const sections = [
    ...text(await rpc("resources/list")).matchAll(
      /srs:\/\/[0-9a-f-]{36}\/container\/[0-9a-f-]{36}/g
    ),
  ];
  let humanRel: string | undefined;
  for (const [u] of sections) {
    const c = await rpc("resources/read", {
      uri: `${u.replace("/container/", "/context/")}/${opening}`,
    });
    const body = c.result?.contents?.[0]?.text;
    const rels: { relationId: string; relationType: string }[] = body
      ? JSON.parse(body).relations
      : [];
    humanRel ??= rels.find((r) => r.relationType.endsWith("comments-on"))?.relationId;
  }
  expect(humanRel).toBeTruthy();
  const refused = await tool("relation_delete", { relationId: humanRel });
  expect(refused.result.isError, text(refused)).toBe(true);
  expect(text(refused)).toContain("Rejected by the session write guard");
  await expect(first.getByTestId("comment")).toHaveCount(1);

  // The human can still remove an agent's relation (the Remove link, srs-web#405).
  const again = await tool("relation_create", {
    relationType: "evidences",
    sourceInstanceId: noteId,
    targetInstanceId: opening,
  });
  expect(again.result.isError, text(again)).not.toBe(true);
  const glyph = page.locator(".essay-shell__page .glyph");
  await expect(glyph).toHaveCount(1);
  await glyph.hover();
  await page.locator(".essay-shell__page .hover-card__remove").click();
  await expect(glyph).toHaveCount(0);
});

test("agents comment on a non-paragraph instance; the guarded text stays refused (srs-web#422)", async ({
  page,
}) => {
  const { tool, comment } = await connectAgents(page, ESSAY, 1);
  const text = (r: unknown) => JSON.stringify(r);
  const found = await tool(1, "find", { contentMatch: "On small democracy" });
  const essayId = /[0-9a-f]{8}-[0-9a-f-]{27}/.exec(text(found))?.[0] as string;
  expect(essayId).toBeTruthy();

  // (1) a comment record plus `comments-on` targeting a non-paragraph instance (the essay record) succeeds
  const commentId = await comment(1, "A comment on the essay record.", essayId);
  const hit = await tool(1, "find", { contentMatch: "A comment on the essay record." });
  expect(text(hit)).toContain(commentId);

  // (2) an agent record_update of a guarded paragraph's text is refused
  const paragraph = (await page
    .locator(".essay-shell__page [data-block-id]")
    .first()
    .getAttribute("data-block-id")) as string;
  const refused = await tool(1, "record_update", {
    instanceId: paragraph,
    fieldValues: { paragraph_title: "x", body: "Rewritten." },
  });
  expect(text(refused)).toContain("Rejected by the session write guard");

  // (3) KNOWN, ACCEPTED GAP: only the essay shell declares a write guard. A record outside the
  // guard (here the agent's own comment) can be updated by any agent session: non-essay shells have
  // no agent write guard. Pre-existing; #422 does not widen it.
  const allowed = await tool(1, "record_update", {
    instanceId: commentId,
    fieldValues: { comment_text: "Edited by an agent: allowed, the documented gap." },
  });
  expect(allowed.result?.isError, text(allowed)).not.toBe(true);
});
