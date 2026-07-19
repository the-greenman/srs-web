# Plan: Attachments UI — add / list / link / download (srs-web#99)

## Summary

srs-rust#290 and srs-rust#291 added `load_archive`, `export_archive`, and `get_attachment_bytes`
WASM bindings; subsequent PRs added `list_attachments`, `add_attachment`, `link_attachment`, and
`get_record_attachments` (all confirmed present in the current `srs-bindings` release). This plan
wires those bindings into the web UI as a new "Attachments" inspector section in
`GovernanceShell.svelte`, mirroring the four `srs-gov` CLI flows: list, add (file upload), link
(existing attachment → record), and download (bytes → browser download). No new WASM bindings are
required; this is purely a presentation layer over the existing attachment service surface.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | main loop |
| Web App Worker | main loop |
| Architecture Reviewer (srs-web) | Stage 3 / Stage 7 review agents |
| Verification Agent (srs-web) | Stage 7 verification agent |

See [agents.md](agents.md) for role definitions.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics in TS — all four flows (`list_attachments`, `add_attachment`, `link_attachment`, `get_attachment_bytes`, `get_record_attachments`) are pure WASM pass-throughs; no filename parsing, MIME inference, or content validation in TypeScript. | accepted |
| ADR-001 (prop pattern) | `AttachmentsPanel` is a direct child of `GovernanceShell`; `repo` is passed as a prop (not via Svelte context). ADR-013 (Svelte context) applies only to the rendering-layer dispatch chain — not to first-level inspector children. | no new ADR needed |
| Archive-only persistence | Adding an attachment writes bytes to MemoryStore; those bytes are only preserved via `export_archive()` (`.srs` ZIP). `persistWorkingCopy()` (`.srsj` path) does NOT include attachment file content. After a successful `add_attachment`, the panel shows a notice directing the user to "Download .srs" — the existing `onExportArchive` prop already provides this button. No auto-download; user decides when to export. This is a consequence of MemoryStore WASM architecture, not a new constraint. | documented in this plan; no new ADR needed |

---

## Contracts

### WASM API surface

No new WASM methods required. All methods are in the current `srs-bindings` release:

- `repo.list_attachments(filter_json: string)` → `{ sourceDocumentsPath: string, entries: AttachmentEntry[] }`
  where `AttachmentEntry = { path: string, documentId?: string, title?: string, contentChecksum?: string, sidecarChecksum?: string }`
- `repo.add_attachment(input_json: string, file_bytes: Uint8Array)` → `{ documentId, contentPath, sidecarPath, sourceDocumentsPath, contentChecksum, sidecarChecksum }`
  `input_json` = `{ fileName: string, subdir?: string, title?: string, contentType?: string }`
- `repo.link_attachment(input_json: string)` → `{ instanceId, documentId, sourceRefsCount }`
  `input_json` = `{ instanceId: string, documentId: string }`
- `repo.get_attachment_bytes(document_id: string)` → `Uint8Array`
- `repo.get_record_attachments(input_json: string)` → `{ instanceId, sourceDocumentsPath, attachments: ResolvedAttachment[] }`
  where `ResolvedAttachment = { documentId, contentPath?, title?, mimeType? }`

### TypeScript types

New type exports added to `src/lib/srs-client.ts`:

```ts
export interface AttachmentEntry {
  path: string;
  documentId?: string;
  title?: string;
  contentChecksum?: string;
  sidecarChecksum?: string;
  sizeBytes?: number;
}

export interface AttachmentListResult {
  sourceDocumentsPath: string;
  entries: AttachmentEntry[];
}

export interface AddAttachmentInput {
  fileName: string;
  subdir?: string;
  title?: string;
  contentType?: string;
}

export interface AddAttachmentResult {
  documentId: string;
  contentPath: string;
  sidecarPath: string;
  sourceDocumentsPath: string;
  contentChecksum: string;
  sidecarChecksum: string;
}

export interface LinkAttachmentInput {
  instanceId: string;
  documentId: string;
}

export interface LinkAttachmentResult {
  instanceId: string;
  documentId: string;
  sourceRefsCount: number;
}

export interface ResolvedAttachment {
  documentId: string;
  contentPath?: string;
  title?: string;
  mimeType?: string;
}

export interface GetRecordAttachmentsInput {
  instanceId: string;
  sourceDocumentsPath?: string;
}

export interface GetRecordAttachmentsResult {
  instanceId: string;
  sourceDocumentsPath: string;
  attachments: ResolvedAttachment[];
}
```

