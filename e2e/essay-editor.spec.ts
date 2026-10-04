import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * essay-editor.spec.ts — srs-web#328: the essay writing surface on a fixture repo built with
 * the srs CLI (build.428) from the essay package of muDemocracy.org#229 (see
 * fixtures/build-essay-fixture.sh). Fixture: essay "On small democracy" with paragraphs
 * Opening / Claim / (untitled "Third paragraph.") and a draft area holding "Spare".
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
}

const titleOf = (page: Page, n: number) => page.locator(".essay-shell__page .block__title").nth(n);
const bodies = (page: Page) => page.locator(".essay-shell__page :is(.block__render, .block__body)");
const layerLabels = (page: Page) => page.locator(".layers .layers__label");
const depthOf = (page: Page, text: string) =>
  page
    .locator(".essay-shell__page .block-stack__item", { hasText: text })
    .first()
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--depth"));

test("typing alone marks the document unsaved after the commit debounce (srs-web#345)", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  await bodies(page).first().click();
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0); // a click is not a write
  await page.keyboard.press("End");
  await page.keyboard.type(" More.");
  // no blur, no further click or key: the 400 ms typing commit alone must surface the indicator
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  await expect(bodies(page).first()).toBeFocused();
});

test("paragraphs render markdown until focused; click shows the source (srs-web#365)", async ({
  page,
}) => {
  await open(page);
  await bodies(page).first().click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("**Bold** words\n\n- one\n- two");
  await bodies(page).last().click(); // blur: flush and render
  const first = page.locator(".essay-shell__page .block__render").first();
  await expect(first.locator("strong")).toHaveText("Bold");
  await expect(first.locator("li")).toHaveText(["one", "two"]);
  await first.click(); // back to source
  await expect(page.locator(".essay-shell__page .block__body").first()).toContainText(
    "**Bold** words"
  );
  await expect(page.locator(".essay-shell__page .block__body").first()).toBeFocused();
});

test("write, reorder, nest, hide, draft out and back", async ({ page }) => {
  await open(page);
  await expect(bodies(page)).toHaveText([
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);
  await expect(page.locator(".draft-tray")).toContainText("Spare");

  // type -> Ctrl+Enter creates a new paragraph after the current one, focused
  await bodies(page).last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+Enter");
  await expect(bodies(page)).toHaveCount(4);
  await expect(bodies(page).nth(3)).toBeFocused();
  await page.keyboard.type("Fourth paragraph.");
  await bodies(page).nth(0).click(); // blur commits through the engine
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
  await expect(bodies(page)).toHaveText([
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
    "Fourth paragraph.",
  ]);

  // keyboard reorder: Alt+ArrowUp on the Claim handle moves it above Opening
  const claimHandle = page.getByRole("button", { name: /^Move Claim\./ });
  await claimHandle.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(bodies(page).first()).toHaveText("Second paragraph.");
  await expect(claimHandle).toBeFocused();

  // native drag in the layers panel: drag "Fourth paragraph." onto the top of "Claim"
  await layerLabels(page)
    .filter({ hasText: "Fourth paragraph." })
    .dragTo(layerLabels(page).filter({ hasText: "Claim" }), { targetPosition: { x: 20, y: 1 } });
  await expect(bodies(page).first()).toHaveText("Fourth paragraph.");

  // nest: Alt+ArrowRight indents (layout depth); the group is shown nested in layers
  await page.getByRole("button", { name: /^Move Opening\./ }).focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => depthOf(page, "First paragraph.")).toBe("1");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(() => depthOf(page, "First paragraph.")).toBe("0");

  // Tab at the start of a block indents too
  await bodies(page).nth(3).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect.poll(() => depthOf(page, "Third paragraph.")).toBe("1");

  // a group can't be dropped into its own run: the drag layer offers no target, so no write
  await layerLabels(page)
    .filter({ hasText: "Opening" })
    .dragTo(layerLabels(page).filter({ hasText: "Third paragraph." }));
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  await expect(bodies(page)).toHaveText([
    "Fourth paragraph.",
    "Second paragraph.",
    "First paragraph.",
    "Third paragraph.",
  ]);
  await expect.poll(() => depthOf(page, "Third paragraph.")).toBe("1");

  // hide follows Photoshop: hiding a parent hides its nested run; children show as hidden-by-parent
  const thirdEye = page.locator(".essay-shell__page .block-stack__item").nth(3).locator(".eye");
  const itemOf = (name: string | RegExp) =>
    page.getByRole("button", { name }).first().locator("xpath=ancestor::article[1]");
  await itemOf("Hide Opening").hover(); // the tools appear on hover
  await page.getByRole("button", { name: "Hide Opening", exact: true }).first().click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await expect(page.getByText("Hidden by parent")).toHaveCount(1);
  await expect(thirdEye).toBeDisabled();
  await expect(page.locator(".layers .eye--inherited")).toHaveCount(1);
  await expect(page.locator(".layers .eye.is-off")).toHaveCount(2);
  // unhiding the parent restores the child to its own state
  await page.getByRole("button", { name: "Show Opening", exact: true }).first().click();
  await expect(page.getByText("Hidden by parent")).toHaveCount(0);
  await expect(page.getByText("Hidden paragraph")).toHaveCount(0);
  // a directly hidden child stays hidden after the parent toggles
  await thirdEye.locator("xpath=ancestor::article[1]").hover();
  await thirdEye.click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await itemOf("Hide Opening").hover(); // the tools appear on hover
  await page.getByRole("button", { name: "Hide Opening", exact: true }).first().click();
  await page.getByRole("button", { name: "Show Opening", exact: true }).first().click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(1);
  await expect(page.getByText("Hidden by parent")).toHaveCount(0);
  await thirdEye.locator("xpath=ancestor::article[1]").hover();
  await thirdEye.click();
  await expect(page.getByText("Hidden paragraph")).toHaveCount(0);

  // draft: pull out via the block action, then put back via the tray
  await page.getByRole("button", { name: /Move Claim to draft/ }).locator("xpath=ancestor::article[1]").hover();
  await page.getByRole("button", { name: /Move Claim to draft/ }).click();
  await expect(bodies(page)).toHaveCount(3);
  await expect(page.locator(".draft-tray")).toContainText("Claim");
  await page.getByRole("button", { name: "Put back Claim" }).click();
  await expect(bodies(page)).toHaveCount(4);

  // native drag from the tray into the essay (put back at a chosen position)
  await page
    .locator('.draft-tray [data-part="label"]', { hasText: "Spare" })
    .dragTo(page.locator(".essay-shell__page .block-stack__item").first(), {
      targetPosition: { x: 40, y: 2 },
    });
  await expect(bodies(page).first()).toHaveText("Drafted paragraph.");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();
});

