// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import ActionMenu from "../src/lib/components/ActionMenu.svelte";
import type { MenuAction } from "../src/lib/components/menu-action.js";

afterEach(cleanup);

const rows = (run = vi.fn()): MenuAction[] => [
  { id: "plain", label: "Plain", run, enabled: true },
  { id: "on", label: "On", run, enabled: true, checked: true },
  { id: "off", label: "Off", run, enabled: true, checked: false },
  { id: "mix", label: "Mixed", run, enabled: true, checked: "mixed" },
];

it("checkable rows are menuitemcheckbox with aria-checked incl. mixed; plain rows stay menuitem", async () => {
  const { getByTestId } = render(ActionMenu, { actions: rows(), label: "Doc", testid: "m" });
  await fireEvent.click(getByTestId("m"));
  await tick();
  const aria = (id: string) => [
    getByTestId(`m-${id}`).getAttribute("role"),
    getByTestId(`m-${id}`).getAttribute("aria-checked"),
  ];
  expect(aria("plain")).toEqual(["menuitem", null]);
  expect(aria("on")).toEqual(["menuitemcheckbox", "true"]);
  expect(aria("off")).toEqual(["menuitemcheckbox", "false"]);
  expect(aria("mix")).toEqual(["menuitemcheckbox", "mixed"]);
});

it("keepOpenOnCheck: a checkable row runs and the menu stays open; a plain row closes it", async () => {
  const run = vi.fn();
  const { getByTestId, queryByTestId } = render(ActionMenu, {
    actions: rows(run),
    label: "Doc",
    testid: "m",
    keepOpenOnCheck: true,
  });
  await fireEvent.click(getByTestId("m"));
  await fireEvent.click(getByTestId("m-on"));
  expect(run).toHaveBeenCalledOnce();
  expect(queryByTestId("m-on")).not.toBeNull();
  await fireEvent.click(getByTestId("m-plain"));
  expect(queryByTestId("m-on")).toBeNull();
});

it("without keepOpenOnCheck a checkable row closes the menu (narrow overflow)", async () => {
  const { getByTestId, queryByTestId } = render(ActionMenu, {
    actions: rows(),
    label: "Doc",
    testid: "m",
  });
  await fireEvent.click(getByTestId("m"));
  await fireEvent.click(getByTestId("m-on"));
  expect(queryByTestId("m-on")).toBeNull();
});

it("triggerLabel renders a labelled button; Escape closes and returns focus to it", async () => {
  const { getByTestId, getByRole, queryByTestId } = render(ActionMenu, {
    actions: rows(),
    label: "",
    title: "Document",
    triggerLabel: "Document",
    testid: "m",
  });
  const btn = getByRole("button", { name: "Document" });
  expect(btn).toBe(getByTestId("m"));
  await fireEvent.click(btn);
  await tick();
  await fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(queryByTestId("m-plain")).toBeNull();
  expect(document.activeElement).toBe(btn);
});

it("sections render a heading row per group", async () => {
  const { getByTestId, container } = render(ActionMenu, {
    sections: [
      { label: "One", items: [rows()[0]] },
      { label: "Two", items: [rows()[1]] },
    ],
    label: "Doc",
    testid: "m",
  });
  await fireEvent.click(getByTestId("m"));
  expect(
    [...container.querySelectorAll('[data-part="heading"]')].map((h) => h.textContent)
  ).toEqual(["One", "Two"]);
});
