// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import AttachmentsPanel from "../src/lib/components/AttachmentsPanel.svelte";
import type { SrsRepository } from "../src/lib/srs-client.js";

const FAKE_URL = "blob:fake-url";
const FAKE_BYTES = new Uint8Array([0xff, 0xd8, 0xff]); // arbitrary bytes — happy-dom never decodes them

function makeRepo(overrides: Partial<SrsRepository>): SrsRepository {
  const base: SrsRepository = {
    validate: () => { throw new Error("not mocked"); },
    list_records: () => { throw new Error("not mocked"); },
    get_record: () => { throw new Error("not mocked"); },
    list_notes: () => { throw new Error("not mocked"); },
    create_record: () => { throw new Error("not mocked"); },
    update_record: () => { throw new Error("not mocked"); },
    delete_record: () => { throw new Error("not mocked"); },
    export_srsj: () => { throw new Error("not mocked"); },
    export_archive: () => { throw new Error("not mocked"); },
    list_relations: () => { throw new Error("not mocked"); },
    create_relation: () => { throw new Error("not mocked"); },
    delete_relation: () => { throw new Error("not mocked"); },
    set_lifecycle_state: () => { throw new Error("not mocked"); },
    transition_record: () => { throw new Error("not mocked"); },
    blueprint_schema: () => { throw new Error("not mocked"); },
    render_document_view: () => { throw new Error("not mocked"); },
    list_containers: () => { throw new Error("not mocked"); },
    get_container: () => { throw new Error("not mocked"); },
    add_container_member: () => { throw new Error("not mocked"); },
    remove_container_member: () => { throw new Error("not mocked"); },
    containers_for_instance: () => { throw new Error("not mocked"); },
    type_schema: () => { throw new Error("not mocked"); },
    list_blueprints: () => { throw new Error("not mocked"); },
    document_views_for_container: () => { throw new Error("not mocked"); },
    list_document_views: () => { throw new Error("not mocked"); },
    find: () => { throw new Error("not mocked"); },
    list_terms: () => { throw new Error("not mocked"); },
    create_record_successor: () => { throw new Error("not mocked"); },
    resolve_container_view: () => { throw new Error("not mocked"); },
    repository_navigation: () => { throw new Error("not mocked"); },
    scaffold_new_repository: () => { throw new Error("not mocked"); },
    get_allowed_lifecycle_transitions: () => { throw new Error("not mocked"); },
    available_migrations: () => [],
    apply_migration: () => { throw new Error("not mocked"); },
    order_by_precedes: () => { throw new Error("not mocked"); },
    get_field_value_by_name: () => { throw new Error("not mocked"); },
    list_attachments: () => { throw new Error("not mocked"); },
    add_attachment: () => { throw new Error("not mocked"); },
    link_attachment: () => { throw new Error("not mocked"); },
    get_attachment_bytes: () => { throw new Error("not mocked"); },
    get_record_attachments: () => { throw new Error("not mocked"); },
  };
  return { ...base, ...overrides };
}

function makeAttachmentRepo(getBytesImpl: () => Uint8Array) {
  return makeRepo({
    list_attachments: () => ({
      sourceDocumentsPath: "source_documents",
      entries: [{ path: "source_documents/photo.jpg", documentId: "doc-abc-123" }],
    }),
    get_attachment_bytes: getBytesImpl,
  });
}

// Flush all pending promises and microtasks
function flushAsync() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

