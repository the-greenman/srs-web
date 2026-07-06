/**
 * Unit tests for decision-export-utils.ts — formatters for decision record export.
 *
 * Tests verify:
 *   - formatDecisionMarkdown: title heading, field skipping, createdAt footer
 *   - formatDecisionHtml: complete HTML document structure, escaping, field skipping
 *   - wrapLogHtml: wraps a bare fragment in a full HTML document
 */

import { describe, expect, it } from "vitest";
import type { SrsRecord } from "../src/lib/srs-client.js";
import type { FieldFormDef } from "../src/lib/governance/types.js";
import {
  formatDecisionMarkdown,
  formatDecisionHtml,
  wrapLogHtml,
} from "../src/lib/governance/decision-export-utils.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFieldMeta(fields: { id: string; name: string }[]): Map<string, FieldFormDef> {
  const map = new Map<string, FieldFormDef>();
  for (const f of fields) {
    map.set(f.id, {
      fieldId: f.id,
      name: f.name,
      label: f.name,
      type: "string",
      required: false,
    } as unknown as FieldFormDef);
  }
  return map;
}

function makeRecord(
  fieldValues: { fieldId: string; value: string }[],
  opts: { createdAt?: string } = {}
): SrsRecord {
  return {
    instanceId: "test-inst-1",
    typeId: "decision-type-id",
    typeVersion: 1,
    fieldValues: fieldValues.map((fv) => ({ fieldId: fv.fieldId, value: fv.value })),
    createdAt: opts.createdAt,
  } as unknown as SrsRecord;
}

const TITLE_FIELD_ID = "field-title";
const STATEMENT_FIELD_ID = "field-statement";
const CONTEXT_FIELD_ID = "field-context";

const basicFieldMeta = makeFieldMeta([
  { id: TITLE_FIELD_ID, name: "title" },
  { id: STATEMENT_FIELD_ID, name: "decision_statement" },
  { id: CONTEXT_FIELD_ID, name: "context" },
]);

// ---------------------------------------------------------------------------
// formatDecisionMarkdown
// ---------------------------------------------------------------------------

