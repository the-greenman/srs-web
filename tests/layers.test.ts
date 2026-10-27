// Static guard (#619, ADR-027): the editor layers stay clean.
//  1. A headless module (a `.ts` / `.svelte.ts` file under src/lib) imports no `.svelte` file and
//     does not touch `document`.
//  2. Every shared component in src/lib/components/ is mounted by the styleguide.
// Existing offenders are the baseline: the lists only shrink, and each entry names its follow-up.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (p: string) => relative(ROOT, p);
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Headless modules: behaviour with no markup (ADR-027 layer 2). Tests and declarations are not modules. */
const headless = walk(join(ROOT, "src/lib"))
  .map(rel)
  .filter((p) => /\.ts$/.test(p) && !/\.(test|d)\.ts$/.test(p));

const SVELTE_IMPORT = /\bfrom\s+["'][^"']*\.svelte["']/;
const DOCUMENT = /(?<![\w.$/"'-])document\.[a-zA-Z]/;

/** Allowed exceptions: every entry needs a reason that names its follow-up. */
const IMPORTS_SVELTE: Record<string, string> = {
  "src/lib/components/index.ts":
    "the component barrel re-exports components; it holds no behaviour; permanent exception, no follow-up",
  "src/lib/editors/registry.ts":
    "the editor registry maps a view to its shell; a shell is a screen (ADR-022); permanent exception, no follow-up",
  "src/lib/governance/type-registry.ts":
    "maps a type to its view component; follow-up: move the mapping to the screen layer",
};
const TOUCHES_DOCUMENT: Record<string, string> = {
  "src/lib/attachment-download.ts": "anchor-click download; follow-up: a download component",
  "src/lib/columns.ts":
    "reads a CSS custom property; follow-up: pass the value in from the component",
  "src/lib/governance/decision-export-utils.ts":
    "anchor-click download; follow-up: share the download helper with attachment-download.ts",
  "src/lib/storage/local.ts": "anchor-click download; follow-up: share the download helper",
  "src/lib/storage/script-loader.ts":
    "injects a vendor script tag; a browser adapter; follow-up: move to a storage adapter outside the headless scope",
  "src/lib/agent-library.svelte.ts":
    "visibilitychange listener; follow-up: the host component registers it",
};

const offenders = (re: RegExp) =>
  headless.filter((f) => re.test(stripComments(readFileSync(join(ROOT, f), "utf8")))).sort();

describe("headless modules (ADR-027)", () => {
  it("import no .svelte file", () => {
    expect(offenders(SVELTE_IMPORT)).toEqual(Object.keys(IMPORTS_SVELTE).sort());
  });
  it("do not touch `document`", () => {
    expect(offenders(DOCUMENT)).toEqual(Object.keys(TOUCHES_DOCUMENT).sort());
  });
});

/** Shared components with no styleguide specimen yet; each names its follow-up. */
const NO_SPECIMEN_REASON =
  "baseline at ADR-027: no specimen yet; follow-up: add one on /styleguide, then remove the entry";
const NO_SPECIMEN: Record<string, string> = Object.fromEntries(
  [
    "AgentPresence",
    "AppShell",
    "AttachmentLinkPanel",
    "AttachmentsPanel",
    "Card",
    "CardField",
    "CopyField",
    "CreateRepositoryPanel",
    "DecisionLinkPicker",
    "DecisionLogView",
    "DecisionSummaryCard",
    "Disclosure",
    "DomainMap",
    "FieldInput",
    "GitSaveModal",
    "Lifecycle",
    "LogTable",
    "Main",
    "MarginRow",
    "MarkdownView",
    "Meta",
    "NoticeRegion",
    "PairingLoader",
    "Popover",
    "PreviewPane",
    "RecordForm",
    "RecordReading",
    "ResizeHandle",
    "SaveBar",
    "SaveToModal",
    "SuccessorModal",
    "TrayRow",
    "Drawer",
    "Migrations",
    "ViewPicker",
    "Workspace",
  ].map((n) => [n, NO_SPECIMEN_REASON])
);

describe("shared components (ADR-027)", () => {
  const specimens = [...walk(join(ROOT, "src/styleguide")), join(ROOT, "src/Styleguide.svelte")]
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  const components = readdirSync(join(ROOT, "src/lib/components"))
    .filter((n) => n.endsWith(".svelte"))
    .map((n) => n.replace(/\.svelte$/, ""));
  const unmounted = components
    .filter((c) => !new RegExp(`<${c}[\\s/>]|/${c}\\.svelte`).test(specimens))
    .sort();

  it("are each mounted by the styleguide", () => {
    expect(unmounted).toEqual(Object.keys(NO_SPECIMEN).sort());
  });
});
