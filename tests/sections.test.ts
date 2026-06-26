/**
 * Unit tests for sections.ts — buildDynamicSections() helper (ADR-006).
 *
 * All functions are pure; no WASM interaction. Tests cover section derivation
 * from KNOWN_TYPE_CONFIG (always visible) and from unknown records.
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
  it("returns exactly 3 sections from an empty record list", () => {
    const sections = buildDynamicSections([]);
    expect(sections).toHaveLength(3);
  });

  it("returns sections in order: articles, decisions, roles", () => {
    const sections = buildDynamicSections([]);
    expect(sections[0].typeName).toBe("article");
    expect(sections[1].typeName).toBe("decision");
    expect(sections[2].typeName).toBe("role");
  });

  it("each known section has the correct label and icon", () => {
    const sections = buildDynamicSections([]);
    const articles = sections.find((s) => s.typeId === ARTICLE_TYPE_ID);
    expect(articles?.label).toBe("Articles");
    expect(articles?.icon).toBe("§");

    const decisions = sections.find((s) => s.typeId === DECISION_TYPE_ID);
    expect(decisions?.label).toBe("Decision Log");
    expect(decisions?.icon).toBe("⊕");

    const roles = sections.find((s) => s.typeId === ROLE_TYPE_ID);
    expect(roles?.label).toBe("Roles");
    expect(roles?.icon).toBe("◈");
  });

  it("does not duplicate known types when records include them", () => {
    const records = [
      makeRecord(ARTICLE_TYPE_ID, "article"),
      makeRecord(DECISION_TYPE_ID, "decision"),
      makeRecord(ROLE_TYPE_ID, "role"),
    ];
    const sections = buildDynamicSections(records);
    expect(sections).toHaveLength(3);
  });

  it("appends a 4th section for an unknown typeId found in records", () => {
    const unknownId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const records = [makeRecord(unknownId, "motion")];
    const sections = buildDynamicSections(records);
    expect(sections).toHaveLength(4);
    const motionSection = sections[3];
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
    expect(sections).toHaveLength(4);
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
    // Only KNOWN_TYPE_CONFIG entries
    expect(sections).toHaveLength(3);
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
