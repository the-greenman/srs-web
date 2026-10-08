# Essay references pool: one place for files and URLs

## Context
Files dropped onto an essay paragraph (#509) are stored and linked, but you can't see them. Each one is a bare `attaches` sourceRef on the paragraph. It shows only as a small file glyph in the margin, which often falls into the "+N" overflow. The glyph has no preview, the file can't be pinned, and it never appears in the References panel.

Agent-gathered sources work a different way. They are `com.mudemocracy.argument/source` records in the essay's references container (`references_container_id` on the document-state record), and they link to paragraphs with `evidences`. So the essay has two ways to do one job.

You want a document-level pool: conversation transcripts, research papers (as text) and URLs. You build it up first and link it to paragraphs later, and agents must be able to reference it.

**Decisions (owner, 2026-10-08):**
- Every reference is a `source` record.
- The fix covers GitHub repos as well as local folders and archives.
- Text only for now. PDFs are rejected with a hint.

## Model (no spec change)
- **File** → one `source` record in the references container:
  - `title` = the file name.
  - `source_kind` = `transcript`, `document` or `report`, guessed from the name and editable later.
  - The file is attached to the source record with `addAttachment` and `linkAttachment(sourceId)`. The source record carries the attachment; the paragraph does not.
- **URL** → one `source` record with `source_kind: web` and `source_url`. Its title is the URL for now; fetching the page title is skipped.
- **Dropped on a paragraph** → the same source record, plus `evidences` from the source to the paragraph.
  - The paragraph then shows the existing `source` glyph, which can be pinned and opened.
  - This replaces the direct paragraph `attaches` link. Old direct attachments still render through the current file glyph and are never migrated.
- **Dropped on the References panel or the essay background** → only the source record goes into the pool. Linking it to a paragraph later happens from the panel.

## Work (srs-web, fresh worktree off origin/main; local main is behind)
1. **`src/lib/essay/essay-document.ts`**
   - Replace `attachFiles(repo, paragraphId, files)` with `addReferences(repo, m, {files?, urls?}, paragraphId?)`. It creates source records with the existing `createRecord`, adds them with `addContainerMember(m.referencesContainerId, …)`, and links each file and the optional `evidences` relation with the existing relation binding.
   - Add `SOURCE_TYPE_ID` to `src/lib/essay/type-registry.ts`. Verify the UUID in the bundled essay `.srspkg`.
   - Add `linkReference(repo, sourceId, paragraphId)` for linking later.
2. **`src/lib/components/ReferencesTray.svelte`**
   - Mount a compact `AttachDrop` at the top of the tray (drop, paste, picker).
   - Pasting a bare URL, or dropping `text/uri-list`, becomes a URL source. Add URL detection to `attach-check.ts` as a pure helper, with a unit test.
   - Each row shows the kind, and a link icon when `source_url` is set.
   - Open works for unlinked references too. Fix #499 by opening the pinned pane by instance id, not through a paragraph link.
3. **Seeing the content**
   - The pinned pane and hover card for a source record show the attached text file: the first ~2 KB as a preview, plus "Open full".
   - Reuse `AttachmentsPanel`'s preview and `readFile` path (`src/lib/components/AttachmentsPanel.svelte`, `getAttachmentBytes`).
   - For a URL source, show the URL as an external link.
4. **`EssayShell.svelte`**
   - The paragraph drop and the ⋯ "Attach file…" call `addReferences(..., paragraphId)`.
   - Dropping on the essay background (outside paragraphs) calls `addReferences` with no paragraph.
   - Add a "Link to paragraph" action on tray rows. It reuses the chip and focus pattern: pick from the paragraph list in a popover.
5. **Text-only hint**
   - `attach-check.ts` rejects PDFs with the reason "PDF: paste the paper's text or add its URL".
6. **Agents**
   - In `agentHandoff` (`essay-document.ts:~498`), mention the pool: source records in the references container, with `source_url` and attached text.
   - Agents can't read attached text until **srs-rust#1333** (an MCP read for attachment content) ships. Check it is filed under the #224 story; comment on it if needed.
7. **GitHub**
   - Exploded-tree saves already carry `source-documents/`: `export_tree` is the raw MemVfs snapshot (`srs-rust/crates/srs-repository/src/tree_session.rs:68`), so they need no code change. Add a test that round-trips a tree with an attachment through `exportTree` and `openTree`.
   - A single-file `.srsj` on GitHub still refuses to save with attachments (#510). File an issue (Answers: …) for the `.srsj` envelope to carry text attachments. Until then the save message points those users to the exploded-tree layout.
8. **Size budget: 5 MB in the browser (owner: treat it as a useful constraint)**
   - When a repository has no policy, `attach-check.ts` gets a default total limit (`max_total_bytes`) of 5 MB, next to the existing 1 MB per-file default. Mark it `ponytail:` as interim until the policy binding (srs-rust#638).
   - Mount `RepoSize` in the References tray, with `maxBytes` set to the budget and `pendingBytes` set to the size of the files being dropped.
   - `usedBytes` = the sum of the `exportTree(repo)` byte lengths, recomputed on the write epoch. Mark it `ponytail:` until srs-rust#1328 (`repo_size`).
   - A drop that would go over the budget is rejected inline by the existing `checkFiles` total check, before anything is written.
9. Update the README rows and the styleguide specimens: tray with drop zone, URL row and file row.

## Not in this pass
- Large documents: addressable RAG over big references is a separate, later project. This pass stays inside the 5 MB budget.
- Fetching URL titles and metadata.
- PDF text extraction.
- Migrating existing direct paragraph attachments.
- Delete and unlink flows (#233).

## Verification
- **Unit tests:**
  - `addReferences` with a file: creates a source record, puts it in the container and links the attachment.
  - With a URL: creates a web source.
  - With a paragraph: also adds the `evidences` relation.
  - URL detection.
  - PDF rejection.
  - A file that would push the repository past the 5 MB default is rejected.
  - Tree round-trip keeps `source-documents/`.
- **e2e:**
  - Drop an `.md` file on the References tray: a row appears, Open shows the text preview.
  - Paste a URL: a web row appears with its link.
  - Drop on a paragraph: the source glyph appears on the paragraph, and its chip appears in the tray.
- **Gates by exit code:** `npm run build`, `npm test`, `npm run typecheck`, `npm run lint`, `npx playwright test`.
- **Manual:**
  - `npm run dev`, open an exploded GitHub essay repo.
  - Add a transcript and a URL to the pool, link one to a paragraph.
  - Save to a branch, reload, and confirm both survive and the preview shows.
- **Process:** run as a /ship unit, claim the issue first, and push the branch; the PR opens after review.