New wrapper functions added to `src/lib/srs-client.ts`:

```ts
export function listAttachments(repo: SrsRepository, filter?: object): AttachmentListResult
export function addAttachment(repo: SrsRepository, input: AddAttachmentInput, fileBytes: Uint8Array): AddAttachmentResult
export function linkAttachment(repo: SrsRepository, input: LinkAttachmentInput): LinkAttachmentResult
export function getAttachmentBytes(repo: SrsRepository, documentId: string): Uint8Array
export function getRecordAttachments(repo: SrsRepository, input: GetRecordAttachmentsInput): GetRecordAttachmentsResult
```

New declarations added to `SrsRepository` interface in `src/lib/srs-client.ts`:

```ts
list_attachments(filter_json: string): any;
add_attachment(input_json: string, file_bytes: Uint8Array): any;
link_attachment(input_json: string): any;
get_attachment_bytes(document_id: string): Uint8Array;
get_record_attachments(input_json: string): any;
```

---

## Scope

**In scope:**

- Add WASM method declarations to `SrsRepository` interface in `srs-client.ts`
- Add TS types and wrapper functions for `listAttachments`, `addAttachment`, `linkAttachment`, `getAttachmentBytes`, `getRecordAttachments` in `srs-client.ts`
- Update `mockRepo` base stub in `tests/srs-client.test.ts` with the five new methods
- Create `src/lib/components/AttachmentsPanel.svelte` — repository-level panel
  - Lists all attachments: `path`, `title` (if any), download button per entry
  - File picker (`<input type="file">`) + "Add" button → `addAttachment()` → show result + ".srs archive required" notice
  - After add, refresh the list; call the passed-in mutation callback so GovernanceShell can `persistWorkingCopy()`
- Create `src/lib/components/AttachmentLinkPanel.svelte` — record-level sub-panel
  - Shows attachments linked to `selectedRecord` via `getRecordAttachments()`
  - "Link existing" flow: dropdown or list of unlinked attachments → `linkAttachment()` → refresh
  - Download button per linked attachment → `getAttachmentBytes()` → `<a download>` trigger
- Wire `AttachmentsPanel` into `GovernanceShell.svelte` inspector as a new `<InspectorSection title="Attachments" aside={...}>`
- Wire `AttachmentLinkPanel` into the record inspector section (alongside Decision Links, Tags, etc.)
- Unit tests for the five new wrapper functions in `tests/srs-client.test.ts`

**Out of scope:**