test("an MCP-side write re-renders the essay", async ({ page }) => {
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
  async function call(body: unknown) {
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
        body: Buffer.from(JSON.stringify(body)).toString("base64url"),
      },
    });
    const r = await done;
    return r.body ? JSON.parse(Buffer.from(r.body, "base64url").toString()) : undefined;
  }

  await page.addInitScript(() =>
    localStorage.setItem("srs-web.mcp-relay-url", "https://relay.test")
  );
  await open(page);
  await page.getByTestId("mcp-library-connect").first().click();
  await expect(page.getByTestId("mcp-status")).toHaveText("Connected", { timeout: 15000 });

  await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "fake", version: "0" },
    },
  });
  await call({ jsonrpc: "2.0", method: "notifications/initialized" });
  const found = await call({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "find", arguments: { contentMatch: "Third paragraph" } },
  });
  const text = JSON.stringify(found);
  const id = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
  expect(id, text).toBeTruthy();
  const upd = await call({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "record_update",
      arguments: {
        instanceId: id,
        fieldValues: { paragraph_title: "Closing", body: "Third paragraph." }, // body is guarded (srs-web#356); the empty label is fillable
      },
    },
  });
  expect(upd.result.isError, JSON.stringify(upd)).not.toBe(true);

  await expect(page.locator(".essay-shell__page .block__title").nth(2)).toHaveText("Closing");
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();

  // An agent attaches a note: a glyph appears without reload; hover previews, click pins it (srs-web#329).
  const note = await call({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "note_create",
      arguments: {
        title: "Counter-claim",
        sections: [{ name: "claim", content: "Small is not always better." }],
      },
    },
  });
  expect(note.result.isError, JSON.stringify(note)).not.toBe(true);
  const noteId = JSON.stringify(note).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  )?.[0];
  const rel = await call({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "relation_create",
      arguments: { relationType: "evidences", sourceInstanceId: noteId, targetInstanceId: id },
    },
  });
  expect(rel.result.isError, JSON.stringify(rel)).not.toBe(true);
  const glyph = page.locator(".essay-shell__page .glyph");
  await expect(glyph).toHaveCount(1);
  await glyph.hover();
  await expect(page.locator(".essay-shell__page .attachment-preview__text")).toBeVisible();
  await glyph.click();
  await expect(page.locator(".panel-rail .pinned__item")).toContainText(
    "Small is not always better."
  );
  // Pins persist per browser (srs-web#406): stored under essay.pins.<essayId>; Open renders full text.
  expect(
    await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("essay.pins.")))
  ).toBe(true);
  await page.locator(".panel-rail .pinned__item").getByRole("button", { name: "Open" }).click();
  await expect(page.locator(".panel-rail .pinned__full")).toContainText(
    "Small is not always better."
  );

  // The relation type label shows (from the core vocabulary); the human removes the link (srs-web#405).
  await expect(page.locator(".panel-rail .pinned__item .attachment-preview__kind")).toContainText(
    "note · "
  );
  await expect(page.locator(".panel-rail .pinned__item .attachment-preview__kind")).not.toContainText(
    "evidences"
  );
  await glyph.hover();
  await page.locator(".essay-shell__page .hover-card__remove").click();
  await expect(page.locator(".essay-shell__page .glyph")).toHaveCount(0);
  await expect(page.locator(".panel-rail .pinned__item")).toHaveCount(0);

  // A semantic paragraph-to-paragraph edge (derived-from) shows a relation indicator on both ends;
  // the structural precedes/contains edges never do (srs-web#374).
  const first = await call({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "find", arguments: { contentMatch: "First paragraph" } },
  });
  const firstId = JSON.stringify(first).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  )?.[0];
  const derived = await call({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "relation_create",
      arguments: { relationType: "derived-from", sourceInstanceId: id, targetInstanceId: firstId },
    },
  });
  expect(derived.result.isError, JSON.stringify(derived)).not.toBe(true);
  await expect(page.getByTestId("relation-indicator")).toHaveCount(2);
  await expect(page.getByTestId("relation-indicator").first()).toHaveAttribute(
    "aria-label",
    /derived-from/
  );
});

