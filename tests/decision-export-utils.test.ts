/**
 * Unit tests for decision-export-utils.ts — formatters for decision record export.
 *
 * Tests verify:
 *   - formatDecisionMarkdown: title heading, field skipping, createdAt footer
 *   - formatDecisionHtml: complete HTML document structure, escaping, field skipping
 *   - wrapLogHtml: wraps a bare fragment in a full HTML document
 */

import { describe, expect, it } from "vitest";
import type { SrsRecord, SrsRepository } from "../src/lib/srs-client.js";
import {
  formatDecisionMarkdown,
  formatDecisionHtml,
  wrapLogHtml,
} from "../src/lib/governance/decision-export-utils.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRepoStub(values: Record<string, string>): Pick<SrsRepository, "get_field_value_by_name"> {
  return { get_field_value_by_name: (_id: string, name: string) => values[name] ?? null };
}

function makeRecord(opts: { createdAt?: string } = {}): SrsRecord {
  return {
    instanceId: "test-inst-1",
    typeId: "decision-type-id",
    typeVersion: 1,
    fieldValues: [],
    createdAt: opts.createdAt,
  } as unknown as SrsRecord;
}

const basicRepo = makeRepoStub({
  title: "My Decision",
  decision_statement: "We decided X.",
  context: "Background info.",
});

// ---------------------------------------------------------------------------
// formatDecisionMarkdown
// ---------------------------------------------------------------------------

describe("formatDecisionMarkdown", () => {
  it("starts with # <title> heading", () => {
    const record = makeRecord();
    const md = formatDecisionMarkdown(record, basicRepo as SrsRepository);
    expect(md).toMatch(/^# My Decision\n/);
  });

  it("falls back to 'Untitled Decision' when title field is absent", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ decision_statement: "We decided X." });
    const md = formatDecisionMarkdown(record, repo as SrsRepository);
    expect(md).toMatch(/^# Untitled Decision\n/);
  });

  it("includes present fields as ## headings", () => {
    const record = makeRecord();
    const md = formatDecisionMarkdown(record, basicRepo as SrsRepository);
    expect(md).toContain("## Decision Statement");
    expect(md).toContain("We decided X.");
    expect(md).toContain("## Context");
    expect(md).toContain("Background info.");
  });

  it("skips fields absent from the record", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision" });
    const md = formatDecisionMarkdown(record, repo as SrsRepository);
    expect(md).not.toContain("## Decision Statement");
    expect(md).not.toContain("## Context");
  });

  it("skips fields with empty string values", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision", decision_statement: "" });
    const md = formatDecisionMarkdown(record, repo as SrsRepository);
    expect(md).not.toContain("## Decision Statement");
  });

  it("includes createdAt date footer when createdAt is present", () => {
    const record = makeRecord({ createdAt: "2026-05-01T10:00:00Z" });
    const repo = makeRepoStub({ title: "My Decision" });
    const md = formatDecisionMarkdown(record, repo as SrsRepository);
    expect(md).toContain("*Created: 2026-05-01*");
    expect(md).toContain("---");
  });

  it("omits createdAt footer when createdAt is absent", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision" });
    const md = formatDecisionMarkdown(record, repo as SrsRepository);
    expect(md).not.toContain("*Created:");
  });
});

// ---------------------------------------------------------------------------
// formatDecisionHtml
// ---------------------------------------------------------------------------

describe("formatDecisionHtml", () => {
  it("starts with <!DOCTYPE html>", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision" });
    const html = formatDecisionHtml(record, repo as SrsRepository);
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  it("includes <title> tag with the decision title", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision" });
    const html = formatDecisionHtml(record, repo as SrsRepository);
    expect(html).toContain("<title>My Decision</title>");
  });

  it("includes <h1> with the decision title", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision" });
    const html = formatDecisionHtml(record, repo as SrsRepository);
    expect(html).toContain("<h1>My Decision</h1>");
  });

  it("wraps each field in a <section> with an <h2>", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision", decision_statement: "We decided X." });
    const html = formatDecisionHtml(record, repo as SrsRepository);
    expect(html).toContain("<section>");
    expect(html).toContain("<h2>Decision Statement</h2>");
    expect(html).toContain("We decided X.");
  });

  it("HTML-escapes & in field values", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "Cats & Dogs", decision_statement: "Both & more." });
    const html = formatDecisionHtml(record, repo as SrsRepository);
    expect(html).not.toContain("Cats & Dogs");
    expect(html).toContain("Cats &amp; Dogs");
    expect(html).toContain("Both &amp; more.");
  });

  it("HTML-escapes < and > in field values", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "A > B", decision_statement: "<script>alert(1)</script>" });
    const html = formatDecisionHtml(record, repo as SrsRepository);
    expect(html).toContain("A &gt; B");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("skips absent fields", () => {
    const record = makeRecord();
    const repo = makeRepoStub({ title: "My Decision" });
    const html = formatDecisionHtml(record, repo as SrsRepository);
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