- `resolve_document_view_attachments` — batch resolution across document view (deferred; no UI consumer yet)
- Attachment policy UI (size limits) — separate concern; `AttachmentPolicyPayload` already surfaces via validation
- Bulk "link all" operation
- Attachment delete / unlink (WASM binding not yet available)
- Thumbnail / preview of image attachments
- Attachment content displayed inline (download only)
- WASM binding for `sizeBytes` in `list_attachments` (tracked as srs-rust#645 — show "—" when absent)

---

## Phases

### Phase 1: srs-client.ts — WASM declarations, types, wrappers, and tests

**Goal:** `srs-client.ts` exposes typed wrappers for all five attachment methods, and unit tests pass.

**Agent:** Web App Worker

#### Tasks

- [ ] In `SrsRepository` interface (after `order_by_precedes`): add `list_attachments`, `add_attachment`, `link_attachment`, `get_attachment_bytes`, `get_record_attachments` declarations
- [ ] Add type exports: `AttachmentEntry`, `AttachmentListResult`, `AddAttachmentInput`, `AddAttachmentResult`, `LinkAttachmentInput`, `LinkAttachmentResult`, `ResolvedAttachment`, `GetRecordAttachmentsInput`, `GetRecordAttachmentsResult`
- [ ] Add wrapper functions: `listAttachments`, `addAttachment`, `linkAttachment`, `getAttachmentBytes`, `getRecordAttachments` — all pure WASM pass-throughs, JSON decode via `?? snake_case` fallback pattern
- [ ] Update `mockRepo` base in `tests/srs-client.test.ts` to add `list_attachments`, `add_attachment`, `link_attachment`, `get_attachment_bytes`, `get_record_attachments` (each throws "not mocked")
- [ ] Add a `describe("attachment wrappers")` block in `tests/srs-client.test.ts` covering:
  - `listAttachments`: spy confirms `list_attachments("{}")` called; returns parsed `AttachmentListResult`
  - `addAttachment`: spy confirms `add_attachment(inputJson, fileBytes)` called; returns `AddAttachmentResult`
  - `linkAttachment`: spy confirms `link_attachment(inputJson)` called; returns `LinkAttachmentResult`
  - `getAttachmentBytes`: spy confirms `get_attachment_bytes(documentId)` called; returns `Uint8Array`
  - `getRecordAttachments`: spy confirms `get_record_attachments(inputJson)` called; returns `GetRecordAttachmentsResult`

#### Acceptance Criteria

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (new tests in the describe block all green)
- [ ] All wrapper functions are exported from `src/lib/srs-client.ts`

#### Milestone gate

1. Verify all acceptance criteria above.
2. Run `npm run typecheck && npm test`.
3. Mark tasks `[x]`.
4. Commit: `feat(srs-client): attachment WASM wrappers + types (#99)`

---

### Phase 2: AttachmentsPanel.svelte — repository-level list + add + download

**Goal:** `AttachmentsPanel.svelte` is wired into the GovernanceShell inspector and list/add/download flows work end-to-end.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/AttachmentsPanel.svelte`:
  - Props: `repo: SrsRepository`, `onMutate: () => void` (called after add to trigger `persistWorkingCopy`)
  - On mount: call `listAttachments(repo)` and store result as `$state`
  - Render table/list of `entries`: `path`, `title ?? "(no title)"`, download button (calls `getAttachmentBytes(repo, entry.documentId)` → creates a `<a href="..." download>` with a `Blob URL` and clicks it), `documentId` (truncated)
  - File picker `<input type="file" bind:this={fileInput}>` + "Add attachment" button:
    - On click: `fileInput.click()`
    - On file change: read bytes with `FileReader.readAsArrayBuffer`, call `addAttachment(repo, { fileName: file.name }, new Uint8Array(buffer))`
    - On success: refresh list, call `onMutate()`, show success notice with documentId and `.srs` archive reminder
    - On error: show inline error message
  - While adding: show "Adding…" state, disable the button
  - Show `"—"` for `sizeBytes` (absent until srs-rust#645)
  - Entry count in panel aside badge

- [ ] Wire into `GovernanceShell.svelte`:
  - Import `AttachmentsPanel` 
  - Add `<InspectorSection title="Attachments" aside={attachmentCount === 0 ? "" : String(attachmentCount)}>` after the "Repository" section
  - Pass `repo={repo}` and `onMutate={persistWorkingCopy}`
  - Track `attachmentCount` reactively from the panel's last list result (via a callback prop `onListChange: (count: number) => void`)

#### Acceptance Criteria

- [ ] Opening the Inspector shows an "Attachments" section
- [ ] Clicking "Add attachment", selecting a file, and confirming shows the file in the list
- [ ] The `.srs` archive notice appears after add
- [ ] Download button is present per entry (disabled when `documentId` is absent — .srsj repos without a loaded archive won't have bytes available)
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass

#### Milestone gate

1. Verify all acceptance criteria.
2. Run `npm run typecheck && npm run lint && npm run build && npm test`.
3. Mark tasks `[x]`.
4. Commit: `feat: AttachmentsPanel — list, add, download (#99)`

---

### Phase 3: Record-level linked attachments (AttachmentLinkPanel)

**Goal:** When a record is selected in the inspector, its linked attachments appear and can be linked / downloaded.

**Agent:** Web App Worker

#### Tasks

- [ ] Create `src/lib/components/AttachmentLinkPanel.svelte`:
  - Props: `repo: SrsRepository`, `instanceId: string`, `onMutate: () => void`
  - On mount / `instanceId` change: call `getRecordAttachments(repo, { instanceId })`, store as `$state`
  - Render list of linked `attachments`: `title ?? documentId`, download button per item
  - "Link attachment" flow:
    - Button opens an inline `<select>` populated from `listAttachments(repo).entries` filtered to entries with `documentId` present
    - User picks one → "Link" button → `linkAttachment(repo, { instanceId, documentId })` → refresh linked list + call `onMutate()`
    - "Cancel" closes the picker
    - Error handling: show inline error on WASM throw
  - If `attachments` is empty: show `"No linked attachments"`

- [ ] Wire into `GovernanceShell.svelte` inspector:
  - Inside the `{#if selectedRecord}` block, add `<InspectorSection title="Linked Attachments" aside={...}>` containing `<AttachmentLinkPanel repo={repo} instanceId={selectedRecord.instanceId} onMutate={persistWorkingCopy} />`

#### Acceptance Criteria

- [ ] Selecting a record shows a "Linked Attachments" section in the inspector
- [ ] If no attachments are linked, shows "No linked attachments"
- [ ] "Link attachment" opens a picker of available attachments
- [ ] After linking, the attachment appears in the linked list
- [ ] Download works for linked attachments with `documentId`
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass

#### Milestone gate

1. Verify all acceptance criteria.
2. Run `npm run typecheck && npm run lint && npm run build && npm test`.
3. Mark tasks `[x]`.
4. Commit: `feat: AttachmentLinkPanel — record-level link + download (#99)`

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (new wrapper tests green, no regressions)
- [ ] GovernanceShell inspector shows "Attachments" section with list, add, and download flows
- [ ] Record inspector shows "Linked Attachments" section with link + download flows
- [ ] After `add_attachment`, panel shows success notice with `.srs` archive reminder
- [ ] No SRS semantics in TypeScript (all flows are pure WASM pass-throughs)
- [ ] `export_archive()` used only by the existing "Download .srs" button in the topbar (not auto-triggered)

## Coordination Rules

- Web App Worker stays within `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). All four flows delegate entirely to WASM.
- `persistWorkingCopy()` is called via `onMutate` callback after link operations (safe — records the updated sourceRefs); after `addAttachment` it is called to persist the record layer, with an explicit notice that attachment content requires `.srs` archive export.
- `get_attachment_bytes` returns `Uint8Array`; download is triggered by constructing a `Blob` URL and clicking a temporary `<a download>` element — no server round-trip.

## Assumptions

- The current `srs-bindings` WASM release (confirmed to include all five attachment methods) is used for CI and dogfooding.
- For repos loaded from `.srsj` (not `.srs` archive), `list_attachments` may return an empty list (no source-documents dir in MemoryStore). This is correct behaviour — not an error.
- Download of bytes only works when the repo was loaded from a `.srs` archive OR when `add_attachment` has been called in the current session (bytes live in MemoryStore). The download button shows `"—"` or is disabled when `documentId` is absent (no content available).
- `get_attachment_bytes` may throw (e.g. document not found, no content). The download handler wraps it in try/catch and shows an inline error.
