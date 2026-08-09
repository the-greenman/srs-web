// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import SectionForm from "../src/lib/guides/SectionForm.svelte";
import type { CompositeFormDef } from "../src/lib/guides/blueprint-utils.js";
import type { CreateRecordInput, SrsRecord } from "../src/lib/srs-client.js";

// srs-web#266 — editing the top-left header cell of a table composite wipes
// every other column. Root cause: setHeader() only pads the `columns` sub-field
// array up to the index being edited, not to the table's true column count
// (which, when `columns` starts empty, is inferred from `rows[0].length`).

const tableComposite: CompositeFormDef = {
  name: "tables",
  label: "Decisions",
  order: 0,
  fields: [
    { label: "Columns", valueType: "text", required: false, name: "columns" },
    { label: "Rows", valueType: "text", required: true, name: "rows" },
  ],
};

function recordWithTwoColumnRows(): SrsRecord {
  return {
    instanceId: "rec-1",
    typeId: "type-1",
    typeVersion: 1,
    fieldValues: {
      tables: [
        {
          // columns intentionally absent — headers were never typed for this table
          rows: JSON.stringify([["A1", "B1"], ["A2", "B2"]]),
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

  it("emits the RFC-039 carrier: composite list as an array of name-keyed objects", async () => {
    const onSave = vi.fn();
    const { container } = render(SectionForm, {
      props: {
        label: "Table Section",
        fields: [{ label: "Heading", valueType: "string" as const, required: true, name: "heading" }],
        composites: [tableComposite],
        record: {
          ...recordWithTwoColumnRows(),
          fieldValues: {
            heading: "Process",
            ...recordWithTwoColumnRows().fieldValues,
          },
        },
        onSave,
        onCancel: () => {},
      },
    });

    const cell = container.querySelector<HTMLTextAreaElement>('[data-testid="te-cell"]');
    expect(cell).not.toBeNull();
    if (cell) await fireEvent.input(cell, { target: { value: "EDITED" } });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    if (form) await fireEvent.submit(form);

    expect(onSave).toHaveBeenCalledOnce();
    const input = onSave.mock.calls[0][0] as CreateRecordInput;
    expect(input.fieldValues.heading).toBe("Process");
    const tables = input.fieldValues.tables as Array<Record<string, string>>;
    expect(Array.isArray(tables)).toBe(true);
    expect(tables).toHaveLength(1);
    expect(JSON.parse(tables[0].rows)).toEqual([["EDITED", "B1"], ["A2", "B2"]]);
    // No groupValues in the RFC-039 input surface.
    expect("groupValues" in input).toBe(false);
  });
});
