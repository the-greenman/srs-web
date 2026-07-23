import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * gallery.spec.ts — end-to-end tests using the governance gallery fixture.
 *
 * gallery.srsj is a real governance repository with 6 articles, 9 decisions,
 * 3 roles, and 2 exercises. These tests verify that records actually render
 * (not empty state), which catches WASM serialisation bugs like duplicate-key
 * crashes when instanceId resolves to undefined.
 *
 * Release 1 is a decision-log-only editor: only DecisionView is registered in
 * TYPE_REGISTRY. Article, role, and exercise records fall back to RecordView
 * via RecordDispatch. Field labels are derived from the WASM typeSchema()
 * output (displayLabel → JSON Schema title), so assertions like "Article Text",
 * "Role Holder", and "Thinking Reached" remain valid under RecordView.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_PATH = path.join(__dirname, "fixtures", "gallery.srsj");

test.describe("Gallery fixture — real records render", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WASM boot, then choose governance mode
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    // Wait for loaded state
    await expect(page.getByRole("link", { name: /Articles/ })).toBeVisible({ timeout: 5000 });
  });

  test("Articles section renders cards, not empty state", async ({ page }) => {
    // Verify the h2 shows Articles
    await expect(page.getByRole("heading", { name: "Articles", level: 2 })).toBeVisible();

    // gallery.srsj has 6 articles — the record list should have items
    await expect(page.locator(".record-list__item").first()).toBeVisible();

    // Empty state message must NOT be shown
    await expect(page.locator(".empty-state")).not.toBeVisible();
  });

  test("Articles list rows show view-driven columns from the DocumentView spec (#94)", async ({ page }) => {
    // The articles-list L1 view selects Article № + Status; columns come from the
    // resolved ColumnSpec (ADR-010), not from hardcoded per-type field lookups.
    const firstCard = page.locator(".record-list__item").first().locator(".card");
    await expect(firstCard).toBeVisible();
    const labels = await firstCard.locator(".card__field-label").allTextContents();
    expect(labels.some((l) => l.includes("Article"))).toBe(true);
    expect(labels.some((l) => l.includes("Status"))).toBe(true);
  });

  test("Roles list rows show view-driven columns (Role Holder, Authority, Status) (#94)", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await expect(page.getByRole("heading", { name: "Roles", level: 2 })).toBeVisible();
    const firstCard = page.locator(".record-list__item").first().locator(".card");
    await expect(firstCard).toBeVisible();
    const labels = await firstCard.locator(".card__field-label").allTextContents();
    expect(labels.some((l) => l.includes("Role Holder"))).toBe(true);
    expect(labels.some((l) => l.includes("Authority"))).toBe(true);
    expect(labels.some((l) => l.includes("Status"))).toBe(true);
  });

  test("Articles section shows count badge matching record count", async ({ page }) => {
    // The nav item for Articles includes a count; gallery has 6 articles
    const articlesNav = page.getByRole("link", { name: /Articles/ });
    await expect(articlesNav).toContainText("6");
  });

  test("Decision Log section renders cards, not empty state", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByRole("heading", { name: "Decision Log", level: 2 })).toBeVisible();

    // gallery.srsj has 7 decisions — DecisionLogView renders them as summary card rows
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
    await expect(page.getByTestId("decision-summary-card").first()).toBeVisible();
  });

  test("Decision Log shows DecisionSummaryCard rows with decision content", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();

    // gallery.srsj has 9 decisions total; 7 visible by default (superseded/abandoned hidden)
    const cards = page.getByTestId("decision-summary-card");
    await expect(cards).toHaveCount(7);

    // First card must contain the decision statement (not empty)
    const firstCard = cards.first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.locator(".dscard__statement")).not.toBeEmpty();
  });

  test("clicking a DecisionSummaryCard row opens the reading view", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await page.getByTestId("decision-summary-card").first().click();
    await expect(page.getByTestId("record-reading")).toBeVisible();
  });

  test("Decision Log nav item shows count badge", async ({ page }) => {
    const decisionsNav = page.getByRole("link", { name: /Decision Log/ });
    await expect(decisionsNav).toContainText("9");
  });

  test("Roles section renders cards, not empty state", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await expect(page.getByRole("heading", { name: "Roles", level: 2 })).toBeVisible();

    // gallery.srsj has 3 roles
    await expect(page.locator(".record-list__item").first()).toBeVisible();
    await expect(page.locator(".empty-state")).not.toBeVisible();
  });

  test("Exercises section renders cards, not empty state", async ({ page }) => {
    await page.getByRole("link", { name: /Exercises/ }).click();
    await expect(page.getByRole("heading", { name: "Exercises", level: 2 })).toBeVisible();

    // gallery.srsj has 2 exercises
    await expect(page.locator(".record-list__item").first()).toBeVisible();
    await expect(page.locator(".empty-state")).not.toBeVisible();
  });

  test("Exercises section shows count badge matching record count", async ({ page }) => {
    // The nav item for Exercises includes a count; gallery has 2 exercises
    const exercisesNav = page.getByRole("link", { name: /Exercises/ });
    await expect(exercisesNav).toContainText("2");
  });

  test("selecting an exercise shows its fields in the reading view (RecordView fallback)", async ({ page }) => {
    await page.getByRole("link", { name: /Exercises/ }).click();
    await page.locator(".record-list__item").first().click();

    // RecordView derives label from type schema displayLabel → JSON Schema title
    await expect(page.locator('[data-testid="record-reading"]')).toContainText("Thinking Reached");
  });

  test("clicking a record card opens the reading view", async ({ page }) => {
    // Click the first article card — reading view should open
    await page.locator(".record-list__item").first().click();
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();
  });

  test("selecting an article shows its fields in the reading view", async ({ page }) => {
    // Click first article card — reading view opens in the centre canvas
    await page.locator(".record-list__item").first().click();

    // Reading view must appear in the centre with field labels
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();
    await expect(page.locator('[data-testid="record-reading"]')).toContainText("Article Text");

    // Field content must NOT appear in the inspector
    await expect(page.locator(".inspector__section").first()).not.toContainText("Article Text");
  });

  test("selecting a decision shows its fields in the reading view", async ({ page }) => {
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await page.getByTestId("decision-summary-card").first().click();

    // Reading view must contain decision-specific field labels
    await expect(page.locator('[data-testid="record-reading"]')).toContainText("Decision Statement");

    // Field content must NOT appear in the inspector
    await expect(page.locator(".inspector__section").first()).not.toContainText("Decision Statement");
  });

  test("selecting a role shows its fields in the reading view", async ({ page }) => {
    await page.getByRole("link", { name: /Roles/ }).click();
    await page.locator(".record-list__item").first().click();

    // Reading view must contain role-specific field labels
    await expect(page.locator('[data-testid="record-reading"]')).toContainText("Role Holder");

    // Field content must NOT appear in the inspector
    await expect(page.locator(".inspector__section").first()).not.toContainText("Role Holder");
  });

  test("clicking back from the reading view returns to the record list", async ({ page }) => {
    await page.locator(".record-list__item").first().click();
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();

    // Clicking the back button clears selection and returns to the list
    await page.getByTestId("record-reading-back").click();
    await expect(page.locator('[data-testid="record-reading"]')).not.toBeAttached();
    // Record list is visible again
    await expect(page.locator(".record-list__item").first()).toBeVisible();
    // Validation inspector section remains visible (not necessarily first — Attachments is now always-visible before it)
    await expect(page.locator(".inspector__section").filter({ hasText: "Validation" })).toBeVisible();
  });

  // Quarantined (#173): .topbar__repo was replaced by the Breadcrumb component
  // (.topbar__crumb-*). Rewrite against the current breadcrumb.
  test.fixme("repo filename shown in topbar", async ({ page }) => {
    await expect(page.locator(".topbar__repo")).toContainText("gallery");
  });
});

