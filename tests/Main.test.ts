// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import Main from "../src/lib/components/Main.svelte";
import { pinNotice, pinned, resetNotices, unpinNotice } from "../src/lib/notices.svelte";

afterEach(() => {
  cleanup();
  resetNotices();
  for (const p of [...pinned]) unpinNotice(p.key);
});

const snip = (html: string) => createRawSnippet(() => ({ render: () => html }));

describe("Main", () => {
  it("renders the bar, then the notice region, then the content, in DOM order", () => {
    pinNotice({ key: "k", documentKey: "d", kind: "info", text: "pinned", testid: "pin" });
    const { container, getByTestId } = render(Main, {
      bar: snip('<div data-testid="bar">bar</div>'),
      children: snip('<div data-testid="content">content</div>'),
    });
    const order = [getByTestId("bar"), getByTestId("pin"), getByTestId("content")];
    for (let i = 0; i < order.length - 1; i++) {
      expect(
        order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(container.querySelectorAll(".toast-host")).toHaveLength(1);
  });
});
