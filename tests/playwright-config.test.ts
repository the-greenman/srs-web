import { afterEach, describe, expect, it, vi } from "vitest"

// srs-web#658: a fixed port plus reuseExistingServer silently tested another worktree's dev server.
async function loadConfig() {
  vi.resetModules()
  return (await import("../playwright.config")).default
}

describe("playwright.config webServer", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("refuses an occupied port by default instead of reusing another worktree's server", async () => {
    vi.stubEnv("PLAYWRIGHT_REUSE_SERVER", "")
    vi.stubEnv("CI", "")
    const cfg = await loadConfig()
    expect((cfg.webServer as { reuseExistingServer: boolean }).reuseExistingServer).toBe(false)
  })

  it("never reuses a server in CI, even when asked", async () => {
    vi.stubEnv("PLAYWRIGHT_REUSE_SERVER", "1")
    vi.stubEnv("CI", "true")
    const cfg = await loadConfig()
    expect((cfg.webServer as { reuseExistingServer: boolean }).reuseExistingServer).toBe(false)
  })

  it("reuses a running server only when PLAYWRIGHT_REUSE_SERVER=1 is set locally", async () => {
    vi.stubEnv("PLAYWRIGHT_REUSE_SERVER", "1")
    vi.stubEnv("CI", "")
    const cfg = await loadConfig()
    expect((cfg.webServer as { reuseExistingServer: boolean }).reuseExistingServer).toBe(true)
  })
})
