/**
 * muDemocracy's site layer (ADR-029): what backs each block and item of a website page, defined once
 * for the site export, the site's Sources line and sources page, its evidence check and the site
 * editor (srs-web#694, B2-2). Until this, muDemocracy wrote these rules three times.
 *
 * - `evidenceReferences(repo)` is a BlockExtra: it attaches to a block or item the incoming
 *   `evidences` and `challenges` links (`evidence`), and `ourReading` when the record is tagged
 *   our-reading (the project's own reading, awaiting the owner's decision).
 * - `statements`, `statementLabel`, `sourceRows` and `ourReadings` read an exported block as the site
 *   shows it; `pageEvidence` finds a page's gaps as the evidence check reports them.
 *
 * A level is the checked-to level (`warrant_level`): on a source, how far the work was read; on a
 * quotation, how far those words were checked; on a claim, how far its warrant was reached. It says
 * how far the work was read, never how strong the claim is.
 * Site-specific: the generic core never imports this directory.
 * ponytail: a block's incoming relations of named types are what srs-rust#1553 (a structured
 * composition render) should return; read them from there when it lands, not through listRelations.
 */
import { type SrsRepository, getRecordOrNull, listRelations } from "$lib/srs-client.js";
import type { BlockExtra, ExportedBlock, ExportedPage } from "../site-export.js";

export interface EvidenceEntry {
  relation: "evidences" | "challenges";
  kind: "source" | "dataset" | "quotation" | "claim";
  id: string;
  title: string;
  level?: string;
  url?: string;
  citation?: string;
  quote?: string;
  locator?: string;
  code?: string;
  source?: {
    id: string;
    title: string;
    url?: string;
    citation?: string;
    level?: string;
    kind?: string;
  };
}

// biome-ignore lint/suspicious/noExplicitAny: exported fields are the site's open shape
export type Statement = Record<string, any> & { evidence?: EvidenceEntry[]; ourReading?: boolean };
type Block = Pick<ExportedBlock, "fields" | "items"> & {
  evidence?: EvidenceEntry[];
  ourReading?: boolean;
};

/** One row of a sources list: a piece of evidence and the statements on the page it backs. */
export interface SourceRow {
  entry: EvidenceEntry;
  backs: string[];
}

const RELATIONS = new Set(["evidences", "challenges"]);
// Strongest first: the order of the warrant-level vocabulary (muSrs warrant-level cf5ca321).
const ORDER = [
  "verified",
  "secondary",
  "computed",
  "observed",
  "tertiary",
  "not-read",
  "recalled",
  "unevidenced",
  "none-required",
];
const rank = (level?: string) =>
  level && ORDER.includes(level) ? ORDER.indexOf(level) : ORDER.length;
/** Evidence that was not read far enough to back a statement on its own. */
export const WEAK = new Set(["recalled", "tertiary", "not-read"]);
/** The block types that argue: each is a statement the evidence check expects backed. */
export const ARGUMENT_BLOCKS = new Set([
  "story",
  "homepage-prose",
  "hero",
  "homepage-hero",
  "homepage-quote",
]);

/** Drops empty values; the caller names what the record's fields make. */
const strip = <T>(o: Record<string, unknown>): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
const byRelationThenLevel = (a: EvidenceEntry, b: EvidenceEntry) =>
  a.relation === b.relation ? rank(a.level) - rank(b.level) : a.relation === "evidences" ? -1 : 1;

/** The export extra: evidence first and challenges after, the strongest level first within each. */
export function evidenceReferences(repo: SrsRepository): BlockExtra {
  const cache = new Map<string, ReturnType<typeof getRecordOrNull>>();
  const record = (id: string) => {
    if (!cache.has(id)) cache.set(id, getRecordOrNull(repo, id));
    return cache.get(id) ?? null;
  };
  const sourceOf = (id: string) => {
    const r = record(id);
    if (!r) return undefined;
    const f = r.fieldValues;
    return strip<NonNullable<EvidenceEntry["source"]>>({
      id,
      title: f.title,
      url: f.source_url,
      citation: f.citation,
      level: f.warrant_level,
      kind: f.source_kind,
    });
  };
  const entry = (relation: EvidenceEntry["relation"], id: string): EvidenceEntry | null => {
    const r = record(id);
    if (!r) return null;
    const f = r.fieldValues;
    switch (r.typeName) {
      case "source": {
        const s = sourceOf(id) as NonNullable<ReturnType<typeof sourceOf>>;
        return strip<EvidenceEntry>({
          relation,
          kind: s.kind === "dataset" ? "dataset" : "source",
          id,
          title: s.title,
          level: s.level,
          url: s.url,
          citation: s.citation,
        });
      }
      case "quotation": {
        const from = listRelations(repo, { source: id, relationType: "derived-from" })
          .map((x) => x.targetInstanceId)
          .find((t) => record(t)?.typeName === "source");
        return strip<EvidenceEntry>({
          relation,
          kind: "quotation",
          id,
          title: f.title,
          quote: f.quote_text,
          locator: f.locator,
          level: f.warrant_level,
          source: from ? sourceOf(from) : undefined,
        });
      }
      case "claim":
        return strip<EvidenceEntry>({
          relation,
          kind: "claim",
          id,
          title: f.title,
          code: f.claim_id,
          level: f.warrant_level,
        });
      default:
        return null;
    }
  };
  return (repo, id, out, rec) => {
    const evidence = listRelations(repo, { target: id })
      .filter((x) => RELATIONS.has(x.relationType))
      .map((x) => entry(x.relationType as EvidenceEntry["relation"], x.sourceInstanceId))
      .filter((e): e is EvidenceEntry => e !== null)
      .sort(byRelationThenLevel);
    if (evidence.length) out.evidence = evidence;
    if ((rec.tags ?? record(id)?.tags ?? []).includes("our-reading")) out.ourReading = true;
  };
}

