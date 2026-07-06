import { existsSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? "5173")
const baseURL = `http://localhost:${port}`

// Pinned system chromium; fall back to Playwright's own resolution
// (PLAYWRIGHT_BROWSERS_PATH) when the pinned build is not installed.
const pinnedChromium = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 60000,
  use: {
    baseURL,
    trace: "on-first-retry",
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
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30000,
  },
})
