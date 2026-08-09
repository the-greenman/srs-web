// @vitest-environment happy-dom
// Tests for src/lib/components/DecisionSummaryCard.svelte — the <tr> table-row component
// used in the Decision Log. Distinct from tests/DecisionSummaryCard.test.ts which tests
// the src/rendering/DecisionSummaryCard.svelte full-card renderer.
import { render } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import DecisionSummaryCardRow from "../src/lib/components/DecisionSummaryCard.svelte";
import type { SrsRecord } from "../src/lib/srs-client.js";

function makeRepo(statement: string | null = null) {
  return {
    get_field_value_by_name(_id: string, name: string): unknown {
      if (name === "decision_statement") return statement;
      return null;
    },
  };
}

function makeRecord(lifecycle?: string): SrsRecord {
  return {
    instanceId: "abc12345-0000-0000-0000-000000000000",
    typeId: "type-id",
    typeVersion: 1,
    fieldValues: {},
    displayLabel: "My Decision",
    lifecycle,
  };
}

describe("DecisionSummaryCardRow — lifecycle-driven status badge (srs-web#195)", () => {
  it("renders a Tag with the lifecycle state class when lifecycle is set", () => {
    const record = makeRecord("ratified");
    const { container } = render(DecisionSummaryCardRow, {
      props: { record, repo: makeRepo(), onclick: () => {} },
    });
    const tag = container.querySelector(".tag--ratified");
    expect(tag).not.toBeNull();
  });

  it("renders no Tag when lifecycle is undefined", () => {
    const record = makeRecord(undefined);
    const { container } = render(DecisionSummaryCardRow, {
      props: { record, repo: makeRepo(), onclick: () => {} },
    });
    expect(container.querySelector(".tag")).toBeNull();
  });

  it("renders tag for draft lifecycle state", () => {
    const record = makeRecord("draft");
    const { container } = render(DecisionSummaryCardRow, {
      props: { record, repo: makeRepo(), onclick: () => {} },
    });
    expect(container.querySelector(".tag--draft")).not.toBeNull();
  });

  it("renders tag for abandoned terminal state", () => {
    const record = makeRecord("abandoned");
    const { container } = render(DecisionSummaryCardRow, {
      props: { record, repo: makeRepo(), onclick: () => {} },
    });
    expect(container.querySelector(".tag--abandoned")).not.toBeNull();
  });

  it("displays the decision statement when provided", () => {
    const record = makeRecord("active");
    const { container } = render(DecisionSummaryCardRow, {
      props: { record, repo: makeRepo("We chose approach A."), onclick: () => {} },
    });
    expect(container.textContent).toContain("We chose approach A.");
  });

  it("uses displayLabel for the row title", () => {
    const record = makeRecord("active");
    const { container } = render(DecisionSummaryCardRow, {
      props: { record, repo: makeRepo(), onclick: () => {} },
    });
    expect(container.textContent).toContain("My Decision");
  });
});
