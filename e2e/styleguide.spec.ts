import { expect, test } from "@playwright/test";

/** styleguide.spec.ts — the hidden live /styleguide route (srs-web#420, ADR-019). */
test.describe("Styleguide", () => {
  test("renders every section without errors, and the theme switcher reskins", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/styleguide");
    // poll: the styleguide is a lazy chunk, so the first count can race the mount
    await expect.poll(() => page.locator("section h2").count()).toBeGreaterThanOrEqual(9);
    await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });
    // (the rejected McpConnection specimen carries its own role="alert"; anything else is the gate)
    await expect(page.locator('[role="alert"]:not(.mcp-conn__error)')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
    const bg = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-bg"));
    const before = await bg();

    await page.getByLabel("Theme").selectOption("Demo");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "demo");
    expect(await bg()).not.toBe(before);
    expect(errors).toEqual([]);
  });

  test("a trailing slash also renders the styleguide", async ({ page }) => {
    await page.goto("/styleguide/");
    await expect(page.getByRole("heading", { name: "Styleguide", level: 1 })).toBeVisible();
  });

  test("the app root still mounts and does not link to the styleguide", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("generic-file-picker")).toBeVisible({ timeout: 15000 });
    await expect(page.locator('a[href*="styleguide"]')).toHaveCount(0);
  });

  for (const path of ["/", "/styleguide"]) {
    test(`ink-surface filter is defined exactly once on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await page.locator("filter#ink-surface").count()).toBe(1);
      expect(await page.evaluate(() => document.getElementById("ink-surface") !== null)).toBe(true);
    });
  }

  // ── Agent participation specimens (srs-web#422) ────────────────────────────────────────
  for (const theme of ["Default", "Demo"]) {
    test(`actors, annotations and comments render without errors: ${theme} theme`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/styleguide");
      await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });
      await page.getByLabel("Theme").selectOption(theme);

      const pairs = page.getByTestId("sg-actor-pairs");
      await expect(pairs.locator(".sg__pair")).toHaveCount(5); // 1 human, 3 agents, unattributed
      await expect(pairs).toContainText("Unattributed");
      const clip = (n: number) =>
        pairs
          .getByTestId("actor-mark")
          .nth(n)
          .evaluate((el) => getComputedStyle(el).clipPath);
      expect(await clip(0)).toBe("none"); // the human: a circle
      expect(await clip(2)).not.toBe("none"); // an agent: the notched square
      await expect(page.locator("#actors .actor-stack__more")).toHaveText(["+3"]);

      const annotations = page.locator("#annotations");
      await expect(annotations.locator('[data-part="row"]').first()).toBeVisible();
      await expect(annotations.getByTestId("paragraph-margin")).toHaveCount(8);
      await expect(annotations.locator('[data-part="earlier"]')).toHaveText("17 earlier comments");
      await expect(annotations.getByTestId("comment-thread")).toHaveCount(8);
      await expect(
        annotations.getByText("<script>alert(1)</script>", { exact: false })
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  // ── Rail components at real widths: nothing overflows its frame (srs-web#421) ──────────────
  for (const theme of ["Default", "Demo"]) {
    for (const width of [1280, 390]) {
      test(`rail frames do not overflow: ${theme} theme at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/styleguide");
        await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });
        await page.getByLabel("Theme").selectOption(theme);
        await expect(page.getByTestId("sg-frame")).toHaveCount(2);
        const problems = await page.evaluate(() => {
          const out: string[] = [];
          for (const frame of document.querySelectorAll<HTMLElement>('[data-testid="sg-frame"]')) {
            const caption = frame.dataset.caption;
            if (frame.scrollWidth > frame.clientWidth) {
              out.push(`${caption}: frame scrollWidth ${frame.scrollWidth} > clientWidth ${frame.clientWidth}`);
            }
            const fr = frame.getBoundingClientRect();
            for (const el of frame.querySelectorAll<HTMLElement>("*")) {
              // Top-layer popovers are positioned against the viewport and may extend past a frame;
              // e2e/popover.spec.ts covers them.
              if (el.closest("[popover]")) continue;
              const r = el.getBoundingClientRect();
              if (r.width === 0 && r.height === 0) continue;
              if (r.right > fr.right + 0.5) {
                out.push(
                  `${caption}: <${el.tagName.toLowerCase()} class="${el.className}" data-part="${el.dataset.part ?? ""}"> right ${r.right.toFixed(1)} > ${fr.right.toFixed(1)}`,
                );
              }
            }
          }
          return out.slice(0, 20);
        });
        expect(problems).toEqual([]);
      });
    }
  }

  // ── Demo theme: no element paints a default palette colour (srs-web#421) ──────────────────
  test("under the demo theme no element paints a default palette colour", async ({ page }) => {
    await page.goto("/styleguide");
    await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15000 });
    await page.addStyleTag({
      content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
    });
    await page.evaluate(() => document.fonts.ready);

    // Colours in the default theme's primitive palette, normalised to rgb(r, g, b).
    const palette = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.append(probe);
      const rgb = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const names = ["--black", "--paper", "--grey-1", "--grey-2", "--grey-3", "--grey-4", "--ink", "--color-page"];
      const set = names.map((n) => rgb(n));
      probe.remove();
      return set;
    });
    expect(palette.length).toBe(8);

    await page.getByLabel("Theme").selectOption("Demo");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "demo");

    // Known limits: resting state only (no :hover / :focus), covered statically by
    // tests/styles-tokens.test.ts. An ALLOW entry needs a reason; keep it empty unless genuine.
    const ALLOW: { selector: string; property: string; reason: string }[] = [];
    // Skipped on purpose, each with its reason.
    const SKIP_SELECTORS = [
      ".sg__chip", // the #tokens swatches deliberately paint a token to show it
      ".sg__space", // likewise, the spacing bars
    ];

    const reports = await page.evaluate(
      ({ palette, allow, skip }) => {
        const triple = (c: string) => (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).join(",");
        const isClear = (c: string) => {
          if (!c || c === "transparent") return true;
          const m = c.match(/rgba?\(([^)]+)\)/);
          if (!m) return false;
          const parts = m[1].split(/[ ,/]+/).filter(Boolean);
          return parts.length > 3 && Number(parts[3]) === 0;
        };
        const bad = new Set(palette.map(triple));
        const out: string[] = [];
        const check = (el: Element, pseudo: string | null, prop: string, value: string) => {
          if (isClear(value) || !bad.has(triple(value))) return;
          const sel = `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ").join(".")}${pseudo ?? ""}`;
          if (allow.some((a) => el.matches(a.selector) && a.property === prop)) return;
          out.push(`${sel} ${prop}: ${value}`);
        };
        const scope = [...document.querySelectorAll("main.sg section *")].filter(
          (el) => !skip.some((s) => el.matches(s) || el.closest(s)),
        );
        for (const el of scope) {
          if (el.getClientRects().length === 0) continue;
          for (const pseudo of [null, "::before", "::after"]) {
            const cs = getComputedStyle(el, pseudo);
            if (pseudo && (cs.content === "none" || cs.content === "normal")) continue;
            check(el, pseudo, "color", cs.color);
            check(el, pseudo, "background-color", cs.backgroundColor);
            for (const side of ["top", "right", "bottom", "left"] as const) {
              if (parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== "none") {
                check(el, pseudo, `border-${side}-color`, cs.getPropertyValue(`border-${side}-color`));
              }
            }
            if (cs.outlineStyle !== "none") check(el, pseudo, "outline-color", cs.outlineColor);
            if (cs.textDecorationLine !== "none") check(el, pseudo, "text-decoration-color", cs.textDecorationColor);
            for (const m of cs.boxShadow.matchAll(/rgba?\([^)]*\)/g)) check(el, pseudo, "box-shadow", m[0]);
          }
        }
        return [...new Set(out)].slice(0, 20);
      },
      { palette, allow: ALLOW, skip: SKIP_SELECTORS },
    );
    expect(reports, "elements painting a default palette colour under the demo theme").toEqual([]);
  });
});