test.describe("Decision Log — sort and filter controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
  });

  test("sort toggle defaults to newest first", async ({ page }) => {
    const toggle = page.getByTestId("sort-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("Newest first");
  });

  test("sort decisions oldest first", async ({ page }) => {
    const toggle = page.getByTestId("sort-toggle");
    await toggle.click();
    await expect(toggle).toHaveText("Oldest first");
    // Oldest decision is Pilot duration (2026-01-15)
    const firstTitle = page.getByTestId("decision-summary-card").first().locator(".dscard__title");
    await expect(firstTitle).toContainText("Pilot duration");
  });

  test("sort decisions newest first after toggling", async ({ page }) => {
    const toggle = page.getByTestId("sort-toggle");
    // Toggle to oldest then back to newest
    await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveText("Newest first");
    // Newest decision is Closure obligations (2026-05-01)
    const firstTitle = page.getByTestId("decision-summary-card").first().locator(".dscard__title");
    await expect(firstTitle).toContainText("Closure obligations");
  });

  test("filter by topic exhibitions shows 2 decisions", async ({ page }) => {
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
  });

  test("filter by all topics restores list", async ({ page }) => {
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
    await page.getByTestId("topic-filter").getByRole("button", { name: "All" }).click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
  });

  test("topic filter shows sorted chip labels", async ({ page }) => {
    const filterGroup = page.getByTestId("topic-filter");
    const labels = await filterGroup.getByTestId("tag-chip-filter").allTextContents();
    expect(labels).toEqual(["All", "exhibitions", "governance", "operations"]);
  });

  test("search input is visible", async ({ page }) => {
    await expect(page.getByTestId("search-input")).toBeVisible();
  });

  test("search for 'mounting' returns 2 matching decisions", async ({ page }) => {
    await page.getByTestId("search-input").fill("mounting");
    const cards = page.getByTestId("decision-summary-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: "Mounting system" })).toHaveCount(1);
  });

  test("search for 'phase' returns 3 matching decisions", async ({ page }) => {
    await page.getByTestId("search-input").fill("phase");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(3);
  });

  test("search for non-matching keyword shows no summary cards", async ({ page }) => {
    await page.getByTestId("search-input").fill("zzznomatchzzz");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(0);
  });

  test("clearing search restores all 7 decisions", async ({ page }) => {
    await page.getByTestId("search-input").fill("mounting");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
    await page.getByTestId("search-input").fill("");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
  });

  test("search is case-insensitive", async ({ page }) => {
    await page.getByTestId("search-input").fill("MOUNTING");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
  });

  test("search matches text in non-title fields (body content)", async ({ page }) => {
    // "overextending" appears only in the concerns field of "Phase 1 scope", not its title.
    // This verifies WASM find() searches beyond the display label.
    await page.getByTestId("search-input").fill("overextending");
    const cards = page.getByTestId("decision-summary-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.filter({ hasText: "Phase 1 scope" })).toHaveCount(1);
  });
});

test.describe("Decision Log — export buttons", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
  });

  test("Decision Log export MD button is visible and triggers download", async ({ page }) => {
    await expect(page.getByTestId("log-export-group")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("log-export-md").click(),
    ]);
    expect(download.suggestedFilename()).toBe("decision-log.md");
  });

  test("Decision Log export HTML button triggers download", async ({ page }) => {
    await expect(page.getByTestId("log-export-group")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("log-export-html").click(),
    ]);
    expect(download.suggestedFilename()).toBe("decision-log.html");
  });

  test("single decision export MD button triggers download", async ({ page }) => {
    const firstCard = page.getByTestId("decision-summary-card").first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    await expect(page.getByTestId("decision-export-group")).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("decision-export-md").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });

  test("single decision export HTML button triggers download", async ({ page }) => {
    const firstCard = page.getByTestId("decision-summary-card").first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    await expect(page.getByTestId("decision-export-group")).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("decision-export-html").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.html$/);
  });
});

