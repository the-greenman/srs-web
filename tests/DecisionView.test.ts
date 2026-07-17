// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import DecisionView from "../src/rendering/DecisionView.svelte";
import { FIELD_META_KEY } from "../src/lib/governance/field-meta.js";
import type { FieldFormDef } from "../src/lib/governance/types.js";
import type { SrsRecord, FieldValue } from "../src/lib/srs-client.js";

// srs-web#213 — DecisionView now threads FieldFormDef description/instructions
// into CardField, matching the RecordView treatment from #211.

const DECISION_STATEMENT_ID = "de1296e0-e083-58d9-97a0-cb2b91fec02e";
const TITLE_ID = "d7e82557-9045-5e92-a494-d99112bbec4a";

const fieldMetaMap: Map<string, FieldFormDef> = new Map([
  [
    DECISION_STATEMENT_ID,
    {
      fieldId: DECISION_STATEMENT_ID,
      name: "decision_statement",
      label: "Decision Statement",
      description: "What was decided.",
      instructions: "Be concise. One to two sentences.",
      valueType: "text",
      required: true,
    },
  ],
  [
    TITLE_ID,
    {
      fieldId: TITLE_ID,
      name: "title",
      label: "Title",
      // no description, no instructions — regression case
      valueType: "string",
      required: true,
    },
  ],
]);

const fieldMetaContext = { get meta() { return fieldMetaMap; } };

function makeRecord(fieldValues: FieldValue[]): SrsRecord {
  return {
    instanceId: "test-record-id",
    typeId: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    typeVersion: 1,
    fieldValues,
  };
}

const ctxOptions = {
  context: new Map([[FIELD_META_KEY, fieldMetaContext]]),
};

describe("DecisionView field help threading (srs-web#213)", () => {
  it("shows the description caption for a field that has description set", () => {
    const record = makeRecord([{ fieldId: DECISION_STATEMENT_ID, value: "We will meet monthly." }]);
    const { container } = render(DecisionView, { props: { record }, ...ctxOptions });
    // "What was decided." !== "Decision Statement" → caption must appear
    expect(container.querySelector(".card__field-description")?.textContent).toBe("What was decided.");
  });

  it("shows the ⓘ info toggle for a field that has instructions set", () => {
    const record = makeRecord([{ fieldId: DECISION_STATEMENT_ID, value: "We will meet monthly." }]);
    const { container } = render(DecisionView, { props: { record }, ...ctxOptions });
    const btn = container.querySelector<HTMLButtonElement>(".card__field-info");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-label")).toBe("Show instructions for Decision Statement");
  });

  it("reveals instructions paragraph on toggle click", async () => {
    const record = makeRecord([{ fieldId: DECISION_STATEMENT_ID, value: "We will meet monthly." }]);
    const { container } = render(DecisionView, { props: { record }, ...ctxOptions });
    const btn = container.querySelector<HTMLButtonElement>(".card__field-info")!;
    await fireEvent.click(btn);
    expect(container.querySelector(".card__field-instructions")?.textContent).toBe(
      "Be concise. One to two sentences.",
    );
    expect(btn.getAttribute("aria-label")).toBe("Hide instructions for Decision Statement");
  });

  it("renders no caption or toggle for a field with no description/instructions in fieldMeta", () => {
    // title field has no description or instructions
    const record = makeRecord([{ fieldId: TITLE_ID, value: "Meeting cadence" }]);
    const { container } = render(DecisionView, { props: { record }, ...ctxOptions });
    expect(container.querySelector(".card__field-description")).toBeNull();
    expect(container.querySelector(".card__field-info")).toBeNull();
  });

  it("renders no caption or toggle for a field not in fieldMeta at all", () => {
    // field unknown to fieldMeta — getFieldValueByName returns undefined, field is skipped
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const record = makeRecord([{ fieldId: unknownId, value: "some value" }]);
    const { container } = render(DecisionView, { props: { record }, ...ctxOptions });
    expect(container.querySelector(".card__field-description")).toBeNull();
    expect(container.querySelector(".card__field-info")).toBeNull();
  });
});