describe("AttachmentsPanel — preview toggle", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => FAKE_URL);
    revokeObjectURL = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("path 1: idle→loaded — shows img after successful byte fetch", async () => {
    const repo = makeAttachmentRepo(() => FAKE_BYTES);
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const btn = screen.getByTestId("attachment-preview-btn");
    await fireEvent.click(btn);
    await flushAsync();

    const img = screen.getByTestId("attachment-preview-img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe(FAKE_URL);
    expect(img.alt).toContain("photo.jpg");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("attachment-preview-error")).toBeNull();
  });

  it("path 2: idle→error via onerror — shows 'Cannot display as image' and revokes URL", async () => {
    const repo = makeAttachmentRepo(() => FAKE_BYTES);
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const btn = screen.getByTestId("attachment-preview-btn");
    await fireEvent.click(btn);
    await flushAsync();

    const img = screen.getByTestId("attachment-preview-img");
    await fireEvent.error(img);
    await flushAsync();

    expect(screen.queryByTestId("attachment-preview-img")).toBeNull();
    const errEl = screen.getByTestId("attachment-preview-error");
    expect(errEl.textContent).toContain("Cannot display as image");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(FAKE_URL);
  });

  it("path 3: idle→error via WASM throw — shows error detail, no URL created", async () => {
    const repo = makeAttachmentRepo(() => { throw new Error("bytes not in session"); });
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const btn = screen.getByTestId("attachment-preview-btn");
    await fireEvent.click(btn);
    await flushAsync();

    const errEl = screen.getByTestId("attachment-preview-error");
    expect(errEl.textContent).toContain("Preview unavailable");
    expect(errEl.textContent).toContain("bytes not in session");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByTestId("attachment-preview-img")).toBeNull();
  });

  it("path 4: loaded→idle toggle-off — hides img and revokes URL", async () => {
    const repo = makeAttachmentRepo(() => FAKE_BYTES);
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const btn = screen.getByTestId("attachment-preview-btn");
    await fireEvent.click(btn);
    await flushAsync();
    expect(screen.getByTestId("attachment-preview-img")).toBeTruthy();

    // Toggle off — button now shows "Hide"
    await fireEvent.click(btn);
    await flushAsync();

    expect(screen.queryByTestId("attachment-preview-img")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(FAKE_URL);
  });

  it("path 5: double-click during loading — second click is no-op, WASM called once", async () => {
    const getBytesImpl = vi.fn(() => FAKE_BYTES);
    const repo = makeAttachmentRepo(getBytesImpl);
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const btn = screen.getByTestId("attachment-preview-btn");
    // Fire both clicks synchronously — the first suspends at `await tick()` inside togglePreview,
    // so the second fires while state is still 'loading' (the no-op branch).
    fireEvent.click(btn); // sets state='loading', suspends at await tick()
    fireEvent.click(btn); // state='loading' → no-op guard fires
    await flushAsync();   // let both async chains resolve

    // WASM should only be called once; state should be 'loaded'
    expect(getBytesImpl).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("attachment-preview-img")).toBeTruthy();
  });

  it("error state retries — clicking Preview from error state re-fetches", async () => {
    const getBytesImpl = vi.fn()
      .mockImplementationOnce(() => { throw new Error("first fail"); })
      .mockImplementationOnce(() => FAKE_BYTES);
    const repo = makeAttachmentRepo(getBytesImpl);
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const btn = screen.getByTestId("attachment-preview-btn");
    await fireEvent.click(btn);
    await flushAsync();
    expect(screen.getByTestId("attachment-preview-error")).toBeTruthy();

    // Retry from error state
    await fireEvent.click(btn);
    await flushAsync();
    expect(getBytesImpl).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("attachment-preview-img")).toBeTruthy();
  });

  it("onDestroy: Blob URLs are revoked when component unmounts with preview open", async () => {
    const repo = makeAttachmentRepo(() => FAKE_BYTES);
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const btn = screen.getByTestId("attachment-preview-btn");
    await fireEvent.click(btn);
    await flushAsync();
    expect(screen.getByTestId("attachment-preview-img")).toBeTruthy();

    // Unmount the component — onDestroy should revoke the Blob URL
    cleanup();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(FAKE_URL);
  });

  it("preview button only appears when documentId is present", () => {
    const repo = makeRepo({
      list_attachments: () => ({
        sourceDocumentsPath: "",
        entries: [
          { path: "with-id.jpg", documentId: "doc-1" },
          { path: "no-id.jpg" },
        ],
      }),
    });
    render(AttachmentsPanel, { props: { repo, onMutate: vi.fn(), onCountChange: vi.fn() } });

    const previewBtns = screen.getAllByTestId("attachment-preview-btn");
    expect(previewBtns).toHaveLength(1);
  });
});
