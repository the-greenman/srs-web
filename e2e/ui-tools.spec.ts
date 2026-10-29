import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { connectAgents } from "./helpers";

/**
 * ui-tools.spec.ts — srs-web#643 (ADR-028): a paired agent sees ui_help and ui_highlight in
 * tools/list, reads the open essay's manual, and points at the writer's screen; something not on
 * screen is an answer, not an error. Neither changes the document.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const text = (r: { result?: { content?: { text: string }[] } }) => r.result?.content?.[0]?.text ?? "";

test("an agent reads the essay's manual and points at the screen", async ({ page }) => {
  const { rpc, tool } = await connectAgents(page, ESSAY, 1);
  const list = await rpc(1, "tools/list", {});
  const names = list.result.tools.map((t: { name: string }) => t.name);
  expect(names).toContain("ui_help");
  expect(names).toContain("ui_highlight");

  const manual = text(await tool(1, "ui_help", {}));
  expect(manual.indexOf("Connect your AI")).toBeLessThan(manual.indexOf("Your name"));
  expect(manual).toContain("`essay.layers`, on screen now");

  const shown = await tool(1, "ui_highlight", { featureId: "essay.layers", message: "This is Layers." });
  expect(JSON.parse(text(shown))).toEqual({ shown: true });
  await expect(page.getByTestId("ui-spot")).toContainText("This is Layers.");
  await page.getByTestId("ui-spot").click();
  await expect(page.getByTestId("ui-spot")).toHaveCount(0);

  // this fixture has no references collection, so its References panel is not on screen
  const absent = JSON.parse(text(await tool(1, "ui_highlight", { featureId: "essay.sources" })));
  expect(absent.shown).toBe(false);
  expect(absent.reason).toContain("not on the writer's screen");
});