test("New essay creates the record, container, draft area and state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page
    .locator('input[type="file"]#srsj-file')
    .setInputFiles(path.join(path.dirname(ESSAY), "essay-empty.srsj"));
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByText("No essay in this repository yet.")).toBeVisible();
  await expect(page.getByTestId("document-dirty-status")).toHaveCount(0);

  await page.getByRole("button", { name: "New essay" }).click();
  await expect(page.getByRole("heading", { name: "Untitled essay" })).toBeVisible();
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  // draft area exists (document-state references a created draft container)
  await expect(page.locator(".draft-tray")).toContainText("Drag paragraphs here");
  await expect(page.getByRole("button", { name: "Create draft area" })).toHaveCount(0);
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();

  await page.getByTestId("first-paragraph").click();
  await expect(bodies(page)).toHaveCount(1);
  await bodies(page).first().click();
  await page.keyboard.type("Opening line.");
  await page.keyboard.press("Control+Enter");
  await expect(bodies(page)).toHaveCount(2);
  await page.keyboard.type("Second line.");
  await bodies(page).first().click();
  await expect(bodies(page)).toHaveText(["Opening line.", "Second line."]);

  // pull a paragraph into the new draft area: proves the draft container is real
  await page
    .getByRole("button", { name: /Move .* to draft/ })
    .first()
    .click();
  await expect(bodies(page)).toHaveCount(1);
  await expect(page.locator('.draft-tray [data-part="row"]')).toHaveCount(1);
});

test("the page is one white scroll surface; essay and paragraph titles edit inline (srs-web#363)", async ({
  page,
}) => {
  await open(page);
  await page.setViewportSize({ width: 1200, height: 360 });
  // Only the window scrolls: the page grows past the viewport and no block scrolls inside itself.
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(
    await page
      .locator(".block__body")
      .evaluateAll((els) => els.every((e) => e.scrollHeight <= e.clientHeight + 1))
  ).toBe(true);
  await expect(page.locator(".essay-shell__page")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );

  // essay title: click, type, Enter
  await page.locator("h1 .inline-text__view").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Renamed essay");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Renamed essay" })).toBeVisible();
  await expect(page.getByTestId("document-dirty-status")).toBeVisible();

  // paragraph title: F2 on the handle renames; Esc cancels
  await page.getByRole("button", { name: /^Move Claim\./ }).focus();
  await page.keyboard.press("F2");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Thesis");
  await page.keyboard.press("Enter");
  await expect(titleOf(page, 1)).toHaveText("Thesis");
  await page.getByRole("button", { name: /^Move Thesis\./ }).focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("zzz");
  await page.keyboard.press("Escape");
  await expect(titleOf(page, 1)).toHaveText("Thesis");
});

