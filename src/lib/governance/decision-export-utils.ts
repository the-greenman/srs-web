/**
 * decision-export-utils.ts — export formatters for decision records.
 *
 * `formatDecisionMarkdown` / `formatDecisionHtml`: format a single SrsRecord for download,
 * reading field values via `repo.get_field_value_by_name` (srs-web#179).
 *
 * `wrapLogHtml`: wraps the HTML fragment returned by renderDocumentView("html") in a
 * complete HTML document so the whole-log download is a valid standalone file.
 */

import type { SrsRecord, SrsRepository } from "$lib/srs-client.js";

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

/** Format a decision record as Markdown. Reads field values via WASM binding. */
export function formatDecisionMarkdown(record: SrsRecord, repo: SrsRepository): string {
  const title =
    (repo.get_field_value_by_name(record.instanceId, "title") as string | null | undefined) ??
    "Untitled Decision";
  const lines: string[] = [`# ${title}`, ""];
  for (const field of EXPORT_FIELDS) {
    if (field.name === "title") continue;
    const value = repo.get_field_value_by_name(record.instanceId, field.name) as
      | string
      | null
      | undefined;
    if (value === undefined || value === null || value === "") continue;
    lines.push(`## ${field.label}`, "", value, "");
  }
  if (record.createdAt) {
    lines.push("---", "", `*Created: ${record.createdAt.slice(0, 10)}*`, "");
  }
  return lines.join("\n");
}

/** Format a decision record as a minimal HTML document. Reads field values via WASM binding. */
export function formatDecisionHtml(record: SrsRecord, repo: SrsRepository): string {
  const title =
    (repo.get_field_value_by_name(record.instanceId, "title") as string | null | undefined) ??
    "Untitled Decision";
  const sections: string[] = [];
  for (const field of EXPORT_FIELDS) {
    if (field.name === "title") continue;
    const value = repo.get_field_value_by_name(record.instanceId, field.name) as
      | string
      | null
      | undefined;
    if (value === undefined || value === null || value === "") continue;
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
 * Trigger a file download in the browser. Appends a temporary anchor to the document,
 * clicks it, removes it, then revokes the object URL after a tick so the download
 * queue has time to register it before the URL is freed.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
