// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { expect, it, vi } from "vitest";

// Stand-in for the core: escapes everything, so the XSS case proves Block never re-injects the source.
vi.mock("../src/lib/srs-client.js", () => ({
  renderMarkdown: (md: string) =>
    `<p>${md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`,
}));
import { paragraphActions } from "../src/lib/essay/paragraph-actions.js";
import Block from "../src/lib/components/Block.svelte";

const props = (body: string, onbody = vi.fn()) => ({
  id: "b",
  body,
  onbody,
  ontitle: vi.fn(),
  onhide: vi.fn(),
  onnew: vi.fn(),
  onindent: vi.fn(),
  onmove: vi.fn(),
});

it("shows rendered markdown until focused, then the source; blur flushes and re-renders", async () => {
  const onbody = vi.fn();
  const { container } = render(Block, props("**hi**", onbody));
  expect(container.querySelector(".block__render strong")?.textContent).toBe("hi");
  expect(container.querySelector(".block__body")).toBeNull();

  await fireEvent.focus(container.querySelector(".block__render")!);
  await tick();
  const ed = container.querySelector<HTMLElement>(".block__body")!;
  expect(ed.textContent).toBe("**hi**");
  expect(container.querySelector(".block__render")).toBeNull();

  ed.textContent = "**bye**";
  await fireEvent.blur(ed);
  expect(onbody).toHaveBeenCalledExactlyOnceWith("**bye**");
  expect(container.querySelector(".block__render")).not.toBeNull();
});

it("a body prop change (agent write) re-renders", async () => {
  const { container, rerender } = render(Block, props("one"));
  await rerender(props("two"));
  expect(container.querySelector(".block__render")?.textContent).toBe("two");
});

it("raw HTML in the body shows as text, never as an element", () => {
  const { container } = render(Block, props("<img src=x onerror=alert(1)>"));
  expect(container.querySelector(".block__render img")).toBeNull();
  expect(container.querySelector(".block__render")?.textContent).toContain("<img");
});

it("Ctrl+click on a rendered link opens it instead of editing", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  const { container } = render(Block, props("x"));
  const r = container.querySelector<HTMLElement>(".block__render")!;
  r.innerHTML = '<p><a href="https://e.com/">l</a></p>';
  await fireEvent.click(r.querySelector("a")!, { ctrlKey: true });
  expect(open).toHaveBeenCalledWith("https://e.com/", "_blank", "noopener");
  expect(container.querySelector(".block__body")).toBeNull();
});

it("renders the one ellipsis action menu and a hover strip of the primary actions (touch CSS hides the strip)", async () => {
  const handlers = { onzoom: vi.fn(), oncopylink: vi.fn(), onpull: vi.fn() };
  const { container, getByTestId } = render(Block, { ...props("x"), ...handlers });
  const btn = getByTestId("paragraph-menu");
  // hide is the EyeToggle; zoom and link are the data-part="action" buttons: the count comes from the registry
  const primary = paragraphActions({ onhide: vi.fn(), ...handlers }, { label: "x" }).filter(
    (a) => a.primary
  );
  expect(primary.map((a) => a.id)).toEqual(["hide", "zoom", "link"]);
  expect(getByTestId("block-strip").querySelectorAll('[data-part="action"], .eye')).toHaveLength(
    primary.length
  );
  await fireEvent.click(btn);
  const items = container.querySelectorAll('[role="menuitem"]');
  expect([...items].map((i) => i.getAttribute("data-testid"))).toEqual(
    ["add", "up", "down", "indent", "outdent", "hide", "draft", "zoom", "link", "rename"].map(
      (id) => `paragraph-menu-${id}`
    )
  );
});