test("copy a document: paragraphs are shared and badged; make local copy forks one here only (srs-web#331)", async ({
  page,
}) => {
  await open(page);
  const badges = page.getByTestId("shared-badge");
  await expect(badges).toHaveCount(0);

  await page.getByTestId("copy-document").click();
  await expect(page.getByRole("heading", { name: "Copy of On small democracy" })).toBeVisible();
  await expect(bodies(page)).toHaveText([
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
  await expect(badges).toHaveCount(3);
  await expect(badges.first()).toHaveAttribute("aria-label", "Also in On small democracy");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);

  // make local copy of the first paragraph: this document keeps its text, the badge goes
  await badges.first().click();
  await expect(badges).toHaveCount(2);
  await expect(bodies(page)).toHaveText([
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
  await bodies(page).first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited here.");
  await bodies(page).last().click(); // blur commits

  // the original is unchanged: old text, and the other two paragraphs are still shared
  await page.getByLabel("Essay", { exact: true }).selectOption({ label: "On small democracy" });
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();
  await expect(bodies(page)).toHaveText([
    "First paragraph.",
    "Second paragraph.",
    "Third paragraph.",
  ]);
  await expect(badges).toHaveCount(2);
  await expect(page).toHaveURL(/#e=/);

  // a new document is empty and unshared
  await page.getByTestId("new-document").click();
  await expect(page.getByRole("heading", { name: "Untitled essay" })).toBeVisible();
  await expect(badges).toHaveCount(0);
});

test("generic view renders the essay Composition with the supplied container (srs-web#384)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  const shell = page.getByTestId("generic-srs-shell");
  await expect(shell.frameLocator("iframe").getByText("First paragraph.")).toBeVisible({
    timeout: 15000,
  });
  await expect(shell.getByText("section:essay")).toHaveCount(0);
});

test("delete moves a paragraph to the Bin (v1 state upgrades to v2); restore puts it back", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId("bin")).toContainText("Deleted paragraphs wait here.");
  await page.locator(".essay-shell__page .block-stack__item").nth(1).hover();
  await page.getByRole("button", { name: /Delete Claim$/ }).click();
  await expect(bodies(page)).toHaveCount(2);
  await expect(page.getByTestId("bin-row")).toContainText("Claim");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Restore Claim" }).click();
  await expect(page.getByTestId("bin-row")).toHaveCount(0);
  await expect(bodies(page)).toHaveCount(3);
  await expect(bodies(page).last()).toHaveText("Second paragraph.");
  // the second delete reuses the Bin (no second container, no error)
  await page.getByRole("button", { name: /Delete Opening$/ }).first().locator("xpath=ancestor::article[1]").hover();
  await page.getByRole("button", { name: /Delete Opening$/ }).click();
  await expect(page.getByTestId("bin-row")).toHaveCount(1);
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
});

test("Delete permanently removes the paragraph and its comment, after a confirm", async ({
  page,
}) => {
  await open(page);
  const first = page.locator(".essay-shell__page .block-stack__item").first();
  await first.getByTestId("comment-badge").click();
  await first.getByLabel("Your name").fill("Ada");
  await first.getByLabel("Reply").fill("Doomed.");
  await first.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(first.getByTestId("comment")).toHaveCount(1);
  await page.getByRole("button", { name: /Delete Opening$/ }).first().locator("xpath=ancestor::article[1]").hover();
  await page.getByRole("button", { name: /Delete Opening$/ }).click();
  await expect(page.getByTestId("bin-row")).toContainText("Opening");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Delete Opening permanently" }).click();
  await expect(page.getByTestId("bin-row")).toHaveCount(1); // dismissed: still there
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Opening permanently" }).click();
  await expect(page.getByTestId("bin-row")).toHaveCount(0);
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  await expect(page.getByText("Doomed.")).toHaveCount(0);
  await expect(page.getByText("First paragraph.")).toHaveCount(0);
});
