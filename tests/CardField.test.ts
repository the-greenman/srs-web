// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import CardField from "../src/lib/components/CardField.svelte";

// srs-web#211 — the read-only CardField frame mirrors #176: a field's description
// shows as an inline caption and its fuller instructions sit behind an info toggle.

describe("CardField field help", () => {
  it("renders only the label when no help is provided", () => {
    const { container } = render(CardField, { props: { label: "Rationale" } });
    expect(container.querySelector(".card__field-description")).toBeNull();
    expect(container.querySelector(".card__field-info")).toBeNull();
    expect(container.querySelector(".card__field-instructions")).toBeNull();
    expect(container.querySelector(".card__field-label-text")?.textContent).toBe("Rationale");
  });

  it("shows the description as an inline caption", () => {
    const { container } = render(CardField, {
      props: { label: "Rationale", description: "Why this option over the alternatives." },
    });
    expect(container.querySelector(".card__field-description")?.textContent).toBe(
      "Why this option over the alternatives.",
    );
  });

  it("suppresses the caption when the description equals the label", () => {
    const text = "Why this option over the alternatives.";
    const { container } = render(CardField, { props: { label: text, description: text } });
    expect(container.querySelector(".card__field-description")).toBeNull();
  });

  it("renders no caption when description is undefined", () => {
    const { container } = render(CardField, { props: { label: "Rationale" } });
    expect(container.querySelector(".card__field-description")).toBeNull();
  });

  it("renders no info toggle when the field has no instructions", () => {
    const { container } = render(CardField, {
      props: { label: "Rationale", description: "x" },
    });
    expect(container.querySelector(".card__field-info")).toBeNull();
  });

  it("reveals the instructions when the info toggle is activated", async () => {
    const instructions = "Say what made this the right choice, in two to four sentences.";
    const { container } = render(CardField, {
      props: { label: "Rationale", instructions, id: "field-abc" },
    });
    const btn = container.querySelector<HTMLButtonElement>(".card__field-info");
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-expanded")).toBe("false");
    expect(btn?.getAttribute("aria-controls")).toBe("field-abc-instructions");
    expect(btn?.getAttribute("aria-label")).toBe("Show instructions for Rationale");
    expect(container.querySelector(".card__field-instructions")).toBeNull();

    await fireEvent.click(btn as HTMLButtonElement);

    expect(btn?.getAttribute("aria-expanded")).toBe("true");
    expect(btn?.getAttribute("aria-label")).toBe("Hide instructions for Rationale");
    const revealed = container.querySelector(".card__field-instructions");
    expect(revealed?.id).toBe("field-abc-instructions");
    expect(revealed?.textContent).toBe(instructions);
  });

  it("still renders the empty placeholder alongside field help", () => {
    const { container } = render(CardField, {
      props: { label: "Rationale", empty: true, description: "Why this option." },
    });
    expect(container.querySelector(".card__field-value--empty")?.textContent).toBe("Not recorded");
    expect(container.querySelector(".card__field-description")?.textContent).toBe("Why this option.");
  });
});
