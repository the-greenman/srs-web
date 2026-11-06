import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { connectAgents, openMenu } from "./helpers";

/**
 * install-package.spec.ts — srs-web#712 (ADR-031): Document > Packages… lists what is published, and an
 * install goes through a plan fetched from this site, whether the writer asked or an agent did.
 */
const ESSAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "essay.srsj");
const text = (r: { result?: { content?: { text: string }[] } }) => r.result?.content?.[0]?.text ?? "";
const WEBSITE = "b3603f72-990a-408a-b6fc-28764ebabe78";

test("the writer installs a published package from Document > Packages…", async ({ page }) => {
  const { rpc, tool } = await connectAgents(page, ESSAY, 1);
  await rpc(1, "tools/list", {});
  await openMenu(page, "Document");
  await page.getByTestId("toolbar-packages").click();
  await page.getByTestId("package-install-website").click();
  const plan = page.getByTestId("install-modal");
  await expect(plan).toContainText("Install website");
  await expect(page.getByTestId("install-from-agent")).toHaveCount(0);
  // an agent's request can't replace the plan the writer is reading
  const busy = JSON.parse(text(await tool(1, "ui_request_package", { packageId: WEBSITE })));
  expect(busy.requested).toBe(false);
  await expect(page.getByTestId("install-from-agent")).toHaveCount(0);
  await page.getByTestId("install-apply").click();
  await expect(plan).toHaveCount(0);

  await openMenu(page, "Document");
  await page.getByTestId("toolbar-packages").click();
  await expect(page.getByTestId("package-row-website")).toContainText("up to date");
  await expect(page.getByTestId("package-available-website")).toHaveCount(0);
});

test("a tampered bundle is refused, and nothing is offered to install", async ({ page }) => {
  await connectAgents(page, ESSAY, 1);
  await page.route("**/packages/website-*.srspkg", (r) => r.fulfill({ body: "{}" }));
  await openMenu(page, "Document");
  await page.getByTestId("toolbar-packages").click();
  await page.getByTestId("package-install-website").click();
  await expect(page.getByTestId("toast")).toContainText("doesn't match its published checksum");
  await expect(page.getByTestId("install-modal")).toHaveCount(0);
});

test("an agent can only ask: a decline installs nothing, a confirm installs", async ({ page }) => {
  const { rpc, tool } = await connectAgents(page, ESSAY, 1);
  await rpc(1, "tools/list", {});
  const packages = async () => JSON.parse(text(await tool(1, "ui_packages", {})));
  expect((await packages()).available.map((p: { name: string }) => p.name)).toContain("website");

  expect(JSON.parse(text(await tool(1, "ui_request_package", { packageId: WEBSITE })))).toEqual({
    requested: true,
  });
  await expect(page.getByTestId("install-from-agent")).toBeVisible();
  const again = JSON.parse(text(await tool(1, "ui_request_package", { packageId: WEBSITE })));
  expect(again.requested).toBe(false); // one question at a time
  expect((await packages()).lastRequest.outcome).toBe("asking");

  await page.getByTestId("install-cancel").click();
  const declined = await packages();
  expect(declined.lastRequest.outcome).toBe("declined");
  expect(declined.available.map((p: { name: string }) => p.name)).toContain("website");

  await tool(1, "ui_request_package", { packageId: WEBSITE });
  await page.getByTestId("install-apply").click();
  await expect(page.getByTestId("install-modal")).toHaveCount(0);
  const installed = await packages();
  expect(installed.lastRequest.outcome).toBe("installed");
  expect(installed.available.map((p: { name: string }) => p.name)).not.toContain("website");

  const refused = JSON.parse(text(await tool(1, "ui_request_package", { packageId: WEBSITE })));
  expect(refused.requested).toBe(false);
});
