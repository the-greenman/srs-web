// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import DecisionSummaryCard from "../src/rendering/DecisionSummaryCard.svelte";
import { FIELD_META_KEY } from "../src/lib/governance/field-meta.js";
import { REPO_CONTEXT_KEY } from "../src/lib/governance/repo-context.js";
import type { FieldFormDef } from "../src/lib/governance/types.js";
import type { SrsRecord, FieldValue } from "../src/lib/srs-client.js";

// srs-web#217 — DecisionSummaryCard now reads field values via repo.get_field_value_by_name.

const DECISION_STATEMENT_ID = "de1296e0-e083-58d9-97a0-cb2b91fec02e";
const RATIONALE_ID = "b1c2d3e4-0000-0000-0000-000000000001";

const fieldMetaMap: Map<string, FieldFormDef> = new Map([
  [
    DECISION_STATEMENT_ID,
    {
      fieldId: DECISION_STATEMENT_ID,
      name: "decision_statement",
      label: "Decision Statement",
      valueType: "text",
      required: true,
    },
  ],
  [
    RATIONALE_ID,
    {
      fieldId: RATIONALE_ID,
      name: "rationale",
      label: "Rationale",
      valueType: "text",
      required: false,
    },
  ],
]);

function makeRecord(fieldValues: FieldValue[], displayLabel?: string): SrsRecord {
  return {
    instanceId: "test-instance-id",
    typeId: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    typeVersion: 1,
    fieldValues,
    displayLabel,
  };
}

function makeCtxOptions(fieldValues: FieldValue[]) {
  const repoMock = {
    get_field_value_by_name(_instanceId: string, name: string): unknown {
      for (const [fieldId, def] of fieldMetaMap) {
        if (def.name === name) {
          return fieldValues.find((fv) => fv.fieldId === fieldId)?.value ?? null;
        }
      }
      return null;
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
    const fieldValues = [{ fieldId: DECISION_STATEMENT_ID, value: "We chose approach A." }];
    const record = makeRecord(fieldValues, "My Decision");
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.textContent).toContain("We chose approach A.");
  });

  it("uses displayLabel for the card title", () => {
    const fieldValues = [{ fieldId: DECISION_STATEMENT_ID, value: "Some statement." }];
    const record = makeRecord(fieldValues, "Override Title");
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.textContent).toContain("Override Title");
  });

  it("falls back to instanceId prefix when displayLabel is absent", () => {
    const fieldValues = [{ fieldId: DECISION_STATEMENT_ID, value: "Some statement." }];
    const record = makeRecord(fieldValues);
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    // instanceId.slice(0, 8) = "test-ins"
    expect(container.textContent).toContain("test-ins");
  });

  it("skips fields with null or empty values", () => {
    const fieldValues: FieldValue[] = [];
    const record = makeRecord(fieldValues, "Empty");
    const { container } = render(DecisionSummaryCard, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.querySelector(".card__field")).toBeNull();
  });
});
