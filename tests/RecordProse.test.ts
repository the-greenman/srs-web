// @vitest-environment happy-dom
import { render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/srs-client.js", async (orig) => ({
  ...(await orig<object>()),
  renderMarkdown: (s: string) => `<p>${s}</p>`,
}));
import type { FieldFormDef } from "../src/lib/governance/types.js";
import type { SrsRecord } from "../src/lib/srs-client.js";
import RecordProse from "../src/rendering/RecordProse.svelte";

const record = (fieldValues: Record<string, unknown>, displayLabel = "A claim"): SrsRecord => ({
  instanceId: "r-1",
  typeId: "t",
  typeVersion: 1,
  displayLabel,
  fieldValues,
});
const f = (name: string, label: string, valueType: FieldFormDef["valueType"], extra: Partial<FieldFormDef> = {}): FieldFormDef => ({
  name,
  label,
  valueType,
  required: false,
  ...extra,
});

describe("RecordProse", () => {
  it("first markdown field is the unlabelled body", () => {
    const { container } = render(RecordProse, {
      record: record({ note: "x".repeat(100), body: "The **body**." }),
      fields: [f("note", "Note", "text"), f("body", "Body", "markdown")],
      composites: [],
    });
    expect(container.querySelector('[data-part="body"]')?.textContent).toContain("The **body**.");
    const labels = [...container.querySelectorAll('[data-part="label"]')].map((e) => e.textContent);
    expect(labels).toEqual(["Note"]);
  });

  it("short values render as one chip line", () => {
    const { container } = render(RecordProse, {
      record: record({ kind: "mechanism", level: "observed", tags: ["a", "b"] }),
      fields: [f("kind", "Kind", "select"), f("level", "Level", "select"), f("tags", "Tags", "string")],
      composites: [],
    });
    const meta = container.querySelectorAll('[data-part="meta"]');
    expect(meta).toHaveLength(1);
    expect(meta[0].textContent).toContain("mechanism");
    expect(meta[0].textContent).toContain("observed");
    expect(meta[0].querySelectorAll(".tag-chip, [title]").length).toBeGreaterThanOrEqual(4);
  });

  it("empty fields and aiGuidance are never shown", () => {
    const { container } = render(RecordProse, {
      record: record({ kind: "", body: "Body text that is long enough to read as a body.\nTwo lines." }),
      fields: [
        f("kind", "Kind", "select"),
        f("body", "Body", "text", {
          aiGuidance: "GUIDANCE-TEXT",
          description: "DESCRIPTION-TEXT",
          required: true,
        }),
        f("missing", "Missing", "string"),
      ],
      composites: [],
    });
    const t = container.textContent ?? "";
    expect(t).not.toContain("GUIDANCE-TEXT");
    expect(t).not.toContain("DESCRIPTION-TEXT");
    expect(t).not.toContain("Kind");
    expect(t).not.toContain("Missing");
    expect(t).not.toContain("*");
    expect(container.querySelector('[data-part="meta"]')).toBeNull();
  });

  it("an inline composite renders as a table", () => {
    const { container } = render(RecordProse, {
      record: record({ steps: [{ who: "Ann", what: "Draft" }, { who: "Bo", what: "Review" }] }),
      fields: [],
      composites: [
        { name: "steps", label: "Steps", order: 1, fields: [f("who", "Who", "string"), f("what", "What", "string")] },
      ],
    });
    const table = container.querySelector('[data-part="composite"] table');
    expect([...(table?.querySelectorAll("th") ?? [])].map((e) => e.textContent)).toEqual(["Who", "What"]);
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("the field equal to displayLabel is not repeated", () => {
    const { container } = render(RecordProse, {
      record: record({ title: "A claim", kind: "stance" }),
      fields: [f("title", "Title", "string"), f("kind", "Kind", "select")],
      composites: [],
    });
    expect(container.querySelector('[data-part="title"]')?.textContent).toBe("A claim");
    expect(container.textContent?.match(/A claim/g)).toHaveLength(1);
  });

  it("labels come from fieldLabel", () => {
    // With no schema fields, every stored value is labelled by fieldLabel (the humanised name).
    const { container } = render(RecordProse, {
      record: record({ summary: "x".repeat(100), source_kind: "y".repeat(100), short_code: "C-08" }),
      fields: [],
      composites: [],
    });
    expect(container.querySelector('[data-part="label"]')?.textContent).toBe("Source kind");
    expect(container.querySelector('[data-part="meta"] [title]')?.getAttribute("title")).toBe("Short code");
  });
});
