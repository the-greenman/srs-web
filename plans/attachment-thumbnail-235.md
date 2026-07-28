# Plan: Attachment thumbnail / inline preview for image attachments (#235)

## Summary

`AttachmentsPanel.svelte` currently supports upload and download of attachment files, but renders every attachment as a plain filename row with no visual preview. When a user attaches an image file they have no way to confirm the content without downloading it. This plan adds a lazy per-attachment **Preview** toggle: clicking the button fetches bytes via `getAttachmentBytes`, constructs a Blob URL, and renders an `<img>` element inline. If the browser cannot decode the bytes as an image the `onerror` handler revokes the URL and shows "Not previewable". No MIME detection or extension inspection happens in TypeScript (ADR-001); the browser's built-in content sniffing determines whether the data is renderable.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | Lead |
| Web App Worker | Web App Worker |
| Verification | Verification Agent (srs-web) |

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Zero SRS semantics / MIME detection in TS — use browser's content sniffing via bare `Blob`, not extension-based detection | accepted |

No new ADR is needed: this is a pure UI enhancement on top of an existing WASM binding.

---

## Contracts

### WASM API surface

No new or changed WASM methods are required. The existing `getAttachmentBytes(repo, documentId): Uint8Array` binding is used as-is.

### TypeScript types

No new exported TS types. A local `type PreviewState = 'idle' | 'loading' | 'loaded' | 'error'` is defined inside `AttachmentsPanel.svelte` for the per-entry state machine. `AttachmentEntry` from `srs-client.ts` is consumed as-is.

---

## Scope

- Add a **Preview** toggle button to each row in `AttachmentsPanel.svelte` that has a `documentId`.
- On toggle-on: call `getAttachmentBytes`, create `Blob` (no MIME type — browser sniffs), create URL, display `<img>`.
- On toggle-off (or `onerror`): revoke Blob URL, hide `<img>`.
- If image fails to load (`onerror`): show "Not previewable" text inline, revoke URL.
- Loading state: show a brief "Loading…" text while bytes are being fetched.

**Out of scope:**

- Size threshold gating (deferred until `sizeBytes` is exposed by srs-rust#645 / srs-web#234).
- Eager loading (explicitly deferred — lazy only).
- Batch resolution via `resolve_document_view_attachments` (srs-web#232).
- Delete/unlink flows (srs-web#233, blocked on WASM binding).

---

## Phases

### Phase 1: Lazy thumbnail in AttachmentsPanel

**Goal:** Each attachment row shows a toggle that fetches bytes and displays an image preview inline; non-images fall back gracefully.

**Agent:** Web App Worker

#### Tasks

- [x] In `AttachmentsPanel.svelte`, define `type PreviewState = 'idle' | 'loading' | 'loaded' | 'error'` and add per-entry state (`Map<string, PreviewState>`) and Blob URL store (`Map<string, string>`). Add a `let destroyed = false` flag.
- [x] Add a **Preview** button ("Preview") that appears only when `entry.documentId` is non-null. The button is **disabled** when `previewState.get(entry.documentId) === 'loading'` to prevent double-click races.
- [x] Implement `togglePreview(entry)` with these branches:
  - If state is `'loading'` → no-op (button is disabled, but guard explicitly).
  - If state is `'loaded'` → revoke URL from Map, remove from Map, set state to `'idle'`.
  - If state is `'idle'` or `'error'` → set state to `'loading'`, then:
    - `await tick()` (Svelte) or `await Promise.resolve()` so the "Loading…" UI renders before the synchronous WASM call blocks the thread.
    - Inside try/catch, call `getAttachmentBytes(repo, entry.documentId)`.
    - On WASM throw: set state to `'error'` (no URL to revoke); show "Attachment bytes unavailable — export a .srs archive to preserve attachment content."
    - On success: guard `if (destroyed) return` before `URL.createObjectURL`.
    - Wrap `URL.createObjectURL(new Blob([bytes]))` in try/catch; on throw set state to `'error'`.
    - On success: store URL in Map, set state to `'loaded'`.
- [x] Render an `<img src={url} alt={entry.path}>` when state is `'loaded'`, with `onerror` handler that revokes URL, removes from Map, sets state to `'error'`, shows "Cannot display as image".
- [x] Render "Attachment bytes unavailable…" or "Cannot display as image" (from error message Map or state) when state is `'error'`.
- [x] Render "Loading…" when state is `'loading'`.
- [x] On `onDestroy`: set `destroyed = true`, then revoke and clear all active Blob URLs.
- [x] Add CSS for the thumbnail (max-width, max-height, border-radius).
- [x] Write unit tests for `togglePreview` covering: idle→loaded (success), idle→error via `onerror`, idle→error via WASM throw, loaded→idle (toggle-off URL revoked), and rapid double-click (second click no-op during loading).

#### Acceptance Criteria

- [ ] A **Preview** button appears next to the download button for each attachment with a `documentId`.
- [ ] Clicking Preview while idle: shows "Loading…" briefly (requires microtask yield before WASM call), then displays the image.
- [ ] Clicking Preview while loaded: revokes URL, hides image (toggle off).
- [ ] Clicking Preview while loading is in-flight: no-op (button is disabled).
- [ ] For a non-image attachment: shows "Cannot display as image" after the `onerror` fires; URL is revoked.
- [ ] If `getAttachmentBytes` throws (e.g., bytes not in session after loading from `.srsj`): state transitions from `'loading'` to `'error'` and shows "Attachment bytes unavailable — export a .srs archive to preserve attachment content."
- [ ] If `URL.createObjectURL` throws: state transitions to `'error'`.
- [ ] Clicking Preview from `'error'` state retries (transitions to `'loading'`).
- [ ] Component destroyed while fetch in-flight: `destroyed` flag prevents Blob URL creation; no URL leak.
- [ ] All Blob URLs are revoked on toggle-off and on component destroy.
- [ ] No MIME type string appears anywhere in TypeScript for content detection.
- [ ] No extension-based conditional gates the preview.
- [ ] `<img>` has `alt` attribute set to the attachment filename.
- [ ] New unit tests pass for all five `togglePreview` paths.
- [ ] `npm run typecheck` passes.
- [ ] No regression in download flow.

#### Milestone gate

1. Verify all acceptance criteria above are met, including edge cases (double-click, WASM throw, post-destroy).
2. Run `npm run typecheck && npm run lint && npm run build && npm test` — all must pass, including the new unit tests.
3. Mark completed task checkboxes `[x]`.
4. Commit: `feat(attachments): lazy image thumbnail preview (#235)`.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes (including new unit tests for `togglePreview`)
- [ ] Preview toggle shows image for a real image attachment
- [ ] Preview toggle shows "Cannot display as image" for a non-image attachment (`onerror` path)
- [ ] Preview toggle shows "Attachment bytes unavailable…" when `getAttachmentBytes` throws
- [ ] Double-click while loading: second click is a no-op (button disabled)
- [ ] Blob URLs are revoked on toggle-off and on component destroy
- [ ] No URL leak when component is destroyed while fetch is in-flight
- [ ] No MIME type inference in TypeScript
- [ ] `<img>` elements have `alt` attributes

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No MIME type detection in TypeScript (ADR-001). The browser sniffs content from raw bytes.
- No new WASM bindings required.

## Assumptions

- `getAttachmentBytes` returns valid bytes when `documentId` is provided and the attachment was added in the same in-memory session.
- Browser Blob URL from raw image bytes (without MIME type) renders correctly in `<img>` for common formats (JPEG, PNG, GIF, WebP).
- `sizeBytes` is not yet available (srs-rust#645 deferred), so no size threshold gating.
