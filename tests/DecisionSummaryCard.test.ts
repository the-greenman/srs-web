// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import DecisionSummaryCard from "../src/rendering/DecisionSummaryCard.svelte";
import { FIELD_META_KEY } from "../src/lib/governance/field-meta.js";
import { REPO_CONTEXT_KEY } from "../src/lib/governance/repo-context.js";
import type { FieldFormDef } from "../src/lib/governance/types.js";
import type { FieldValues, SrsRecord } from "../src/lib/srs-client.js";

// srs-web#217 — DecisionSummaryCard now reads field values via repo.get_field_value_by_name.

const fieldMetaMap: Map<string, FieldFormDef> = new Map([
  [
    "decision_statement",
    {
      name: "decision_statement",
      label: "Decision Statement",
      valueType: "text",
      required: true,
    },
  ],
  [
    "rationale",
    {
      name: "rationale",
      label: "Rationale",
      valueType: "text",
      required: false,
    },
  ],
]);

function makeRecord(fieldValues: FieldValues, displayLabel?: string): SrsRecord {
  return {
    instanceId: "test-instance-id",
    typeId: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    typeVersion: 1,
    fieldValues,
    displayLabel,
  };
}

function makeCtxOptions(fieldValues: FieldValues) {
  const repoMock = {
    get_field_value_by_name(_instanceId: string, name: string): unknown {
      return fieldValues[name] ?? null;
    },
  };
  const repoContext = { get repo() { return repoMock; } };
  return {
    context: new Map([
      [FIELD_META_KEY, { get meta() { return fieldMetaMap; } }],
      [REPO_CONTEXT_KEY, repoContext],
    ]),
  };
}

describe("DecisionSummaryCard (srs-web#217)", () => {
  it("renders a SUMMARY_FIELDS value fetched via repo context", () => {
    const fieldValues = { decision_statement: "We chose approach A." };
    const record = makeRecord(fieldValues, "My Decision");
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.textContent).toContain("We chose approach A.");
  });

  it("uses displayLabel for the card title", () => {
    const fieldValues = { decision_statement: "Some statement." };
    const record = makeRecord(fieldValues, "Override Title");
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.textContent).toContain("Override Title");
  });

  it("falls back to instanceId prefix when displayLabel is absent", () => {
    const fieldValues = { decision_statement: "Some statement." };
    const record = makeRecord(fieldValues);
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    // instanceId.slice(0, 8) = "test-ins"
    expect(container.textContent).toContain("test-ins");
  });

  it("skips fields with null or empty values", () => {
    const fieldValues: FieldValues = {};
    const record = makeRecord(fieldValues, "Empty");
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.querySelector(".card__field")).toBeNull();
  });
});
