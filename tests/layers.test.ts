// Static guard (#619, ADR-027): the editor layers stay clean.
//  1. A headless module (a `.ts` / `.svelte.ts` file under src/lib) imports no `.svelte` file and
//     does not touch `document`.
//  2. Every shared component in src/lib/components/ is mounted by the styleguide.
//  3. The generic site core (src/lib/site/*.ts) imports no site's own layer (src/lib/site/<site>/), ADR-029.
//  4. Generic code names only public packages (owner, 2026-11-12, srs-web#798): every qualified name and
//     every id in src/ resolves to a definition in a bundle pinned in packages.lock.json, and there is no
//     site layer at all. An implementation's own rules stay in its own repository.
// Existing offenders are the baseline: the lists only shrink, and each entry names its follow-up.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

/** ADR-029: the site core is generic; a site's own layer (src/lib/site/<site>/) may import it, never the reverse. */
describe("site core (ADR-029)", () => {
  const core = readdirSync(join(ROOT, "src/lib/site")).filter(
    (n) => /\.ts$/.test(n) && !/\.d\.ts$/.test(n)
  );
  // `from "..."`, a bare `import "..."` and a dynamic `import("...")` of ./<site>/ or $lib/site/<site>/
  const SITE_LAYER = /(?:\bfrom|\bimport)\s*\(?\s*["'](?:\.\/|\$lib\/site\/)[a-z0-9-]+\//;
  it("imports no site's own layer", () => {
    const offending = core.filter((n) =>
      SITE_LAYER.test(stripComments(readFileSync(join(ROOT, "src/lib/site", n), "utf8")))
    );
    expect(offending).toEqual([]);
  });
});

/**
 * Owner, 2026-11-12 (srs-web#798, vignette 5aab4a38): "srs-web contains only reusable generic code that
 * applies to packages that are public. no code specific to any particular implementation can appear in
 * generic srs-web code." A public package is one pinned in packages.lock.json as a published bundle.
 * Checked: every qualified name (`ns/name`, including `${NS_CONSTANT}/name`), every namespace and every
 * id literal. ponytail: bare type names and tags (`typeName === "x"`) are not checked; today they occur
 * only in the baseline's files. Check them too if one appears elsewhere.
 */
describe("generic code names only public packages (srs-web#798)", () => {
  type LockEntry = { packageId: string; name: string; version: string; onInstall?: boolean };
  const lock: LockEntry[] = JSON.parse(readFileSync(join(ROOT, "packages.lock.json"), "utf8"));
  const bundlePath = (e: LockEntry) =>
    join(
      ROOT,
      e.onInstall
        ? `public/packages/${e.name}-${e.version}.srspkg`
        : `src/lib/packages/${e.packageId}.srspkg`
    );
  const names = new Set<string>();
  const ids = new Set<string>();
  const namespaces = new Set<string>();
  const collect = (o: unknown): void => {
    if (Array.isArray(o)) return o.forEach(collect);
    if (!o || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    for (const k of ["id", "packageId"]) if (typeof r[k] === "string") ids.add(r[k] as string);
    if (typeof r.namespace === "string") namespaces.add(r.namespace);
    if (typeof r.packageNamespace === "string") namespaces.add(r.packageNamespace);
    if (typeof r.id === "string" && typeof r.namespace === "string" && typeof r.name === "string")
      names.add(`${r.namespace}/${r.name}`);
    if (typeof r.id === "string" && typeof r.key === "string" && r.key.includes("/"))
      names.add(r.key);
    Object.values(r).forEach(collect);
  };
  for (const e of lock) {
    if (!existsSync(bundlePath(e)))
      throw new Error(`${rel(bundlePath(e))} missing: run npm run fetch-bindings`);
    collect(JSON.parse(readFileSync(bundlePath(e), "utf8")));
  }

  /** Ids that name no definition: deterministic-id namespaces and the zero id. */
  const NOT_DEFINITIONS: Record<string, string> = {
    "5d1f3c0e-8f0a-4b8e-9a53-2d6c1e7b4a90":
      "AREA_NS, document.ts: a UUID5 namespace for an essay's area containers",
    "6f1d2c4e-8a3b-5c7d-9e0f-1a2b3c4d5e6f":
      "DRAFTS_NS, site-edit.ts: a UUID5 namespace for a page's drafts container",
    "00000000-0000-0000-0000-000000000000": "ZERO_UUID, document-model.ts: the nil id",
  };
  /** Today's offenders, name by name. The list only shrinks; each entry names its follow-up. */
  const PRIVATE_NAMES: Record<string, { names: string[]; why: string }> = {
    "src/lib/editors/registry.ts": {
      names: ["8f138dd6-11d2-42a5-99ec-3d6e23bed54f"],
      why: "the Guides editor's entry type is muSrs's private com.mudemocracy/guide; follow-up: muDemocracy.org#244",
    },
    "src/lib/method/method-document.ts": {
      names: [
        "6e4d0e77-b30a-47d5-a686-5a595a077d4c",
        "872fbd42-6b0d-4839-8381-485ca165d523",
        "91bd6f8a-417c-4728-87d2-26991e451221",
        "b7d15218-cee6-4a58-8e2a-a4cb7f6ccf06",
        "c57aafdd-d002-4ee6-9a2b-ff3805107580",
        "c6a8eab1-25bf-462c-8d48-6ea47c22f724",
        "com.semanticops.method",
        "com.semanticops.method/answers",
        "com.semanticops.method/concerns",
        "com.semanticops.method/held-by",
        "e3b62684-70d8-403d-ac8f-164fcb4b60a9",
        "edd84bf8-6c07-4133-87c6-4ab540ac2a14",
      ],
      why: "srs-programme's unpublished method package; follow-up: srs-web#799",
    },
    "src/lib/help/help.ts": {
      names: ["b6981a3a-d0e4-429b-9f1b-ae5090326570"],
      why: "srs-web's own ui-feature type, in no pinned bundle; follow-up: srs-web#800",
    },
  };
  const SITE_LAYERS: Record<string, string> = {
    "src/lib/site/mudemocracy":
      "guides.ts reads muSrs's private guide containers; follow-up: move it into muDemocracy (muDemocracy.org#244)",
  };

  const NS = String.raw`(?:(?:com|org|net|io)\.[a-z0-9-]+(?:\.[a-z0-9-]+)*|governance)`;
  const QUALIFIED = new RegExp(String.raw`["'\`](${NS}\/[a-z0-9][a-z0-9_-]*)["'\`]`, "g");
  const NAMESPACE = new RegExp(String.raw`["'\`](${NS})["'\`]`, "g");
  // `${ARG}/narrows`, where ARG is a namespace constant declared in the same file
  const CONSTANT = new RegExp(String.raw`\b([A-Za-z_$][\w$]*)\s*=\s*["'\`](${NS})["'\`]`, "g");
  const TEMPLATE = /\$\{([A-Za-z_$][\w$]*)\}\/([a-z0-9][a-z0-9_-]*)/g;
  const ID = /["'`]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["'`]/gi;
  const code = walk(join(ROOT, "src"))
    .map(rel)
    .filter((p) => /\.(ts|js|svelte)$/.test(p) && !/\.d\.ts$/.test(p))
    .filter((p) => !p.startsWith("src/lib/srs_bindings/") && !p.startsWith("src/lib/packages/"));
  /** The reserved example namespaces (RFC 2606's `example`): placeholders, never an implementation. */
  const EXAMPLE = /^(?:com|org)\.example(?:\.|\/|$)/;
  /** The names and ids a file uses that no public package defines, sorted and unique. */
  const unknownIn = (f: string): string[] => {
    const text = stripComments(readFileSync(join(ROOT, f), "utf8"));
    const constants = new Map([...text.matchAll(CONSTANT)].map((m) => [m[1], m[2]]));
    const templated = [...text.matchAll(TEMPLATE)]
      .filter((m) => constants.has(m[1]))
      .map((m) => `${constants.get(m[1])}/${m[2]}`);
    const qualified = [...[...text.matchAll(QUALIFIED)].map((m) => m[1]), ...templated].filter(
      (n) => !names.has(n) && !EXAMPLE.test(n)
    );
    const spaces = [...text.matchAll(NAMESPACE)]
      .map((m) => m[1])
      .filter((n) => !namespaces.has(n) && !EXAMPLE.test(n));
    const unknownIds = [...text.matchAll(ID)]
      .map((m) => m[1].toLowerCase())
      .filter((i) => !ids.has(i) && !(i in NOT_DEFINITIONS));
    return [...new Set([...qualified, ...spaces, ...unknownIds])].sort();
  };

  it("reads the pinned public bundles", () => {
    expect(names.size).toBeGreaterThan(100);
  });

  it("names no definition outside a public package", () => {
    const found = Object.fromEntries(
      code.map((f) => [f, unknownIn(f)] as const).filter(([, n]) => n.length > 0)
    );
    const baseline = Object.fromEntries(
      Object.entries(PRIVATE_NAMES).map(([f, e]) => [f, [...e.names].sort()])
    );
    expect(found).toEqual(baseline);
  });

  it("has no site layer: an implementation's rules live in its own repository", () => {
    const layers = readdirSync(join(ROOT, "src/lib/site"))
      .map((n) => `src/lib/site/${n}`)
      .filter((p) => statSync(join(ROOT, p)).isDirectory());
    expect(layers.sort()).toEqual(Object.keys(SITE_LAYERS).sort());
  });
});