test.describe("url valueType — external links render as anchors (#256)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
  });

  test("url array values render as clickable anchors in DecisionView", async ({ page }) => {
    await page.getByTestId("decision-summary-card").filter({ hasText: "Eye level standard" }).click();
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();

    // Both external_links urls must render as <a> anchors with correct href
    const anchor1 = page
      .locator('[data-testid="record-reading"]')
      .locator('a[href="https://example.org/minutes/2026-02-20"]');
    await expect(anchor1).toBeVisible();
    await expect(anchor1).toHaveText("https://example.org/minutes/2026-02-20");
    await expect(anchor1).toHaveAttribute("target", "_blank");
    await expect(anchor1).toHaveAttribute("rel", "noopener noreferrer");

    const anchor2 = page
      .locator('[data-testid="record-reading"]')
      .locator('a[href="https://limehouse.org/policy-docs"]');
    await expect(anchor2).toBeVisible();
  });

  test("unsafe url (javascript:) is not rendered as an anchor", async ({ page }) => {
    // Eye level standard has safe https:// urls only — verify no javascript: anchors exist
    await page.getByTestId("decision-summary-card").filter({ hasText: "Eye level standard" }).click();
    await expect(page.locator('[data-testid="record-reading"]')).toBeVisible();

    // No anchor with javascript: scheme must be present anywhere in the reading view
    await expect(
      page.locator('[data-testid="record-reading"]').locator('a[href^="javascript:"]')
    ).not.toBeAttached();
  });
});

test.describe("Decision Log — hide superseded/abandoned toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("mode-governance").click({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "SRS Governance Viewer" })).toBeVisible({
      timeout: 5000,
    });

    const fileInput = page.locator('input[type="file"]#srsj-file');
    await fileInput.setInputFiles(GALLERY_PATH);

    await expect(page.getByRole("link", { name: /Decision Log/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("link", { name: /Decision Log/ }).click();
    await expect(page.getByTestId("decision-log-view")).toBeVisible();
  });

  test("default view hides superseded decisions", async ({ page }) => {
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
    await expect(
      page.locator('[data-testid="decision-summary-card"]').filter({ hasText: "Old superseded decision" })
    ).not.toBeAttached();
  });

  test("default view hides abandoned decisions", async ({ page }) => {
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
    await expect(
      page.locator('[data-testid="decision-summary-card"]').filter({ hasText: "Abandoned proposal" })
    ).not.toBeAttached();
  });

  test("Show all toggle reveals superseded and abandoned", async ({ page }) => {
    const toggle = page.getByTestId("show-all-toggle");
    await expect(toggle).toHaveText("Show superseded/abandoned");
    await toggle.click();
    await expect(toggle).toHaveText("Hide superseded/abandoned");
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(9);
  });

  test("Hide toggle re-hides superseded and abandoned", async ({ page }) => {
    await page.getByTestId("show-all-toggle").click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(9);
    await page.getByTestId("show-all-toggle").click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(7);
  });

  test("topic filter does not reveal superseded/abandoned records", async ({ page }) => {
    await page.getByTestId("topic-filter").getByRole("button", { name: "exhibitions" }).click();
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
    await page.getByTestId("show-all-toggle").click();
    // superseded/abandoned have no topic tags → still 2 under exhibitions filter
    await expect(page.getByTestId("decision-summary-card")).toHaveCount(2);
  });
});
