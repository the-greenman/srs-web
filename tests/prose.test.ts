import { describe, expect, it } from "vitest";
import { firstLine } from "../src/lib/prose.js";

describe("firstLine", () => {
  it("takes the first sentence as plain text", () => {
    expect(firstLine("## Heading\n\nThe **first** sentence is here. The second is not.")).toBe("Heading The first sentence is here.");
    expect(firstLine("See [the guide](https://x.example) for how it works. More.")).toBe("See the guide for how it works.");
  });
  it("keeps underscores inside words and drops emphasis ones", () => {
    expect(firstLine("Set field_name and _then_ save the record now.")).toBe("Set field_name and then save the record now.");
  });
  it("cuts a long text with no early sentence end", () => {
    const s = "word ".repeat(60);
    expect(firstLine(s).endsWith("…")).toBe(true);
    expect(firstLine(s).length).toBe(181);
  });
});
