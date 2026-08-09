// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import DecisionView from "../src/rendering/DecisionView.svelte";
import { FIELD_META_KEY } from "../src/lib/governance/field-meta.js";
import { REPO_CONTEXT_KEY } from "../src/lib/governance/repo-context.js";
import type { FieldFormDef } from "../src/lib/governance/types.js";
import type { FieldValues, SrsRecord } from "../src/lib/srs-client.js";

// srs-web#213 — DecisionView threads FieldFormDef description/instructions
// into CardField. Post-RFC-039 the fieldMeta map is keyed by field NAME.

const fieldMetaMap: Map<string, FieldFormDef> = new Map([
  [
    "decision_statement",
    {
      name: "decision_statement",
      label: "Decision Statement",
      description: "What was decided.",
      instructions: "Be concise. One to two sentences.",
      valueType: "text",
      required: true,
    },
  ],
  [
    "title",
    {
      name: "title",
      label: "Title",
      // no description, no instructions — regression case
      valueType: "string",
      required: true,
    },
  ],
]);

const fieldMetaContext = { get meta() { return fieldMetaMap; } };

function makeRecord(fieldValues: FieldValues): SrsRecord {
  return {
    instanceId: "test-record-id",
    typeId: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    typeVersion: 1,
    fieldValues,
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
      [FIELD_META_KEY, fieldMetaContext],
      [REPO_CONTEXT_KEY, repoContext],
    ]),
  };
}

describe("DecisionView field help threading (srs-web#213)", () => {
  it("shows the description caption for a field that has description set", () => {
    const fieldValues = { decision_statement: "We will meet monthly." };
    const record = makeRecord(fieldValues);
    const { container } = render(DecisionView, { props: { record }, ...makeCtxOptions(fieldValues) });
    // "What was decided." !== "Decision Statement" → caption must appear
    expect(container.querySelector(".card__field-description")?.textContent).toBe("What was decided.");
  });

  it("shows the ⓘ info toggle for a field that has instructions set", () => {
    const fieldValues = { decision_statement: "We will meet monthly." };
    const record = makeRecord(fieldValues);
    const { container } = render(DecisionView, { props: { record }, ...makeCtxOptions(fieldValues) });
    const btn = container.querySelector<HTMLButtonElement>(".card__field-info");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-label")).toBe("Show instructions for Decision Statement");
  });

  it("reveals instructions paragraph on toggle click", async () => {
    const fieldValues = { decision_statement: "We will meet monthly." };
    const record = makeRecord(fieldValues);
    const { container } = render(DecisionView, { props: { record }, ...makeCtxOptions(fieldValues) });
    const btn = container.querySelector<HTMLButtonElement>(".card__field-info")!;
    await fireEvent.click(btn);
    expect(container.querySelector(".card__field-instructions")?.textContent).toBe(
      "Be concise. One to two sentences.",
    );
    expect(btn.getAttribute("aria-label")).toBe("Hide instructions for Decision Statement");
  });

  it("renders no caption or toggle for a field with no description/instructions in fieldMeta", () => {
    // title field has no description or instructions
    const fieldValues = { title: "Meeting cadence" };
    const record = makeRecord(fieldValues);
    const { container } = render(DecisionView, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.querySelector(".card__field-description")).toBeNull();
    expect(container.querySelector(".card__field-info")).toBeNull();
  });

  it("renders no caption or toggle for a field not in fieldMeta at all", () => {
    // field unknown to the decision profile — get_field_value_by_name returns null, field is skipped
    const fieldValues = { some_unknown_field: "some value" };
    const record = makeRecord(fieldValues);
    const { container } = render(DecisionView, { props: { record }, ...makeCtxOptions(fieldValues) });
    expect(container.querySelector(".card__field-description")).toBeNull();
    expect(container.querySelector(".card__field-info")).toBeNull();
  });
});
