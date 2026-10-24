// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import DomainMap from "../src/lib/components/DomainMap.svelte";

const it1 = (id: string, label: string) => ({ id, label });
const map = {
  boundary: it1("b", "Small groups"),
  problems: { touched: [it1("p1", "Lose touch")], untouched: [it1("p2", "Unowned")] },
  claims: [it1("c", "Rules scale")],
  tensions: [],
  remedies: [it1("r", "Ledger")],
  parents: [],
};

describe("DomainMap", () => {
  it("lists touched and untouched problems, claims and remedies; empty lists are left out", () => {
    render(DomainMap, { boundaries: [it1("b", "Small groups")], map, onopen: () => {} });
    expect(screen.getByText("Problems the essay touches (1)")).toBeTruthy();
    expect(screen.getByText("Problems it leaves untouched (1)")).toBeTruthy();
    expect(screen.getByText("Claims (1)")).toBeTruthy();
    expect(screen.getByText("Remedies (1)")).toBeTruthy();
    expect(screen.queryByText(/Tensions/)).toBeNull();
  });
  it("opens an item's record", async () => {
    const onopen = vi.fn();
    render(DomainMap, { boundaries: [it1("b", "Small groups")], map, onopen });
    await fireEvent.click(screen.getByRole("button", { name: "Open Ledger" }));
    expect(onopen).toHaveBeenCalledWith("r");
  });
  it("choosing and removing the boundary reports the id or null", async () => {
    const onchoose = vi.fn();
    render(DomainMap, {
      boundaries: [it1("b", "Small groups")],
      map: null,
      onchoose,
      onopen: () => {},
    });
    const select = screen.getByTestId("domain-select");
    await fireEvent.change(select, { target: { value: "b" } });
    expect(onchoose).toHaveBeenLastCalledWith("b");
    await fireEvent.change(select, { target: { value: "" } });
    expect(onchoose).toHaveBeenLastCalledWith(null);
  });
});