/** The words a reader knows a statement by: a stop's date and title, a mark, a chart card, a heading. */
export function statementLabel(f: Statement): string {
  if (f.moment_title) return [f.moment_label, f.moment_title].filter(Boolean).join(": ");
  return (
    f.mark_title ||
    f.chart_title ||
    f.section_heading ||
    f.headline ||
    opening(f.section_body || f.supporting_copy || f.quote_text)
  );
}

/** A block with no heading is known by how it begins: its first sentence, cut short. */
function opening(text?: string): string {
  const first =
    String(text ?? "")
      .replace(/[*_>#]/g, "")
      .trim()
      .split(/(?<=[.?!])\s/)[0] ?? "";
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first || "Untitled section";
}

/**
 * The statements of a block whose evidence shows under it. A block shared by several sections (the
 * six marks) shows its marks' sources only where the marks are the subject: not under the fading
 * box (what replaced them) or the rooms map (whose subject is the stops).
 */
export function statements(block: Block): Statement[] {
  const f = block.fields as Statement;
  const own = { ...f, evidence: block.evidence, ourReading: block.ourReading, isBlock: true };
  const marksElsewhere = f.story_key === "rooms" || f.presentation === "fading";
  const items = ((block.items ?? []) as Statement[]).filter((i) => !(marksElsewhere && i.mark_key));
  // A block is a statement in its own right only when it says something itself: a wrapper whose
  // words are all in its items (the rooms map, the chart cards) is not.
  const says = Boolean(
    f.section_body || f.supporting_copy || f.quote_text || own.evidence?.length || own.ourReading
  );
  return [...(says ? [own] : []), ...items];
}

/** One row per piece of evidence, its statements gathered; evidence before challenges, as exported. */
export function sourceRows(stmts: Statement[]): SourceRow[] {
  const rows = new Map<string, SourceRow>();
  for (const s of stmts)
    for (const e of s.evidence ?? []) {
      const key = `${e.relation}:${e.id}`;
      const row = rows.get(key) ?? { entry: e, backs: [] };
      const label = statementLabel(s);
      if (!row.backs.includes(label)) row.backs.push(label);
      rows.set(key, row);
    }
  return [...rows.values()].sort((a, b) =>
    a.entry.relation === b.entry.relation ? 0 : a.entry.relation === "evidences" ? -1 : 1
  );
}

/** The statements that are the project's own reading, awaiting the owner's decision. */
export const ourReadings = (stmts: Statement[]): string[] =>
  stmts.filter((s) => s.ourReading).map(statementLabel);

/** A statement's gap: nothing recorded, or only weak evidence for it (challenges do not count). */
export function gapOf(s: Statement): "none" | "weak" | undefined {
  const ev = s.evidence ?? [];
  if (!ev.length) return "none";
  if (ev.filter((e) => e.relation === "evidences").every((e) => e.level && WEAK.has(e.level)))
    return "weak";
  return undefined;
}

export interface EvidenceFinding {
  severity: "WARN" | "INFO";
  page: string;
  message: string;
}

const identity = (s: Statement): string =>
  s.moment_key || s.mark_key || s.chart_key || s.card_key || s.section_key || statementLabel(s);

/**
 * What backs a page and what does not yet, as the evidence check reports it. A page joins the check
 * by having any evidence at all; its statements are its arguing blocks and any block with evidence,
 * each counted once. A gap is work, not an error: WARN for nothing recorded, INFO for the rest.
 */
export function pageEvidence(page: Pick<ExportedPage, "key" | "blocks">): {
  statements: Statement[];
  backed: number;
  findings: EvidenceFinding[];
} {
  const seen = new Set<string>();
  const stmts = page.blocks
    .filter(
      (b) => ARGUMENT_BLOCKS.has(b.type) || (b.evidence as EvidenceEntry[] | undefined)?.length
    )
    .flatMap((b) => statements(b as Block))
    .filter((s) => {
      const key = identity(s);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const backed = stmts.filter((s) => s.evidence?.length).length;
  const findings: EvidenceFinding[] = [];
  const add = (severity: EvidenceFinding["severity"], message: string) =>
    findings.push({ severity, page: page.key, message });
  if (!backed) {
    add("INFO", `no evidence on this page yet (${stmts.length} statements)`);
    return { statements: stmts, backed, findings };
  }
  for (const s of stmts) {
    const gap = gapOf(s);
    if (gap === "none") add("WARN", `"${statementLabel(s)}" has no evidence recorded`);
    if (gap === "weak")
      add(
        "INFO",
        `"${statementLabel(s)}" rests only on ${[...new Set((s.evidence ?? []).map((e) => e.level))].join("/")} evidence`
      );
    if (s.ourReading)
      add("INFO", `"${statementLabel(s)}" is our reading, awaiting the owner's decision`);
    for (const e of s.evidence ?? [])
      if (!e.level) add("INFO", `${e.kind} "${e.title}" has no checked-to level`);
  }
  return { statements: stmts, backed, findings };
}
