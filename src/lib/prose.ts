/**
 * prose — how a record splits into what prose reading shows (ADR-024): the main body, secondary long
 * fields, meta chips and composites. RecordProse renders it; the Read view takes each item's first line
 * from the same body, so a page and its listing never pick different text. Pure, presentation only.
 */
import type { CompositeFormDef } from "$lib/editor/blueprint-fields.js";
import type { FieldFormDef } from "$lib/governance/types.js";
import { fieldLabel } from "$lib/labels.js";
import type { SrsRecord } from "$lib/srs-client.js";

export const str = (v: unknown) =>
  v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
const has = (v: unknown) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);

export interface ProseView {
  body: string;
  secondary: { label: string; value: string }[];
  meta: { label: string; value: string }[];
  tables: (CompositeFormDef & { entries: Record<string, unknown>[] })[];
}

/** The record split into what prose shows: body, secondary long fields, meta chips, composites. */
export function proseView(
  record: SrsRecord,
  fields: FieldFormDef[],
  composites: CompositeFormDef[]
): ProseView {
  const vals = record.fieldValues;
  const composite = new Set(composites.map((c) => c.name));
  const all: { name: string; label: string; valueType: string }[] =
    fields.length > 0
      ? fields
      : Object.keys(vals)
          .filter((name) => !composite.has(name))
          .map((name) => ({ name, label: fieldLabel({ name }), valueType: "string" }));
  const shown = all.filter((f) => has(vals[f.name]) && vals[f.name] !== record.displayLabel);
  // ponytail: presentation limit, no ADR-025 gap — "long" = a markdown field, a text field over 40
  // characters, any other value over 80, or a line break (a short plain-text id like "C-08" stays a
  // chip); a presentation heuristic, not a schema fact.
  const isLong = (f: (typeof shown)[number]) => {
    const v = vals[f.name];
    return (
      !Array.isArray(v) &&
      (f.valueType === "markdown" ||
        str(v).length > (f.valueType === "text" ? 40 : 80) ||
        str(v).includes("\n"))
    );
  };
  const long = shown.filter(isLong);
  const body = long.find((f) => f.valueType === "markdown") ?? long[0];
  const meta = shown
    .filter((f) => !isLong(f))
    .flatMap((f) =>
      (Array.isArray(vals[f.name]) ? (vals[f.name] as unknown[]) : [vals[f.name]])
        .filter((x) => x != null && typeof x !== "object")
        .map((x) => ({ label: f.label, value: String(x) }))
    );
  const tables = composites
    .map((c) => ({
      ...c,
      entries: (Array.isArray(vals[c.name]) ? vals[c.name] : []) as Record<string, unknown>[],
    }))
    .filter((c) => c.entries.length > 0);
  return {
    body: body ? str(vals[body.name]) : "",
    secondary: long
      .filter((f) => f !== body)
      .map((f) => ({ label: f.label, value: str(vals[f.name]) })),
    meta,
    tables,
  };
}

/**
 * The first sentence of a text, as one plain line: markdown marks and line breaks dropped, cut at the
 * first sentence end between 20 and 200 characters, else at 180 with an ellipsis.
 */
export function firstLine(text: string): string {
  const s = text
    .replace(/[#>*_`]+/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const cut = s.search(/[.!?](\s|$)/);
  if (cut >= 20 && cut < 200) return s.slice(0, cut + 1);
  return s.length > 180 ? `${s.slice(0, 180)}…` : s;
}
