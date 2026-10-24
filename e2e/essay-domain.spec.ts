import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * essay-domain.spec.ts — srs-web#571: the writer chooses the essay's boundary and the Domain panel maps it.
 * Fixture essay-domain.srsj (built by build-essay-domain-fixture.sh): boundary "Small groups" scopes two
 * problems (a paragraph bears on one), contextualises a claim, holds a tension and is answered by a remedy.
 */
const ESSAY = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "essay-domain.srsj"
);

test("choosing a boundary shows its map; removing it clears the map", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
  await page.locator('input[type="file"]#srsj-file').setInputFiles(ESSAY);
  await page.getByTestId("package-editor-essay").click();
  await expect(page.getByRole("heading", { name: "On small democracy" })).toBeVisible();

  const map = page.getByTestId("domain-map");
  await expect(map).toBeVisible();
  await expect(map.getByText("Choose a domain")).toBeVisible();

  await page.getByTestId("domain-select").selectOption({ label: "Small groups" });
  await expect(map.getByText("Problems the essay touches (1)")).toBeVisible();
  await expect(map.getByText("Problems it leaves untouched (1)")).toBeVisible();
  await expect(map.getByText("Claims (1)")).toBeVisible();
  await expect(map.getByText("Tensions (1)")).toBeVisible();
  await expect(map.getByText("Remedies (1)")).toBeVisible();
  await expect(map.getByText("Within Local governance")).toBeVisible();

  await map.getByRole("button", { name: "Open Shared commons ledger" }).click();
  await expect(page.getByText("A ledger each group can read.")).toBeVisible();

  await page.getByTestId("domain-select").selectOption({ label: "No domain" });
  await expect(map.getByText("Choose a domain")).toBeVisible();
  await expect(map.getByText(/Problems the essay touches/)).toHaveCount(0);
});