describe("formatDecisionMarkdown", () => {
  it("starts with # <title> heading", () => {
    const record = makeRecord([
      { fieldId: TITLE_FIELD_ID, value: "My Decision" },
      { fieldId: STATEMENT_FIELD_ID, value: "We decided X." },
    ]);
    const md = formatDecisionMarkdown(record, basicFieldMeta);
    expect(md).toMatch(/^# My Decision\n/);
  });

  it("falls back to 'Untitled Decision' when title field is absent", () => {
    const record = makeRecord([{ fieldId: STATEMENT_FIELD_ID, value: "We decided X." }]);
    const md = formatDecisionMarkdown(record, basicFieldMeta);
    expect(md).toMatch(/^# Untitled Decision\n/);
  });

  it("includes present fields as ## headings", () => {
    const record = makeRecord([
      { fieldId: TITLE_FIELD_ID, value: "My Decision" },
      { fieldId: STATEMENT_FIELD_ID, value: "We decided X." },
      { fieldId: CONTEXT_FIELD_ID, value: "Background info." },
    ]);
    const md = formatDecisionMarkdown(record, basicFieldMeta);
    expect(md).toContain("## Decision Statement");
    expect(md).toContain("We decided X.");
    expect(md).toContain("## Context");
    expect(md).toContain("Background info.");
  });

  it("skips fields absent from the record", () => {
    const record = makeRecord([{ fieldId: TITLE_FIELD_ID, value: "My Decision" }]);
    const md = formatDecisionMarkdown(record, basicFieldMeta);
    expect(md).not.toContain("## Decision Statement");
    expect(md).not.toContain("## Context");
  });

  it("skips fields with empty string values", () => {
    const record = makeRecord([
      { fieldId: TITLE_FIELD_ID, value: "My Decision" },
      { fieldId: STATEMENT_FIELD_ID, value: "" },
    ]);
    const md = formatDecisionMarkdown(record, basicFieldMeta);
    expect(md).not.toContain("## Decision Statement");
  });

  it("includes createdAt date footer when createdAt is present", () => {
    const record = makeRecord([{ fieldId: TITLE_FIELD_ID, value: "My Decision" }], {
      createdAt: "2026-05-01T10:00:00Z",
    });
    const md = formatDecisionMarkdown(record, basicFieldMeta);
    expect(md).toContain("*Created: 2026-05-01*");
    expect(md).toContain("---");
  });

  it("omits createdAt footer when createdAt is absent", () => {
    const record = makeRecord([{ fieldId: TITLE_FIELD_ID, value: "My Decision" }]);
    const md = formatDecisionMarkdown(record, basicFieldMeta);
    expect(md).not.toContain("*Created:");
  });
});

// ---------------------------------------------------------------------------
// formatDecisionHtml
// ---------------------------------------------------------------------------

describe("formatDecisionHtml", () => {
  it("starts with <!DOCTYPE html>", () => {
    const record = makeRecord([{ fieldId: TITLE_FIELD_ID, value: "My Decision" }]);
    const html = formatDecisionHtml(record, basicFieldMeta);
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it("includes <title> tag with the decision title", () => {
    const record = makeRecord([{ fieldId: TITLE_FIELD_ID, value: "My Decision" }]);
    const html = formatDecisionHtml(record, basicFieldMeta);
    expect(html).toContain("<title>My Decision</title>");
  });

  it("includes <h1> with the decision title", () => {
    const record = makeRecord([{ fieldId: TITLE_FIELD_ID, value: "My Decision" }]);
    const html = formatDecisionHtml(record, basicFieldMeta);
    expect(html).toContain("<h1>My Decision</h1>");
  });

  it("wraps each field in a <section> with an <h2>", () => {
    const record = makeRecord([
      { fieldId: TITLE_FIELD_ID, value: "My Decision" },
      { fieldId: STATEMENT_FIELD_ID, value: "We decided X." },
    ]);
    const html = formatDecisionHtml(record, basicFieldMeta);
    expect(html).toContain("<section>");
    expect(html).toContain("<h2>Decision Statement</h2>");
    expect(html).toContain("We decided X.");
  });

  it("HTML-escapes & in field values", () => {
    const record = makeRecord([
      { fieldId: TITLE_FIELD_ID, value: "Cats & Dogs" },
      { fieldId: STATEMENT_FIELD_ID, value: "Both & more." },
    ]);
    const html = formatDecisionHtml(record, basicFieldMeta);
    expect(html).not.toContain("Cats & Dogs");
    expect(html).toContain("Cats &amp; Dogs");
    expect(html).toContain("Both &amp; more.");
  });

  it("HTML-escapes < and > in field values", () => {
    const record = makeRecord([
      { fieldId: TITLE_FIELD_ID, value: "A > B" },
      { fieldId: STATEMENT_FIELD_ID, value: "<script>alert(1)</script>" },
    ]);
    const html = formatDecisionHtml(record, basicFieldMeta);
    expect(html).toContain("A &gt; B");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("skips absent fields", () => {
    const record = makeRecord([{ fieldId: TITLE_FIELD_ID, value: "My Decision" }]);
    const html = formatDecisionHtml(record, basicFieldMeta);
    expect(html).not.toContain("Decision Statement");
    expect(html).not.toContain("Context");
  });
});

// ---------------------------------------------------------------------------
// wrapLogHtml
// ---------------------------------------------------------------------------

describe("wrapLogHtml", () => {
  it("wraps a fragment in a complete HTML document", () => {
    const fragment = `<div class="srs-document"><p>Content</p></div>`;
    const html = wrapLogHtml(fragment, "Decision Log");
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<title>Decision Log</title>");
    expect(html).toContain("<h1>Decision Log</h1>");
    expect(html).toContain(fragment);
  });

  it("HTML-escapes the title in <title> and <h1>", () => {
    const html = wrapLogHtml("<p>ok</p>", "Log <2026>");
    expect(html).toContain("<title>Log &lt;2026&gt;</title>");
    expect(html).toContain("<h1>Log &lt;2026&gt;</h1>");
  });

  it("includes the raw fragment without escaping it", () => {
    const fragment = `<div><h2>Section</h2><p>Text &amp; more</p></div>`;
    const html = wrapLogHtml(fragment, "Log");
    expect(html).toContain(fragment);
  });
});
