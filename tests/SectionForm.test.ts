// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import SectionForm from "../src/lib/guides/SectionForm.svelte";
import type { CompositeFormDef } from "../src/lib/guides/blueprint-utils.js";
import type { CreateRecordInput, SrsRecord } from "../src/lib/srs-client.js";

// srs-web#266 — editing the top-left header cell of a table composite wipes
// every other column. Root cause: setHeader() only pads the `columns` sub-field
// array up to the index being edited, not to the table's true column count
// (which, when `columns` starts empty, is inferred from the first row's cells).
//
// Post-RFC-036/#139 the table carrier is real lists: columns: string[],
// rows: [{cells: string[]}] — no JSON-encoded cell data anywhere.

const tableComposite: CompositeFormDef = {
  name: "tables",
  label: "Decisions",
  order: 0,
  fields: [
    { label: "Subheading", valueType: "string", required: false, name: "subheading" },
    { label: "Columns", valueType: "string", required: false, name: "columns" },
    { label: "Rows", valueType: "string", required: true, name: "rows" },
  ],
};

function recordWithTwoColumnRows(): SrsRecord {
  return {
    instanceId: "rec-1",
    typeId: "type-1",
    typeVersion: 2,
    fieldValues: {
      tables: [
        {
          // columns intentionally absent — headers were never typed for this table
          rows: [{ cells: ["A1", "B1"] }, { cells: ["A2", "B2"] }],
        },
      ],
    },
  };
}

describe("SectionForm table grid editor (srs-web#266)", () => {
  it("keeps every column visible after typing in the first header cell", async () => {
    const { container } = render(SectionForm, {
      props: {
        label: "Table Section",
        fields: [],
        composites: [tableComposite],
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
        composites: [tableComposite],
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

  it("emits real lists: columns string[], rows [{cells: string[]}] — no JSON strings", async () => {
    const onSave = vi.fn();
    const record = recordWithTwoColumnRows();
    record.fieldValues.heading = "Process";
    const { container } = render(SectionForm, {
      props: {
        label: "Table Section",
        fields: [{ label: "Heading", valueType: "string" as const, required: true, name: "heading" }],
        composites: [tableComposite],
        record,
        onSave,
        onCancel: () => {},
      },
    });

    const cell = container.querySelector<HTMLTextAreaElement>('[data-testid="te-cell"]');
    expect(cell).not.toBeNull();
    if (cell) await fireEvent.input(cell, { target: { value: "EDITED" } });
    const header = container.querySelector<HTMLTextAreaElement>('[data-testid="te-header"]');
    if (header) await fireEvent.input(header, { target: { value: "Type" } });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    if (form) await fireEvent.submit(form);

    expect(onSave).toHaveBeenCalledOnce();
    const input = onSave.mock.calls[0][0] as CreateRecordInput;
    expect(input.fieldValues.heading).toBe("Process");
    const tables = input.fieldValues.tables as Array<Record<string, unknown>>;
    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([{ cells: ["EDITED", "B1"] }, { cells: ["A2", "B2"] }]);
    // Header edit pads columns to the full row width (srs-web#266) as a real list.
    expect(tables[0].columns).toEqual(["Type", ""]);
    // No groupValues in the RFC-039 input surface.
    expect("groupValues" in input).toBe(false);
  });
});
