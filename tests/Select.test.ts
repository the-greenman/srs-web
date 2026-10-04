// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { afterEach, expect, it } from "vitest";
import Select from "../src/lib/components/Select.svelte";

afterEach(cleanup);

it("string options show and carry the same text", () => {
  const { getAllByRole } = render(Select, { options: ["one", "two"], value: "two" });
  const opts = getAllByRole("option") as HTMLOptionElement[];
  expect(opts.map((o) => [o.value, o.textContent])).toEqual([
    ["one", "one"],
    ["two", "two"],
  ]);
});

it("{value, label} options carry the value and show the label; the name is forwarded", () => {
  const { getByRole, getAllByRole } = render(Select, {
    options: [
      { value: "e1", label: "First essay" },
      { value: "e2", label: "Second essay" },
    ],
    value: "e2",
    "aria-label": "Essay",
  });
  expect((getByRole("combobox", { name: "Essay" }) as HTMLSelectElement).value).toBe("e2");
  expect((getAllByRole("option") as HTMLOptionElement[]).map((o) => [o.value, o.textContent])).toEqual([
    ["e1", "First essay"],
    ["e2", "Second essay"],
  ]);
});
