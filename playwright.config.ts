import { existsSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? "5173")
const baseURL = `http://localhost:${port}`

// Pinned system chromium; fall back to Playwright's own resolution
// (PLAYWRIGHT_BROWSERS_PATH) when the pinned build is not installed.
const pinnedChromium = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

// Writers have a name (srs-web#618): the essay is read-only without one, so every spec starts with a
// saved local actor. A spec that tests the missing-name path clears it with `test.use({ storageState: NO_ACTOR })`.
const actor = { kind: "human", id: "local:e2e-ada", name: "Ada" }
// First-run help (srs-web#642) is dismissed for every spec, so its dialog never covers the page; a spec
// that tests it uses FIRST_RUN (no actor, nothing dismissed).
const helpDismissed = [{ name: "srs-web.help.dismissed.essay", value: "1" }]
export const FIRST_RUN = { cookies: [], origins: [] }
export const NO_ACTOR = { cookies: [], origins: [{ origin: baseURL, localStorage: helpDismissed }] }

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI runs the suite in parallel with a single retry. Serial (workers: 1) plus
  // retries: 2 meant every failing test burned its timeout three times in a row,
  // dragging the job past 20 minutes on a flaky run.
  retries: process.env.CI ? 1 : 0,
  // Every runner core: the specs wait on the browser, not the CPU (main ran 2.0 tests at once on 50%).
  workers: process.env.CI ? "100%" : undefined,
  // CI shards the suite across jobs; each writes a blob that the merge job turns into one HTML report.
  reporter: process.env.CI ? [["blob"], ["line"]] : "html",
  // Twice the slowest passing test (9.4 s, srs-web#675): a broken page fails in seconds, not minutes.
  timeout: 20000,
  // A page that cannot render fails dozens of specs; stop early and keep the report (srs-web#673's run timed out).
  maxFailures: process.env.CI ? 20 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: "srs-web.actor", value: JSON.stringify(actor) }, ...helpDismissed] }],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: existsSync(pinnedChromium) ? { executablePath: pinnedChromium } : {},
      },
    },
  ],
  webServer: {
    // CI serves the built bundle: 12 requests a page load instead of the dev server's 376 (srs-web#675).
    command: process.env.CI
      ? `npm run build && npx vite preview --port ${port} --strictPort`
      : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    // A process variable beats every .env* file: a developer's .env.local relay cannot leak into the suite.
    env: { VITE_MCP_RELAY_URL: "" },
    timeout: process.env.CI ? 120000 : 30000,
  },
})
