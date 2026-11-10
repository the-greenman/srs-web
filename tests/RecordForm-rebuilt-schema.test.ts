// @vitest-environment happy-dom
// srs-web#772: an agent write bumps the document revision and the shell rebuilds its form
// schemas (new objects, same content). The open form must keep what the person has typed.
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import RecordForm from "../src/lib/components/RecordForm.svelte";
import type { TypeFormDef } from "../src/lib/governance/types.js";

const makeSchema = (): TypeFormDef => ({
  typeId: "t1",
  typeVersion: 1,
  typeNamespace: "ns",
  typeName: "decision",
  label: "Decision",
  fields: [{ name: "title", label: "Title", valueType: "string", required: false }],
});

describe("RecordForm keeps typed text across a rebuilt schema (srs-web#772)", () => {
  it("does not clear a field when an equal schema object arrives", async () => {
    const props = { schema: makeSchema(), record: null, onSave: vi.fn(), onCancel: vi.fn(), saving: false, saveError: null };
    const { container, rerender } = render(RecordForm, { props });
    const input = container.querySelector("input, textarea") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "typed by a person" } });
    expect((container.querySelector("input, textarea") as HTMLInputElement).value).toBe("typed by a person");
    await rerender({ ...props, schema: makeSchema() });
    expect((container.querySelector("input, textarea") as HTMLInputElement).value).toBe("typed by a person");
  });
});
