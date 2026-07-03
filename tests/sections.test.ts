/**
 * Unit tests for sections.ts — buildDynamicSections() helper (ADR-006).
 *
 * All functions are pure; no WASM interaction. Tests cover section derivation
 * from TYPE_REGISTRY (always visible) and from unknown records.
 *
 * Release 1 (srs-web#110): TYPE_REGISTRY contains only the decision type.
 * Article and role type IDs are kept as local constants for unknown-type tests.
 */

import { describe, expect, it } from "vitest";
import type { SrsRecord } from "../src/lib/srs-client.js";
import { buildDynamicSections } from "../src/lib/governance/sections.js";
import type { SectionKey } from "../src/lib/governance/sections.js";

const ARTICLE_TYPE_ID = "a1142ac3-5385-5c0e-8630-1dd3432cdf7f";
const DECISION_TYPE_ID = "1fcad6a2-9f78-5e41-94ba-d82e88b822f3";
const ROLE_TYPE_ID = "e53dce11-6b83-5714-a8fe-f730edb500fa";

function makeRecord(typeId: string, typeName?: string, overrides: Partial<SrsRecord> = {}): SrsRecord {
  return {
    instanceId: `inst-${typeId.slice(0, 8)}`,
    typeId,
    typeVersion: 1,
    typeNamespace: "governance",
    typeName,
    fieldValues: [],
    ...overrides,
  };
}

describe("buildDynamicSections", () => {
  it("returns exactly 1 section from an empty record list (decision-only registry)", () => {
    const sections = buildDynamicSections([]);
    expect(sections).toHaveLength(1);
  });

  it("returns decision as the only section when record list is empty", () => {
    const sections = buildDynamicSections([]);
    expect(sections[0].typeName).toBe("decision");
  });

  it("decision section has the correct label and icon", () => {
    const sections = buildDynamicSections([]);
    const decisions = sections.find((s) => s.typeId === DECISION_TYPE_ID);
    expect(decisions?.label).toBe("Decision Log");
    expect(decisions?.icon).toBe("⊕");
  });

  it("does not duplicate the decision section when records include a decision", () => {
    const records = [makeRecord(DECISION_TYPE_ID, "decision")];
    const sections = buildDynamicSections(records);
    expect(sections).toHaveLength(1);
  });

  it("appends a 2nd section for an unknown typeId found in records", () => {
    const unknownId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const records = [makeRecord(unknownId, "motion")];
    const sections = buildDynamicSections(records);
    expect(sections).toHaveLength(2);
    const motionSection = sections[1];
    expect(motionSection.typeId).toBe(unknownId);
    expect(motionSection.label).toBe("Motion");
    expect(motionSection.icon).toBe("◻");
  });

  it("only adds one section per unknown typeId even with multiple records", () => {
    const unknownId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const records = [
      makeRecord(unknownId, "motion"),
      makeRecord(unknownId, "motion"),
      makeRecord(unknownId, "motion"),
    ];
    const sections = buildDynamicSections(records);
    expect(sections).toHaveLength(2);
  });

  it("article and role type IDs are treated as unknown types (not in TYPE_REGISTRY)", () => {
    const records = [
      makeRecord(ARTICLE_TYPE_ID, "article"),
      makeRecord(ROLE_TYPE_ID, "role"),
    ];
    const sections = buildDynamicSections(records);
    // 1 known (decision) + 2 unknown (article, role)
    expect(sections).toHaveLength(3);
    expect(sections.find((s) => s.typeId === ARTICLE_TYPE_ID)).toBeDefined();
    expect(sections.find((s) => s.typeId === ROLE_TYPE_ID)).toBeDefined();
  });

  it("unknown type with typeName undefined falls back to typeId as label", () => {
    const unknownId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const records = [makeRecord(unknownId, undefined)];
    const sections = buildDynamicSections(records);
    const unknownSection = sections.find((s) => s.typeId === unknownId);
    // labelFromTypeName(unknownId) — capitalises first char of the UUID
    expect(unknownSection?.label).toBe("Aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("skips records with falsy typeId", () => {
    const records = [
      makeRecord("", "article"),
      { instanceId: "x", typeId: "", typeVersion: 1, fieldValues: [] } as SrsRecord,
    ];
    const sections = buildDynamicSections(records);
    // Only TYPE_REGISTRY entry (decision)
    expect(sections).toHaveLength(1);
  });

  it("SectionKey is assignable from a string literal (type check)", () => {
    const key: SectionKey = ARTICLE_TYPE_ID;
    expect(typeof key).toBe("string");
  });

  it("section keys are the typeId UUIDs", () => {
    const sections = buildDynamicSections([]);
    for (const section of sections) {
      expect(section.key).toBe(section.typeId);
    }
  });

  it("unknown type with underscored typeName converts underscores to spaces", () => {
    const unknownId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const records = [makeRecord(unknownId, "motion_type")];
    const sections = buildDynamicSections(records);
    const s = sections.find((s) => s.typeId === unknownId);
    expect(s?.label).toBe("Motion type");
  });
});
