import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Download, type Page } from "@playwright/test";

/**
 * walkthrough-r1.spec.ts — Release verification: Decision Log R1 "safe to try"
 * end-to-end walkthrough (muDemocracy.org#54, epic #36).
 *
 * One continuous session covering the #54 checklist: create from the governance
 * seed → record a decision (required fields enforced) → tag → link → search →
 * export a single decision → reload-persistence (autosave restore) → exported
 * .srsj round-trips through the CLI (`srs repo validate` clean, when a CLI is
 * available via SRS_CLI_PATH or on PATH).
 *
 * Known R1 gaps are recorded as annotations, not failures, so this spec gates
 * what R1 currently delivers without going red on open stories:
 *  - plain-text single-decision export (#43 wants text/MD/HTML; MD+HTML exist)
 *  - whole-log Markdown export (#44 / srs-web#138)
 *  - per-field guidance visible in the form (srs-web#176)
 * Tighten those steps into hard assertions as each story closes.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function resolveSrsCli(): string | null {
  const candidates = [
    process.env.SRS_CLI_PATH,
    "srs", // PATH lookup — probed below
  ].filter((c): c is string => !!c);
  for (const cli of candidates) {
    try {
      execFileSync(cli, ["--version"], { stdio: "pipe" });
      return cli;
    } catch {
      // not runnable — try the next candidate
    }
  }
  return null;
}

async function fillField(page: Page, label: string, value: string): Promise<void> {
  const field = page.locator('[data-testid="record-form"] .field').filter({ hasText: label }).first();
  const input = field.locator("input, textarea").first();
  await input.fill(value);
}

async function createDecision(page: Page, title: string, statement: string): Promise<void> {
  await page.locator("button.topbar__new").click();
  await expect(page.getByTestId("record-form")).toBeVisible({ timeout: 3000 });
  // srs-web#176 (delivered): each field shows its description as inline help.
  await expect(page.locator('[data-testid="record-form"] .field__help').first()).toBeVisible();
  await fillField(page, "Title", title);
  await fillField(page, "Decision Statement", statement);
  await page.locator("button[type=submit]").click();
  await expect(page.getByTestId("record-reading")).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId("record-reading")).toContainText(title);
  // srs-web#213: DecisionView now threads FieldFormDef description into CardField.
  // title and decision_statement both have descriptions in the governance schema, so
  // at least one .card__field-description caption must appear in the reading view.
  await expect(page.getByTestId("record-reading").locator(".card__field-description").first()).toBeVisible();
  await page.getByTestId("record-reading-back").click();
  await expect(page.getByTestId("decision-log-view")).toBeVisible({ timeout: 3000 });
}

test.describe("R1 release walkthrough (#54)", () => {
  test("fresh document: create → record → tag → link → find → export → persist → CLI round-trip", async ({
    page,
  }, testInfo) => {
    const gaps: string[] = [];

    // ------------------------------------------------------------------
    // 1. Fresh browser, no prior state: create a new decision log from the
    //    governance seed (#35); repo validates clean with a root container (#50).
    // ------------------------------------------------------------------
    await test.step("create new decision log from the governance seed", async () => {
      await page.goto("/");
      await page.getByTestId("mode-governance").click({ timeout: 15000 });
      await expect(page.getByTestId("governance-file-picker")).toBeVisible({ timeout: 5000 });

      await page.getByTestId("create-name").fill("R1 Walkthrough Org");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("create-local").click(),
      ]);
      // New documents are .srs archives; verify download fires and editor loads.
      void download; // archive content verified via CLI round-trip below

      // Editor is loaded and validation is clean
      await expect(page.getByRole("link", { name: /Decision/ })).toBeVisible({ timeout: 5000 });
      await expect(
        page.locator(".inspector__title").filter({ hasText: "Validation" }).locator(".inspector__title-aside"),
      ).toContainText("clean");
    });

    // ------------------------------------------------------------------
    // 2. Record decisions via the form (#45); required fields enforced.
    // ------------------------------------------------------------------
    await test.step("required fields are enforced (negative case)", async () => {
      await page.getByRole("link", { name: /Decision/ }).click();
      await expect(page.getByTestId("decision-log-view")).toBeVisible({ timeout: 5000 });

      await page.locator("button.topbar__new").click();
      await expect(page.getByTestId("record-form")).toBeVisible({ timeout: 3000 });
      // Submit with required fields empty — the form must not save.
      await page.locator("button[type=submit]").click();
      await expect(page.getByTestId("record-form")).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByTestId("decision-log-view")).toBeVisible({ timeout: 3000 });
    });

    await test.step("record two decisions", async () => {
      await createDecision(
        page,
        "Meeting cadence",
        "The group meets on the first Tuesday of each month; the walkthrough clerk owns the agenda.",
      );
      await createDecision(
        page,
        "Budget review",
        "Quarterly budget review starts in October; overruns above 10% go back to the group.",
      );
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);

      // Guidance visibility (#54): delivered by srs-web#176 — inline description
      // help (and an ⓘ instructions toggle) is now asserted inside createDecision.
    });

    // ------------------------------------------------------------------
    // 3. Tag it (#47), link it to the second decision (#48), find both (#46).
    // ------------------------------------------------------------------
    await test.step("tag a decision", async () => {
      await page.getByTestId("decision-summary-card").filter({ hasText: "Meeting cadence" }).click();
      await expect(page.getByTestId("inspector-tags")).toBeVisible({ timeout: 3000 });
      await page.getByTestId("tag-input").fill("walkthrough");
      await page.getByTestId("tag-add-btn").click();
      await expect(page.getByTestId("inspector-tags")).toContainText("walkthrough");
    });

    await test.step("link it to the second decision", async () => {
      await page.getByTestId("add-relation-btn").click();
      await expect(page.getByRole("heading", { name: "Link to another decision" })).toBeVisible({
        timeout: 3000,
      });
      await page.getByTestId("link-search").fill("Budget");
      await page.getByTestId("link-decision-item").filter({ hasText: "Budget review" }).click();
      await page.getByTestId("link-confirm").click();
      await expect(page.getByRole("heading", { name: "Link to another decision" })).not.toBeVisible({
        timeout: 3000,
      });
    });

    await test.step("find decisions via search, tag filter and sort", async () => {
      // Leave the reading view if it is open; linking may have kept it open.
      const backBtn = page.getByTestId("record-reading-back");
      if (await backBtn.isVisible()) await backBtn.click();
      await expect(page.getByTestId("decision-log-view")).toBeVisible({ timeout: 5000 });

      await page.getByTestId("search-input").fill("cadence");
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(1);
      await page.getByTestId("search-input").fill("");
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);

      await page.getByTestId("topic-filter").getByRole("button", { name: "walkthrough" }).click();
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(1);
      await page.getByTestId("topic-filter").getByRole("button", { name: "All" }).click();
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);

      await page.getByTestId("sort-toggle").click();
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
    });

    // ------------------------------------------------------------------
    // 4. Export a single decision (#43) — MD + HTML; whole log (#44).
    // ------------------------------------------------------------------
    await test.step("export a single decision (Markdown + HTML + plain text)", async () => {
      await page.getByTestId("decision-summary-card").filter({ hasText: "Meeting cadence" }).click();
      await expect(page.getByTestId("decision-export-group")).toBeVisible({ timeout: 3000 });

      const [md] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("decision-export-md").click(),
      ]);
      expect(await downloadText(md)).toContain("Meeting cadence");

      const [html] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("decision-export-html").click(),
      ]);
      expect(await downloadText(html)).toContain("Meeting cadence");

      // Plain-text export (#43, srs-web#243): view-driven render → markdownToText.
      const [txt] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("decision-export-txt").click(),
      ]);
      const txtContent = await downloadText(txt);
      expect(txtContent).toContain("Meeting cadence");
      // It is plain text, not Markdown: no ATX heading markers survive.
      expect(txtContent).not.toMatch(/^#{1,6}\s/m);
    });

    await test.step("export the whole log", async () => {
      const wholeLog = page.getByTestId("export-log-md");
      if ((await wholeLog.count()) === 0) {
        gaps.push("whole-log Markdown export not implemented (#44 / srs-web#138)");
      }
    });

    // ------------------------------------------------------------------
    // 5. Reload: nothing lost (#41); browser-vs-disk difference visible and
    //    reconcilable (#42) — the picker surfaces the unsaved session and
    //    offers restore/discard.
    // ------------------------------------------------------------------
    await test.step("reload the browser and restore the unsaved session", async () => {
      await page.reload();
      // The app remembers editor mode and may land straight on the governance
      // picker; click the mode button only when the mode picker appears.
      const modeBtn = page.getByTestId("mode-governance");
      const onModePicker = await modeBtn
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (onModePicker) await modeBtn.click();
      await expect(page.getByTestId("governance-file-picker")).toBeVisible({ timeout: 10000 });

      const banner = page.locator(".restore-banner");
      await expect(banner).toBeVisible({ timeout: 5000 });
      await expect(banner).toContainText("R1 Walkthrough Org");
      await banner.locator(".restore-banner__restore").click();

      await expect(page.getByRole("link", { name: /Decision/ })).toBeVisible({ timeout: 5000 });
      await page.getByRole("link", { name: /Decision/ }).click();
      await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
      await expect(page.getByTestId("decision-log-view")).toContainText("Meeting cadence");
      await expect(page.getByTestId("decision-log-view")).toContainText("Budget review");
    });

    // ------------------------------------------------------------------
    // 6. The exported .srsj round-trips through the CLI: validate clean.
    // ------------------------------------------------------------------
    await test.step("exported .srsj round-trips through the CLI", async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Download .srsj" }).click(),
      ]);
      const exported = await downloadText(download);
      expect(JSON.parse(exported)).toHaveProperty("srsj", "1");

      const cli = resolveSrsCli();
      if (!cli) {
        gaps.push("srs CLI not available in this environment — round-trip validated in local runs only");
        return;
      }
      const tmp = path.join(os.tmpdir(), `walkthrough-r1-${Date.now()}.srsj`);
      fs.writeFileSync(tmp, exported);
      try {
        const out = JSON.parse(
          execFileSync(cli, ["repo", "validate", "--repo", tmp], { encoding: "utf8" }),
        );
        expect(out.ok).toBe(true);
        const errors = (out.payload?.diagnostics ?? []).filter(
          (d: { severity?: string }) => d.severity === "error",
        );
        expect(errors).toEqual([]);
      } finally {
        fs.unlinkSync(tmp);
      }
    });

    // Surface the gap report in the test output and annotations.
    for (const gap of gaps) {
      testInfo.annotations.push({ type: "r1-gap", description: gap });
    }
    console.log(`[walkthrough-r1] gaps (${gaps.length}):\n - ${gaps.join("\n - ") || "none"}`);
  });
});
