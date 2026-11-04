import { describe, expect, it } from "vitest";
import { locatorFor } from "../src/lib/essay/quote";

describe("locatorFor (srs-web#525)", () => {
  const text = "# Intro\nfirst line\nsecond line\n\n## Method\nthird line\nfourth line";
  it("names the nearest heading above the passage", () => {
    expect(locatorFor(text, "third line")).toBe("Method");
    expect(locatorFor(text, "first line")).toBe("Intro");
  });
  it("falls back to the line range when there is no heading", () => {
    expect(locatorFor("a\nb\nc\nd", "b")).toBe("line 2");
    expect(locatorFor("a\nb\nc\nd", "b\nc")).toBe("lines 2-3");
  });
  it("is empty when the words are not in the text", () => {
    expect(locatorFor(text, "nope")).toBe("");
  });
});
