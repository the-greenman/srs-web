# ADR-015: Binary storage interface for .srs archive support

- **Status:** proposed
- **Date:** 2026-07-21
- **Issue:** [srs-web#227](https://github.com/the-greenman/srs-web/issues/227)
- **Supersedes:** —
- **Superseded by:** —

## Context

srs-web#227 makes `.srs` (SRSzip — a ZIP archive) the default working format. The existing
`DocumentHandle` interface is string-based:

```typescript
read(): Promise<string>;
write(content: string, expectedRevision?: string | null): Promise<WriteResult>;
create?(name: string, content: string): Promise<DocumentHandle>;
```

`.srs` archives are binary (Uint8Array). Three options were considered:

1. **Change `read`/`write` to `string | Uint8Array`** — breaks every existing caller (type
   widening forces callers to handle both cases); high blast radius.
2. **New `BinaryDocumentHandle` type** — clean interface but duplicates the full handle surface
   and requires discriminated-union handling at every call site in App.svelte.
3. **Optional binary extension on the existing interface** — adds `readBytes?()` and
   `writeBytes?()` as optional methods; existing callers are unaffected; providers implement
   both; App.svelte checks capability at the call site.

## Decision

`DocumentHandle` is extended with two optional binary methods:

```typescript
interface DocumentHandle {
  // existing —
  read(): Promise<string>;
  write(content: string, expectedRevision?: string | null): Promise<WriteResult>;
  // new (optional) —
  readBytes?(): Promise<Uint8Array>;
  writeBytes?(bytes: Uint8Array, expectedRevision?: string | null): Promise<WriteResult>;
}
```

`StorageProvider.create?()` is updated to accept `string | Uint8Array`:

```typescript
create?(name: string, content: string | Uint8Array): Promise<DocumentHandle>;
```

All cloud providers (`DropboxDocumentHandle`, `GoogleDriveDocumentHandle`) implement both the
string and binary methods. `LocalDocumentHandle` implements `readBytes()` (write is a download
action, not a handle write).

Git handles (`GitHubDocumentHandle`) do **not** implement binary methods — GitHub git saves stay
on `.srsj` pending Epic 09.

## Auto-upgrade path

When `saveDirect()` is called on a cloud handle whose name ends in `.srsj`, a **new `.srs`
file is created** via `provider.create(newName, bytes)` and `activeDocument` is replaced. The
old `.srsj` file is left in cloud storage (deletion requires separate provider permission and
is out of scope for this change).

## Consequences

**Positive:**
- Backward-compatible: callers that do not check for `readBytes`/`writeBytes` continue working.
- Git handles are unaffected — Epic 09 scopes git binary support separately.
- The working-copy autosave (localStorage) is unaffected — still uses `export_srsj()` for size
  reasons; binary localStorage is future work.
- ADR-001 is preserved: all format conversion goes through WASM (`export_archive()`,
  `load_archive()`); TypeScript never inspects archive bytes.

**Negative / trade-offs:**
- Optional methods require presence checks (`if (handle.writeBytes)`) in App.svelte — slightly
  more verbose than a guaranteed interface.
- The old `.srsj` file persists in cloud storage after an upgrade; users must clean it up
  manually.

**Neutral:**
- `fetch` body accepts `Uint8Array` natively; no base64 encoding or multipart workaround is
  needed for Dropbox or Google Drive binary uploads.
- Cloud browser entries for `.srs` files flow through `onOpen(handle)` → `loadDocument()`;
  the extension dispatch happens inside `loadDocument()`, not in the caller. This keeps the
  handle intact for subsequent saves.
