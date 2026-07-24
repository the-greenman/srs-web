// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import SectionForm from "../src/lib/guides/SectionForm.svelte";
import type { GroupFormDef } from "../src/lib/guides/blueprint-utils.js";
import type { SrsRecord } from "../src/lib/srs-client.js";

// srs-web#266 — editing the top-left header cell of a table group wipes every
// other column. Root cause: setHeader() only pads the `columns` sub-field array
// up to the index being edited, not to the table's true column count (which,
// when `columns` starts empty, is inferred from `rows[0].length`). Editing
// column 0 first collapses `columns` to length 1, and colCount() then trusts
// `columns.length` over the row width — hiding every column past the first.

const COLUMNS_FIELD = "field-columns";
const ROWS_FIELD = "field-rows";

const tableGroup: GroupFormDef = {
  groupId: "group-table",
  label: "Decisions",
  order: 0,
  repeatable: true,
  compositeRenderer: "table",
  fields: [
    { fieldId: COLUMNS_FIELD, label: "Columns", valueType: "text", required: false, name: "columns" },
    { fieldId: ROWS_FIELD, label: "Rows", valueType: "text", required: false, name: "rows" },
  ],
};

function recordWithTwoColumnRows(): SrsRecord {
  return {
    instanceId: "rec-1",
    typeId: "type-1",
    typeVersion: 1,
    fieldValues: [],
    groupValues: [
      {
        groupId: "group-table",
        entries: [
          {
            fieldValues: [
              // columns intentionally empty — headers were never typed for this table
              { fieldId: COLUMNS_FIELD, value: "" },
              { fieldId: ROWS_FIELD, value: JSON.stringify([["A1", "B1"], ["A2", "B2"]]) },
            ],
          },
        ],
      },
    ],
  };
}

describe("SectionForm table grid editor (srs-web#266)", () => {
  it("keeps every column visible after typing in the first header cell", async () => {
    const { container } = render(SectionForm, {
      props: {
        label: "Table Section",
        fields: [],
        groups: [tableGroup],
        record: recordWithTwoColumnRows(),
        onSave: () => {},
        onCancel: () => {},
      },
    });

    const headers = container.querySelectorAll<HTMLTextAreaElement>('[data-testid="te-header"]');
    expect(headers.length).toBe(2);

    await fireEvent.input(headers[0], { target: { value: "First" } });

    const headersAfter = container.querySelectorAll<HTMLTextAreaElement>('[data-testid="te-header"]');
    expect(headersAfter.length).toBe(2);

    const rows = container.querySelectorAll<HTMLElement>('[data-testid="te-row"]');
    expect(rows.length).toBe(2);
    const firstRowCells = rows[0].querySelectorAll<HTMLTextAreaElement>('[data-testid="te-cell"]');
    expect(firstRowCells.length).toBe(2);
    expect(firstRowCells[1].value).toBe("B1");
  });

  it("keeps every column visible regardless of edit order (second column first)", async () => {
    const { container } = render(SectionForm, {
      props: {
        label: "Table Section",
        fields: [],
        groups: [tableGroup],
        record: recordWithTwoColumnRows(),
        onSave: () => {},
        onCancel: () => {},
      },
    });

    const headers = container.querySelectorAll<HTMLTextAreaElement>('[data-testid="te-header"]');
    await fireEvent.input(headers[1], { target: { value: "Second" } });

    const headersAfter = container.querySelectorAll<HTMLTextAreaElement>('[data-testid="te-header"]');
    expect(headersAfter.length).toBe(2);
  });
});
