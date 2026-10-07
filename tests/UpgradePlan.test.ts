// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import UpgradePlan from "../src/lib/components/UpgradePlan.svelte";
import { upgradePlan } from "../src/styleguide/fixtures";
import { adoptByPackage, isAdoptable } from "../src/lib/upgrade-plan";

afterEach(cleanup);

describe("upgrade plan dialog state", () => {
  it("only an unproven (no-reference-copy) conflict is adoptable", () => {
    expect(upgradePlan.conflicts.map((c) => [c.name, isAdoptable(c)])).toEqual([
      ["reference", true],
      ["paragraph", false],
    ]);
  });

  it("adopt ids default to none, and a ticked local-edit is never sent", () => {
    expect(adoptByPackage([upgradePlan], [])).toEqual({});
    expect(adoptByPackage([upgradePlan], ["t4", "t2"])).toEqual({ [upgradePlan.packageId]: ["t4"] });
  });

  it("shows the counts, 'verified against', an unticked replace checkbox and a read-only local edit", async () => {
    const onApply = vi.fn();
    const { getByTestId, queryByTestId } = render(UpgradePlan, { plans: [upgradePlan], onApply, onCancel: () => {}, inline: true });
    expect(getByTestId("upgrade-counts").textContent).toContain("2 updated");
    expect(getByTestId("upgrade-verified").textContent).toContain("comment (verified against 1.5.0)");
    const box = getByTestId("upgrade-adopt-reference") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.closest("label")?.textContent).toContain("Replace with the published definition (any local change to it is lost)");
    expect(getByTestId("upgrade-conflicts").textContent).toContain("paragraph: changed in this document");
    expect(queryByTestId("upgrade-adopt-paragraph")).toBeNull();
    await fireEvent.click(box);
    expect(box.checked).toBe(true);
    await fireEvent.click(getByTestId("upgrade-apply"));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("degrades when the engine reports no provenBy: no verified list", () => {
    const plan = { ...upgradePlan, updated: upgradePlan.updated.map(({ provenBy: _p, ...u }) => u) };
    const { queryByTestId } = render(UpgradePlan, { plans: [plan], onApply: () => {}, onCancel: () => {}, inline: true });
    expect(queryByTestId("upgrade-verified")).toBeNull();
  });
});
