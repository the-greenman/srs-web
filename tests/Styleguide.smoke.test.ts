// @vitest-environment happy-dom
/**
 * Smoke-render /styleguide in the unit run (srs-web#677): a specimen that throws blanks the whole page,
 * and before this only the e2e job (minutes) would notice. Two passes:
 *  1. WASM never ready: a specimen that calls the engine outside `gated(...)` throws, as srs-web#673's did.
 *  2. WASM ready, markdown stubbed: the gated specimens render too.
 */
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Styleguide from "../src/Styleguide.svelte";

const wasm = vi.hoisted(() => ({ ready: false }));
vi.mock("../src/lib/srs-client.js", async (orig) => ({
  ...(await orig<object>()),
  initWasm: () => (wasm.ready ? Promise.resolve() : new Promise(() => {})),
  // as the engine does: markdown renders only once WASM is ready
  renderMarkdown: (s: string) => {
    if (!wasm.ready) throw new Error("srs-bindings WASM not initialised — call initWasm() first");
    return `<p>${s}</p>`;
  },
}));
vi.mock("../src/lib/srs-client", async (orig) => ({
  ...(await orig<object>()),
  initWasm: () => (wasm.ready ? Promise.resolve() : new Promise(() => {})),
  // as the engine does: markdown renders only once WASM is ready
  renderMarkdown: (s: string) => {
    if (!wasm.ready) throw new Error("srs-bindings WASM not initialised — call initWasm() first");
    return `<p>${s}</p>`;
  },
}));

async function mount() {
  const errors: unknown[] = [];
  const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message);
  window.addEventListener("error", onError);
  let view: ReturnType<typeof render> | undefined;
  try {
    view = render(Styleguide);
  } catch (e) {
    errors.push(e);
  }
  for (let i = 0; i < 5; i++) await tick();
  window.removeEventListener("error", onError);
  return { container: (view?.container ?? document.body) as HTMLElement, errors };
}

const sectionIds = (c: HTMLElement) => [...c.querySelectorAll("section[id]")].map((s) => s.id);

describe("/styleguide renders whole", () => {
  afterEach(() => {
    wasm.ready = false;
  });

  it("before WASM is ready: every section renders and nothing calls the engine outside gated()", async () => {
    const { container, errors } = await mount();
    expect(errors).toEqual([]);
    // every entry of the styleguide's own section list is on the page (none blanked by a throw)
    const ids = sectionIds(container);
    const listed = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
      .map((a) => a.getAttribute("href")!.slice(1))
      .filter((id) => id && !ids.includes(id) && container.querySelector(`nav a[href="#${id}"]`));
    expect(ids.length).toBeGreaterThan(20);
    expect(listed).toEqual([]);
  });

  it("once WASM is ready: the gated specimens render too", async () => {
    wasm.ready = true;
    const { container, errors } = await mount();
    expect(errors).toEqual([]);
    expect(container.querySelector('[data-testid="sg-lens-focus"]')).not.toBeNull();
  });
});
