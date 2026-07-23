// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/svelte";
import { vi, describe, it, expect } from "vitest";
import SourceChooser from "../src/lib/components/SourceChooser.svelte";

function makeProviders() {
  return {
    dropbox: { configured: false, label: "Dropbox", authenticate: vi.fn(), open: vi.fn() },
    googleDrive: { configured: false, label: "Google Drive", authenticate: vi.fn(), open: vi.fn(), select: vi.fn() },
    github: { configured: false, label: "GitHub", authenticate: vi.fn(), open: vi.fn() },
  };
}

function makeFile(name: string, content: string | ArrayBuffer): File {
  return new File([content], name);
}

describe("SourceChooser — local file routing", () => {
  it("routes .srs files to onOpenArchive when the prop is provided", async () => {
    const onOpen = vi.fn();
    const onOpenArchive = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SourceChooser, {
      props: { providers: makeProviders(), onOpen, onOpenArchive },
    });

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = makeFile("my-repo.srs", new ArrayBuffer(4));
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await fireEvent.change(input);

    // Wait a tick for the async run() to complete
    await new Promise((r) => setTimeout(r, 0));

    expect(onOpenArchive).toHaveBeenCalledWith(expect.any(Uint8Array), "my-repo.srs");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("routes .srsj files to onOpen even when onOpenArchive is provided", async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    const onOpenArchive = vi.fn();
    const { container } = render(SourceChooser, {
      props: { providers: makeProviders(), onOpen, onOpenArchive },
    });

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = makeFile("my-repo.srsj", "{}");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await fireEvent.change(input);

    await new Promise((r) => setTimeout(r, 0));

    expect(onOpen).toHaveBeenCalled();
    expect(onOpenArchive).not.toHaveBeenCalled();
  });

  it("falls through .srs to onOpen when onOpenArchive is not provided", async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    const { container } = render(SourceChooser, {
      props: { providers: makeProviders(), onOpen },
    });

    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = makeFile("my-repo.srs", new ArrayBuffer(4));
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await fireEvent.change(input);

    await new Promise((r) => setTimeout(r, 0));

    // Without onOpenArchive, .srs falls through to onOpen path
    expect(onOpen).toHaveBeenCalled();
  });

  it("accept attribute includes .srs", () => {
    const { container } = render(SourceChooser, {
      props: { providers: makeProviders(), onOpen: vi.fn() },
    });
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    expect(input.getAttribute("accept")).toContain(".srs");
  });
});

describe("SourceChooser — cloud browser default filter", () => {
  function makeBrowsingProviders(entries: unknown[]) {
    return {
      ...makeProviders(),
      dropbox: {
        configured: true,
        label: "Dropbox",
        authenticate: vi.fn().mockResolvedValue(undefined),
        open: vi.fn(),
        list: vi.fn().mockResolvedValue(entries),
      },
    };
  }
  const listing = [
    { id: "1", name: "sub", kind: "folder", path: "/sub" },
    { id: "2", name: "gov.srsj", kind: "file", path: "/gov.srsj" },
    { id: "3", name: "data.srs", kind: "file", path: "/data.srs" },
    { id: "4", name: "readme.md", kind: "file", path: "/readme.md" },
  ];

  it("renders the SRS mark on repository entries only", async () => {
    const withRepo = [
      ...listing,
      { id: "5", name: "Open as SRS repository", kind: "repository", path: "/gov" },
    ];
    const { getByTestId, container } = render(SourceChooser, {
      // biome-ignore lint/suspicious/noExplicitAny: minimal provider fake
      props: { providers: makeBrowsingProviders(withRepo) as any, onOpen: vi.fn() },
    });

    await fireEvent.click(getByTestId("source-dropbox"));
    await new Promise((r) => setTimeout(r, 0));

    // Exactly one mark: on the repository row, not on the .srsj/.srs file rows.
    expect(container.querySelectorAll(".srs-mark")).toHaveLength(1);
    const repoRow = Array.from(container.querySelectorAll(".cloud-browser__entry")).find((el) =>
      el.textContent?.includes("Open as SRS repository")
    );
    expect(repoRow?.querySelector(".srs-mark")).toBeTruthy();
  });

  it("hides non-SRS files by default; 'Show all files' reveals them", async () => {
    const { getByTestId, queryByText, getByText } = render(SourceChooser, {
      // biome-ignore lint/suspicious/noExplicitAny: minimal provider fake
      props: { providers: makeBrowsingProviders(listing) as any, onOpen: vi.fn() },
    });

    await fireEvent.click(getByTestId("source-dropbox"));
    await new Promise((r) => setTimeout(r, 0));

    expect(getByText("sub")).toBeTruthy();
    expect(getByText("gov.srsj")).toBeTruthy();
    expect(getByText("data.srs")).toBeTruthy();
    expect(queryByText("readme.md")).toBeNull();

    await fireEvent.click(getByTestId("cloud-browser-show-all"));
    expect(queryByText("readme.md")).toBeTruthy();
  });
});

describe("SourceChooser — auto-scan", () => {
  function scanningDropbox(outcome: unknown, listing: unknown[]) {
    return {
      ...makeProviders(),
      dropbox: {
        configured: true,
        label: "Dropbox",
        authenticate: vi.fn().mockResolvedValue(undefined),
        open: vi.fn(),
        list: vi.fn().mockResolvedValue(listing),
        scanForSrs: vi.fn().mockResolvedValue(outcome),
      },
    };
  }
  const rootListing = [{ id: "1", name: "sub", kind: "folder", path: "/sub" }];

  it("renders auto-discovered entries in a 'Found in subfolders' section", async () => {
    const providers = scanningDropbox(
      {
        status: "complete",
        entries: [{ id: "d1", name: "sub/nested.srsj", kind: "file", path: "/sub/nested.srsj" }],
        foldersListed: 2,
      },
      rootListing
    );
    const { getByTestId, findByText } = render(SourceChooser, {
      // biome-ignore lint/suspicious/noExplicitAny: minimal provider fake
      props: { providers: providers as any, onOpen: vi.fn() },
    });
    await fireEvent.click(getByTestId("source-dropbox"));

    expect(await findByText("sub/nested.srsj")).toBeTruthy();
    expect(getByTestId("cloud-browser-discovered")).toBeTruthy();
    expect(providers.dropbox.scanForSrs).toHaveBeenCalledWith("", "auto", rootListing);
  });

  it("offers 'Scan for SRS' when the auto scan was skipped", async () => {
    const providers = scanningDropbox(
      { status: "skipped", entries: [], foldersListed: 0, reason: "too-large" },
      rootListing
    );
    const { getByTestId, findByTestId } = render(SourceChooser, {
      // biome-ignore lint/suspicious/noExplicitAny: minimal provider fake
      props: { providers: providers as any, onOpen: vi.fn() },
    });
    await fireEvent.click(getByTestId("source-dropbox"));

    const scanBtn = await findByTestId("cloud-browser-scan");
    await fireEvent.click(scanBtn);
    expect(providers.dropbox.scanForSrs).toHaveBeenLastCalledWith("", "explicit", rootListing);
  });
});
