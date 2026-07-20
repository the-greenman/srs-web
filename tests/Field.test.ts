// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import Field from "../src/lib/components/Field.svelte";

// srs-web#176 — the shared Field frame surfaces a field's description inline and
// its fuller instructions behind an accessible info toggle.

describe("Field help text and instructions toggle", () => {
  it("shows the description as inline help", () => {
    const { container } = render(Field, {
      props: { label: "Rationale", description: "Why this option over the alternatives.", id: "f1" },
    });
    expect(container.querySelector(".field__help")?.textContent).toBe(
      "Why this option over the alternatives.",
    );
  });

  it("suppresses the description when it is identical to the label (no duplicate)", () => {
    const text = "Why this option over the alternatives.";
    const { container } = render(Field, { props: { label: text, description: text, id: "f2" } });
    expect(container.querySelector(".field__help")).toBeNull();
  });

  it("renders no info toggle when the field has no instructions", () => {
    const { container } = render(Field, {
      props: { label: "Rationale", description: "x", id: "f3" },
    });
    expect(container.querySelector(".field__info")).toBeNull();
  });

  it("reveals the instructions when the info toggle is activated", async () => {
    const instructions = "Say what made this the right choice, in two to four sentences.";
    const { container } = render(Field, {
      props: { label: "Rationale", instructions, id: "f4" },
    });
    const btn = container.querySelector<HTMLButtonElement>(".field__info");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-expanded")).toBe("false");
    expect(btn?.getAttribute("aria-controls")).toBe("f4-instructions");
    expect(btn?.getAttribute("aria-label")).toBe("Show instructions for Rationale");
    expect(container.querySelector(".field__instructions")).toBeNull();

    await fireEvent.click(btn as HTMLButtonElement);

    expect(btn?.getAttribute("aria-expanded")).toBe("true");
    expect(btn?.getAttribute("aria-label")).toBe("Hide instructions for Rationale");
    const revealed = container.querySelector(".field__instructions");
    expect(revealed?.id).toBe("f4-instructions");
    expect(revealed?.textContent).toBe(instructions);
  });
});
