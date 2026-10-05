// Static guard (#441, ADR-020 j): inline errors are `Notice kind="error"`; a hand-written
// `role="alert"` (or a dynamic `role={...}`) in a Svelte file fails here until it is converted or
// listed below with a reason. Scoped to role=alert: it does not police role=status.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** path -> number of `role="alert"` / `role={...}` sites. Every entry needs a reason. */
const ALLOW: Record<string, number> = {
  "src/lib/components/GitSaveModal.svelte": 1, // modal error (#428)
  "src/lib/editor/SectionForm.svelte": 1, // form error (#426)
  "src/lib/components/RecordForm.svelte": 1, // form error (#426)
  "src/lib/components/Notice.svelte": 1, // the component itself (role by kind)
  "src/lib/components/HoverCard.svelte": 1, // dynamic role={role}: the card's own dialog/tooltip role, never an alert
  "src/Styleguide.svelte": 1, // specimen (the wasm-unavailable line)
};

const SITE = /role=(?:"alert"|'alert'|\{)/g;

describe("no ad-hoc alerts", () => {
  it("every role=alert (or dynamic role) site is the Notice component or an allowlisted one", () => {
    const found: Record<string, number> = {};
    for (const file of walk(join(ROOT, "src")).filter((p) => p.endsWith(".svelte"))) {
      const src = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, ""); // header comments mention the role
      const n = (src.match(SITE) ?? []).length;
      if (n) found[relative(ROOT, file)] = n;
    }
    expect(found).toEqual(ALLOW);
  });
});
