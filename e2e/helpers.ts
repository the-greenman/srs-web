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
