import { describe, expect, it } from "vitest";
import { fieldLabel, humanise } from "$lib/labels.js";

describe("labels", () => {
  it("humanise splits dots, dashes and underscores", () => {
    expect(humanise("section.text")).toBe("Section text");
    expect(humanise("source_kind")).toBe("Source kind");
    expect(humanise("depends-on")).toBe("Depends on");
    expect(humanise("homepage-hero")).toBe("Homepage hero");
  });
  it("fieldLabel returns the title when present", () => {
    expect(fieldLabel({ name: "source_kind", title: "Kind of source" })).toBe("Kind of source");
  });
  it("fieldLabel humanises the name when the title is empty or absent", () => {
    expect(fieldLabel({ name: "source_kind", title: "" })).toBe("Source kind");
    expect(fieldLabel({ name: "source_kind" })).toBe("Source kind");
  });
});
