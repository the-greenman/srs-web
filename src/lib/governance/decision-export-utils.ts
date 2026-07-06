/**
 * decision-export-utils.ts — export formatters for decision records.
 *
 * `formatDecisionMarkdown` / `formatDecisionHtml`: format a single already-WASM-resolved
 * SrsRecord for download. ADR-001 residual debt: field-by-name lookup, same category as
 * DecisionView.svelte. A future srs-rust issue tracks adding instance_id_filter to
 * render_document_view so this TS formatting layer can be removed.
 *
 * `wrapLogHtml`: wraps the HTML fragment returned by renderDocumentView("html") in a
 * complete HTML document so the whole-log download is a valid standalone file.
 */

import { getStringField } from "$lib/governance/field-utils.js";
import type { FieldFormDef } from "$lib/governance/types.js";
import type { SrsRecord } from "$lib/srs-client.js";

/** Field display order for decision export — mirrors DECISION_FIELDS in DecisionView.svelte. */
const EXPORT_FIELDS = [
  { name: "title", label: "Title" },
  { name: "decision_statement", label: "Decision Statement" },
  { name: "decision_question", label: "Decision Question" },
  { name: "context", label: "Context" },
  { name: "friction", label: "Friction" },
  { name: "key_requirements", label: "Key Requirements" },
  { name: "rationale", label: "Rationale" },
  { name: "alternatives_considered", label: "Alternatives Considered" },
  { name: "revisit_when", label: "Revisit When" },
  { name: "next_steps", label: "Next Steps" },
  { name: "owner", label: "Owner" },
  { name: "status", label: "Status" },
] as const;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Format a decision record as Markdown.
 * Presentation logic only — reads already-WASM-resolved field values.
 * ADR-001 residual debt: same category as DecisionView.svelte field rendering.
 */
export function formatDecisionMarkdown(
  record: SrsRecord,
  fieldMeta: Map<string, FieldFormDef>
): string {
  const title = getStringField(record, "title", fieldMeta) ?? "Untitled Decision";
  const lines: string[] = [`# ${title}`, ""];
  for (const field of EXPORT_FIELDS) {
    if (field.name === "title") continue;
    const value = getStringField(record, field.name, fieldMeta);
    if (value === undefined || value === "") continue;
    lines.push(`## ${field.label}`, "", value, "");
  }
  if (record.createdAt) {
    lines.push("---", "", `*Created: ${record.createdAt.slice(0, 10)}*`, "");
  }
  return lines.join("\n");
}

/**
 * Format a decision record as a minimal HTML document.
 * Presentation logic only — same ADR-001 residual debt category as formatDecisionMarkdown.
 */
export function formatDecisionHtml(
  record: SrsRecord,
  fieldMeta: Map<string, FieldFormDef>
): string {
  const title = getStringField(record, "title", fieldMeta) ?? "Untitled Decision";
  const sections: string[] = [];
  for (const field of EXPORT_FIELDS) {
    if (field.name === "title") continue;
    const value = getStringField(record, field.name, fieldMeta);
    if (value === undefined || value === "") continue;
    const escaped = escapeHtml(value).replace(/\n/g, "<br>");
    sections.push(`<section><h2>${field.label}</h2><p>${escaped}</p></section>`);
  }
  const date = record.createdAt
    ? `<footer><small>Created: ${record.createdAt.slice(0, 10)}</small></footer>`
    : "";
  return [
    "<!DOCTYPE html>",
    `<html><head><meta charset="utf-8">`,
    `<title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;max-width:60ch;margin:2rem auto;padding:0 1rem}h1,h2{line-height:1.2}section{margin-bottom:1.5rem}footer{margin-top:2rem;color:#666}</style>",
    "</head><body>",
    `<h1>${escapeHtml(title)}</h1>`,
    ...sections,
    date,
    "</body></html>",
  ].join("\n");
}

/**
 * Wrap an HTML fragment (e.g. from renderDocumentView "html") in a full HTML document.
 * renderDocumentView returns a bare <div class="srs-document">…</div> fragment, not a
 * complete document — this makes the whole-log download a valid standalone file.
 */
export function wrapLogHtml(fragment: string, title: string): string {
  return [
    "<!DOCTYPE html>",
    `<html><head><meta charset="utf-8">`,
    `<title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;max-width:80ch;margin:2rem auto;padding:0 1rem}h1,h2,h3{line-height:1.2}.srs-document{padding:0}</style>",
    "</head><body>",
    `<h1>${escapeHtml(title)}</h1>`,
    fragment,
    "</body></html>",
  ].join("\n");
}
