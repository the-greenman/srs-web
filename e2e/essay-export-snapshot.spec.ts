import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

/**
 * essay-export-snapshot.spec.ts — srs-web#417: "Export snapshot" refreshes the bundle container and
 * downloads the core's slice of it (.srs). Fixture essay.srsj: Opening / Claim / Third + draft "Spare".
 * We comment on Opening, hide it, and delete Claim to the Bin: the slice still carries every
 * paragraph (hidden, drafted and binned included), the comment, and the essay, draft and bin containers.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");

test("Export snapshot: a valid slice with every paragraph, the comment and the essay, draft and bin containers", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  const first = page.locator(".essay-shell__page .block-stack__item").first();
  await first.getByTestId("comment-badge").click();
  await first.getByLabel("Your name").fill("Ada");
  await first.getByLabel("Reply").fill("Nice opening.");
  await first.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(first.getByTestId("comment")).toHaveCount(1);
  await first.hover();
  await page.getByRole("button", { name: "Hide Opening", exact: true }).first().click();
  await page.getByRole("button", { name: "Actions for Claim" }).click();
  await page.getByTestId("paragraph-menu-delete").click();
  await expect(page.getByTestId("bin-row")).toContainText("Claim");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await openMenu(page, "Document");
      await page.getByTestId("export-snapshot").click();
    })(),
  ]);
  expect(download.suggestedFilename()).toBe("On small democracy (snapshot).srs");
  await expect(page.getByTestId("essay-error")).toHaveCount(0);
  const file = testInfo.outputPath("snapshot.srs");
  writeFileSync(file, Buffer.concat(await collect(download)));

  const unzip = (entry: string) => execFileSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  const names = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).split("\n");
  const records = names.filter((n) => /^records\/.*\.json$/.test(n)).map((n) => JSON.parse(unzip(n)));
  const bodies = records.map((r) => r.fieldValues?.body ?? r.fieldValues?.comment_text);
  for (const text of [
    "First paragraph.", // hidden
    "Second paragraph.", // in the Bin
    "Third paragraph.",
    "Drafted paragraph.", // in the draft container
    "Nice opening.", // the comment
  ])
    expect(bodies).toContain(text);
  // The source ids survive, and the three containers are carried (bundle = the slice's root container).
  expect(records.map((r) => r.instanceId).some((id: string) => id.startsWith("d37f5c95-"))).toBe(true);
  const containers = names.filter((n) => /^containers\/.*\.json$/.test(n));
  expect(containers).toHaveLength(3);
  const manifest = JSON.parse(unzip("manifest.json"));
  expect(manifest.declaredExtensions).toContain("ext:slices");
  expect(manifest.container.childContainerIds).toHaveLength(3);
});

async function collect(download: import("@playwright/test").Download): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  return chunks;
}
