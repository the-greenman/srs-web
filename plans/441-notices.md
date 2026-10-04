# Plan: One notice system (#441)

## Summary

Phase 6 of story muDemocracy.org#282 (epic #224). The owner review of 2026-10-04 found that transient messages are unstyled: "Link copied ×" renders as bare mono text with a raw ×, top-left under the Toolbar. That is the old `essay-shell__status` `<p>`, which lost its place when the header became the Toolbar (#435/#440). Behind it sits a wider problem: every shell invents its own notice markup (about 30 sites, 9 different class families, no shared component).

#441 is therefore widened to **one notice system**:

- **Toast.** A transient status ("Link copied", "Saved", "Exported", "Copied for agent"). One `ToastHost` per app, inside `Main`, a visual-only `popover="manual"` top-layer surface (ADR-020 e) positioned bottom-centre of the main column, with its text mirrored into two always-present visually-hidden live regions (polite, and `role=alert` for sticky errors), auto-dismiss, a close `IconButton`. It never shifts layout and stays above an open modal Drawer.
- **NoticeRegion.** Persistent document-level notices (today: catalog diagnostics) live in the same store and render in a `NoticeRegion` that `Main` places directly below the Toolbar/Topbar and above the `.workspace` scroller (not inside the scroller).
- **Notice.** An inline, persistent message with a `kind` (info, warning, error). Errors are strong; warnings are quiet; tokens only.
- **Diagnostics.** The existing `Diagnostics.svelte` gains a collapsed-by-default notice variant: grouped by identical message with a count, one line, expandable, dismissible per document.

Presentation only (ADR-001). No new WASM method; no spec change. One finding gates the grouping design: **render, find, blueprint and navigation diagnostics are plain `string[]`** (see Contracts).

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | orchestrating session |
| Web App Worker | Sonnet subagent (phases in order) |
| Verification | Haiku subagent (after each gate and before sign-off) |

See [agents.md](agents.md).

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../docs/adr/001-thin-client.md) | Thin client. Grouping uses only fields the engine returns; no code is parsed out of message text. | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | New parts and `--notice-*` / `--toast-*` tokens are skin API; every state is a `/styleguide` specimen. | accepted |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | Lucide icons by canonical file name; `data-part` tables; Phase 7 appends part (j) "Notices". | accepted, amended in Phase 7 |

Owner decisions (2026-10-04), detailed under "Decided by owner 2026-10-04":

| Ref | Decision | Status |
|---|---|---|
| D1 | Toasts sit bottom-centre of the main column. | decided |
| D2 | "Unsaved changes" stays in the Toolbar status; only save results are toasts. | decided |
| D3 | Diagnostics dismissal is per session, keyed by document; re-shows if the diagnostics change. | decided |
| D4 | Group on the exact message, no code chip; structured diagnostics tracked as srs-rust#1264. | decided |
| D5 | Save failure is a sticky error toast; location-bound errors stay inline. | decided |

No new ADR: the rules are written into ADR-020 (j) and the component headers.

## Contracts

### WASM API surface

**No** new or changed WASM methods for this PR.

Diagnostic shapes found in `src/lib/srs-client.ts` and `src/lib/types.ts`:

| Source | Shape | Has severity | Has code | Has location |
|---|---|---|---|---|
| `repo.validate()` (`RepositoryValidationReport.diagnostics`, `srs-client.ts:227`) | `Diagnostic { severity: "error" \| "warning" \| "info", message, ... }` | yes | no separate field | partial |
| `types.ts` `Diagnostic` (UI shape, used by `Diagnostics.svelte`) | `{ severity: "error" \| "warn" \| "info", message, where? }`; `GovernanceShell.mapDiagnostic` maps `warning` to `warn` | yes | no | `where` |
| `renderDocumentView().diagnostics` (`DocumentViewResult`, `srs-client.ts:1114`) | `string[]` | **no** | **no** | no |
| `find().diagnostics`, `resolveContainerView`, `blueprintSchema`, `repository_navigation`, `typeSchema` (`srs-client.ts:985, 1218, 1383, 1515, 1649`) | `string[]` | **no** | **no** | no |

**Finding:** there is no structured `code` anywhere. The "[R23] ..." form is a prefix inside the message string (no `[Rnn]` string appears in `src/`, `e2e/` or `tests/` today; Phase 1 task 1 captures a real sample from the fixture). Grouping therefore keys on the **exact message string** (after trim), with the severity the engine gave, or `warn` for the string arrays (no severity is provided; the quietest signal that still shows). A code chip is NOT parsed from text: extracting `R23` from `"[R23] ..."` would put engine message format into TS, an ADR-001 concern. If repeated R23 strings differ by an embedded instance id, exact-message grouping will not collapse them; that is the case for the srs-rust issue below.

**srs-rust issue (filed: the-greenman/srs-rust#1264, linked under muDemocracy.org#282; blocks only the code chip and id-tolerant grouping, NOT this PR):** "Expose structured diagnostics `{ severity, code, message, where?, instanceId? }` on `render_composition`, `find`, `resolve_container_view`, `blueprint_schema`, `repository_navigation`, `type_schema` bindings; keep `string[]` until clients move." When it lands, `groupDiagnostics` switches its key to `code + message-template` in one function (Phase 1 isolates it for that reason).

### TypeScript types

- `src/lib/notices.svelte.ts` (new, a `.svelte.ts` so it can hold `$state`; module-level, store-free):
  - `type NoticeKind = "info" | "success" | "warning" | "error"`.
  - `interface Toast { id: number; key?: string; kind: NoticeKind; text: string; testid?: string; sticky: boolean }`.
  - `notify(opts: { kind?: NoticeKind; text: string; key?: string; testid?: string; duration?: number }): number`. A call with an existing `key` replaces that toast in place and restarts its timer (so repeated Copy link gives one toast). `kind: "error"` is sticky (no timer, `role="alert"`); every other kind auto-dismisses after `duration` (default 4000 ms, `TOAST_MS` token-adjacent constant in the module).
  - `dismiss(id)`, `dismissKey(key)`, `toasts` (read-only `$state` array), `resetNotices()`. It clears toasts (and their timers) and the per-document diagnostics dismissals; pinned notices are NOT cleared by it, they clear only when the repository changes (`pinNotice` keyed by `repositoryId`, `unpinNotice` on a different repository). `ToastHost` also clears timers on unmount. On every document load App calls `resetNotices()` FIRST, then pins the catalog diagnostics. Unit test: after a second load, old toasts and dismissals are gone and the new catalog notice is pinned.
  - Persistent document notices: `pinNotice({ key, documentKey, kind, diagnostics?: Diagnostic[], text?: string, testid? })`, `unpinNotice(key)`, `pinned` (read-only `$state`). A pinned notice with `diagnostics` renders as a grouped `Diagnostics` notice variant; one without renders as a `Notice`. `Main`'s `NoticeRegion` renders `pinned`. Same-key `pinNotice` replaces.
  - **One save key:** every save result (App's and Governance's `saved` / `local-save-failed`) uses `key: "save"`, so a later save replaces an earlier one instead of stacking. Consequence (documented in ADR-020 j and the ToastHost header): the next save result, success included, **replaces a sticky save-error toast**; that is the intended "stays until dismissed or the next save" (D5).
  - `toUiDiagnostic(d: EngineDiagnostic | string): Diagnostic`: the ONE adapter from the engine shapes to the UI `Diagnostic` (`"warning"` becomes `warn`; a string becomes severity `warn`). The two engine types (`types.ts` `Diagnostic` and `srs-client.ts` `Diagnostic`) stay separate and are not merged. It replaces `GovernanceShell.mapDiagnostic` (line 341) and is used for App catalog diagnostics; `diagnosticsFromStrings` is `items.map(toUiDiagnostic)`. No third inline shape.
  - `groupDiagnostics(items: Diagnostic[]): DiagnosticGroup[]` where `DiagnosticGroup = { key: string; severity: DiagnosticSeverity; message: string; count: number; where: string[] }`, ordered error, warn, info, then first appearance. Pure and unit-tested; the one place a future `code` is used.
  - `diagnosticsFromStrings(items: string[]): Diagnostic[]` (via `toUiDiagnostic`).
- `Diagnostic` in `types.ts` is unchanged. `srs-client.ts` is untouched.

---

## Scope

- (a) Diagnostics: grouped by message with a count, one collapsed line by default, expandable, dismissible per document; warning quiet, error strong. `Diagnostics.svelte` is extended, not duplicated. The Generic `result.diagnostics.join(" ")` and `recordDiagnostics.join(" ")` are replaced.
- (b) One system for all user notices: toast, inline Notice, Diagnostics. Every ad-hoc notice, status or banner in Essay, Generic, Governance, Guides and the App-level banners goes through it, including the "Saved" family now plumbed as the `saveMessage` prop.
- Styleguide: toast (info, success, error), Notice (info, warning, error), Diagnostics collapsed and expanded.
- e2e as listed under Final Acceptance.

**Out of scope:**

- #442 (agent panel styling). `McpConnection`'s `.mcp-conn__error` (`role="alert"`) **stays component-local**: it is the agent connection's own status line, it is inside the agent panel #442 restyles, and it is cleared by the connection state, not by the user.
- #424 PR-B (Governance and Guides shell conversion). Their Topbar status spans (`readonly-reason`, `document-dirty-status`) stay; only notice markup is replaced.
- #426 (forms): field-level `form-error` in `SectionForm`, `RecordForm`, `Field` stay.
- #428 (modals): `GitSaveModal` and `SuccessorModal` errors stay.
- "Unsaved changes" stays in the Toolbar status: it is a state, not an event.

---

## Inventory (every notice, status or banner site)

Counts: **Essay 6, Generic 8, Governance 9, Guides 7, App 9, shared components 14 (4 in scope, 10 stay or deferred), McpConnection 1 (stays).** The list is the grep of `role=alert|status`, `notice`, `saveMessage`, `diagnostics`, `banner`, `error` over `src/`, re-grepped on the worktree (line numbers are current).

### Essay (`src/lib/essay/EssayShell.svelte`)

| # | Site | Current rendering | Disposition |
|---|---|---|---|
| E1 | `notice` set 337, 340 ("link points to an essay that is not here", "paragraph no longer here"); rendered 546-550 | `<p class="essay-shell__status" role="status" data-testid="address-notice">` + dismiss `IconButton` | inline `Notice` kind info, dismissible, same testid. A persistent address fact, not a transient event. |
| E2 | `notice = "Link copied"` (353) | same `<p>`, the unstyled one the owner flagged | `notify({kind:"success", key:"copy-link", text:"Link copied", testid:"address-notice"})` |
| E3 | `notice = "Copied"` (381, Copy for agent) | same `<p>` | `notify({kind:"success", key:"copy-agent", text:"Copied for agent", testid:"address-notice"})` (text keeps "Copied"; `essay-purpose.spec.ts:53` matches `/Copied/`) |
| E4 | `linkFallback` (551-555) | `<p class="essay-shell__status" role="status">` + readonly `Input` | inline `Notice` kind info holding the `Input`; testid `link-fallback` stays on the input. Actionable (user must copy), so inline, not a toast. |
| E5 | `error` (556; set 154, 156, 183, 285, 363, 383) | `<p class="essay-shell__error" role="alert" data-testid="essay-error">` | inline `Notice` kind error, strong, same testid, `role="alert"`. |
| E6 | Toolbar `status` snippet 540-541: `document-dirty-status`, `saveMessage` | two `<span role="status">` | dirty span stays (state). `saveMessage` span removed; the save result becomes a toast raised in App (see A1). |

### Generic (`src/lib/generic/GenericSrsShell.svelte`)

| # | Site | Current rendering | Disposition |
|---|---|---|---|
| G1 | read-only note 511 | `<p class="generic-readonly" data-testid="read-only-note" role="status">` (added in #440) | inline `Notice` kind info (quiet), same testid. |
| G2 | `documentError` 519 (set 164, 185, 188): `result.diagnostics.join(" ")` | `<p class="generic-notice">` | engine strings: `<Diagnostics variant="notice" diagnostics={diagnosticsFromStrings(result.diagnostics)}>` grouped. A thrown `message(error)` (164, 188) is a real failure: inline `Notice` kind error. Two states, so `documentError` splits into `documentDiagnostics: string[]` and `documentError: string \| null`. |
| G3 | `recordDiagnostics` 588 (set 217 caught error, 232 `find().diagnostics`, 235 caught error) | `<p class="generic-notice">{...join(" ")}</p>` | same split: `find()` strings via grouped Diagnostics; caught errors as error Notice. |
| G4 | `editError` 625 | `<p class="generic-notice">` | inline `Notice` kind error, `testid="generic-edit-error"`. |
| G5 | `SectionForm saveError` 278 | form error (#426) | stays. |
| G6 | Toolbar status 506-507 | dirty span + `saveMessage` span | as E6. |
| G7 | catalog banner (App-level, above the shell) | see A3 | same as A3 (no Generic-specific handling; no prop). |
| G8 | `generic-notice`, `generic-readonly` CSS (`generic-shell.css:62, 102`) | ad-hoc, uses `--color-warn` directly | deleted. |

### Governance (`src/lib/governance/GovernanceShell.svelte`)

| # | Site | Current rendering | Disposition |
|---|---|---|---|
| V1 | `topbar__save-indicator` 1014-1019, "Saved" with a 2 s CSS fade (`saveIndicator === "saved"`) | `<span role="status" aria-live="polite">` | `notify({kind:"success", key:"saved", text:"Saved"})` where `saveIndicator` is set. |
| V2 | `local-save-failed` 1021-1027 | `<span ... role="alert">` | `notify({kind:"error", key:"local-save-failed", testid:"local-save-failed", text})`; `dismissKey` when it clears (tests 466-522 expect it to disappear on success). |
| V3 | `readonly-reason` 1033 | Topbar span | stays (Topbar status; #424 PR-B). |
| V4 | `document-dirty-status` 1036 | Topbar span | stays. |
| V5 | `saveMessage` / `save-status` 1037-1043 | `<span role="status" aria-live="polite">` | removed; toast raised in App (A1), testid `save-status` kept on the toast. |
| V6 | `.size-warning-banner` 1054-1058 (css 1667-1682, hard-coded `#92400e`, `#fde68a`) | `<div role="status">` | inline `Notice` kind warning, `data-testid="size-warning"`; the class and its CSS are deleted. |
| V7 | `inspector__error` 1188 (`formError`), 1292 (`decisionExportError`) | `<p role="alert">` | inline `Notice` kind error (testids kept if present). |
| V8 | `<Diagnostics {diagnostics} />` 1317, the validation panel | `.diag-summary` + `.diag-list` | stays the full panel variant (default). It gains grouping with counts (same grouped list), no collapse. |
| V9 | `console.warn` of binding diagnostics 295, 353, 464 | console only | unchanged (not user notices). |

### Guides (`src/lib/guides/GuidesShell.svelte`)

| # | Site | Current rendering | Disposition |
|---|---|---|---|
| U1 | `saveMessage` / `save-status` 606-612 | `<span class="guides-save-message" role="status">` | removed; toast (A1). |
| U2 | `readonly-reason` 606, `document-dirty-status` 609 | Topbar spans | stay. |
| U3 | `.size-warning-banner` 634-638 (css 1069-1086) | `<div role="status">` | `Notice` warning, `data-testid="size-warning"`. |
| U4 | `schemaError` 640 `.guides-error` (`role="alert"`) | `<div class="guides-error" role="alert">`, hard-coded `#fef2f2`/`#b91c1c` (css 853) | `Notice` kind error, **testid `guides-error` added**; the `.guides-error` class dies. `e2e/guides-view-discovery.spec.ts:39` asserts `.guides-error[role='alert']` not visible: re-pointed to `getByTestId("guides-error")`. |
| U5 | `exportError` 685 `data-testid="guides-export-error"` | same `.guides-error` | `Notice` error, testid kept. |
| U6 | `schemaError` text from `result.diagnostics.join("; ")` 289-290 and `exportError` 492 | engine strings joined into one error | the error `Notice` receives the joined text unchanged (fatal case: the schema is unusable, so it is a failure not a diagnostic list). |
| U7 | `console.warn("blueprintSchema diagnostics")` 283 | console only | unchanged. |

### App-level (`src/App.svelte`) and boot

| # | Site | Current rendering | Disposition |
|---|---|---|---|
| A1 | `saveMessage` state (90; set 474, 544, 563, 630-663, 708; cleared 843, 882) passed to every shell (`registry.ts:33` `EditorProps.saveMessage`) | text rendered by each shell's Toolbar status | replaced by `notify` calls in App: "Saved.", "Saved. Newer changes remain unsaved." (info), the branch message (success, `duration` 8000), `saveErrorMessage(e)` (error, sticky), the migration messages ("Migrated ... Unsaved - Save to keep it") (info, `duration` 8000). Testid `save-status` on each. The `saveMessage` prop is **deleted** from `EditorProps`, the four shells and `App`'s props (one way per goal; no per-shell relay). |
| A2 | clearing `saveMessage = null` on open-another | n/a | `resetNotices()` when the document changes. |
| A3 | `catalogBanner` 724-743 (`role="alert" data-testid="catalog-diagnostics"`, "...and N more", Dismiss button; css 1002-1026), rendered at `App.svelte:827` (Generic) AND `:854` (every registered editor shell), outside `.app`, so it pushes the 100dvh grid | App raises it into the store: `pinNotice({ key: "catalog", documentKey: repositoryId, kind: "warning", diagnostics: collectCatalogDiagnostics(loaded).map(toUiDiagnostic), testid: "catalog-diagnostics" })` where `catalogDiagnostics` is set (line 476); `unpinNotice("catalog")` on document change. `Main` renders it in `NoticeRegion` (directly after the `bar` snippet), so EVERY shell that mounts `Main` (Essay, Generic, Governance, Guides) shows it. No `catalogDiagnostics` prop relay (the shells' only edit is passing their bar as `bar`, Phase 2). The snippet, both `{@render catalogBanner()}` calls, `catalogDiagnosticsOpen` and the CSS are deleted. It is a warning, no longer `role=alert` (selector table). **Gap:** the boot/splash states (splash, migration prompt, restore banner) render no `Main`, so they keep their existing inline errors (A4/A5) and a pinned notice is not shown there. |
| A4 | `splash__error` 756, `migration-error` 776 | boot-state `<p role="alert">` | `Notice` kind error inline (testid kept). |
| A5 | restore banner 788-790: `role="status"` message, `restore-banner__error` `role="alert"` | boot-state banner (actions inside it) | actionable (Restore / Discard buttons), stays a boot-state panel; only the error line becomes `Notice` error. |
| A6 | `catalogDiagnosticsOpen` 128 | local flag | replaced by per-document dismissal in `Diagnostics`. |

### Shared components with local `role="alert"` (no shell)

| Component:line | Disposition |
|---|---|
| `InstanceNotes.svelte:65`, `AttachmentsPanel.svelte:187`, `AttachmentLinkPanel.svelte:95`, `DecisionLogView.svelte:143` (`log-export-error`), `DecisionLinkPicker.svelte:146` (`link-error`), `BlueprintDocumentEditor.svelte:381, 384` (`bp-editor-error`), `CreateGovernanceDocumentPanel.svelte:93`, `SourceChooser.svelte:332` | Phase 6: one-line swap to `<Notice kind="error">`, testids kept. Each is an inline, actionable error: same component, strong variant. |
| `Migrations.svelte:74, 103, 107` | Phase 6: `Notice` (success for the `role="status"` result, error for the alerts). |
| `GitSaveModal.svelte:84` | stays (#428). |
| `SectionForm.svelte:278`, `RecordForm.svelte:119` | stay (#426). |
| `McpConnection.svelte:79` (`mcp-conn__error`, `role="alert"`) | **stays component-local.** Reasons: it belongs to the connection state machine (`status`, takeover, rotate), is cleared by that state not by the user, and sits inside the agent panel #442 restyles. Revisit in #442. |
| `InspectorTrigger.svelte:26` | a count badge with `role="status"`, not a notice; stays. |
| `Styleguide.svelte:96` | styleguide-only; stays. |

---

## Selector disposition

**Rule (as #421-#424):** each changed selector has one fate, re-pointed in the same commit as the markup. No aliases. Testids and accessible names are kept unless listed.

| Selector | Used by | Fate | Becomes |
|---|---|---|---|
| `[data-testid=address-notice]` | `EssayShell.test.ts:350, 352`, `essay-purpose.spec.ts:53`, `essay-comments.spec.ts:184` | kept | on the `Notice` (E1, "no longer here") and on the toasts E2/E3 (`/Link copied/`, `/Copied/`). Never both at once for the same text. |
| `[data-testid=link-fallback]` | essay e2e | kept | on the `Input` inside the E4 `Notice`. |
| `[data-testid=essay-error]` | `essay-editor.spec.ts` (`toHaveCount(0)`), `migrate-rev8.spec.ts` | kept | on the E5 error `Notice` (absent when no error). |
| `[data-testid=read-only-note]` | `GenericSrsShell.test.ts:268, 285` | kept | on the G1 `Notice` info. |
| `[data-testid=document-dirty-status]` | 14 e2e/test refs | kept | unchanged Toolbar status span. |
| `[data-testid=save-status]` | `rfc038-concurrency`, `local-folder`, `cloud-storage` e2e (`toContainText("Saved.")`, `"new branch"`) | kept | on the toast; the toast is raised before the assertion and lives 4 s (8 s for the branch message), longer than Playwright's default expect poll. |
| `[data-testid=readonly-reason]` | `GuidesShell.test.ts:429, 446`, `local-folder.spec.ts:143` | kept | unchanged Topbar span (#424 PR-B). |
| `[data-testid=local-save-failed]` | `GovernanceShell.test.ts:482-522` | kept | on the sticky error toast; `dismissKey("local-save-failed")` when the state clears. |
| `[data-testid=catalog-diagnostics]` | `local-folder.spec.ts:130-131` (`toHaveCount(0)`) | kept | on the notice-variant `Diagnostics` root, rendered only when there are diagnostics. |
| `[data-testid=guides-export-error]` | guides e2e | kept | on the error `Notice`. |
| `.guides-error[role='alert']` | `guides-view-discovery.spec.ts:39` | removed | `getByTestId("guides-error")`; testid added to the U4 `Notice`. |
| `.size-warning-banner` | `GuidesShell.test.ts:179-217`, `GovernanceShell.test.ts:226-274` | removed | `[data-testid="size-warning"]`; the tests' text assertions ("N size warning(s)") are unchanged. |
| `.generic-notice`, `.generic-readonly`, `.essay-shell__status`, `.essay-shell__error`, `.catalog-banner*`, `.topbar__save-indicator`, `.topbar__save-message--error`, `.guides-error` | their own CSS only (no test uses them, except the two rows above) | removed | the `.notice`, `.toast`, `.diag` families (Phase 1). |
| `[role=alert]` assertions: `cloud-storage.spec.ts:463, 471, 480, 623, 781` (strict `getByRole("alert")` or count 0), `create-document.spec.ts:66`, `musrs-fixture.spec.ts:38, 50` | those specs | kept | They assert no alert (or exactly one inline error, "Provider authorization failed" / "Failed to load repository") on load and open paths. Verified by reading: they raise no save, so no sticky toast; the catalog notice must NOT carry `role=alert` (else `musrs-fixture` and `create-document` break on a repo with catalog diagnostics); `cloud-storage:471/480` still find their single inline error (not a toast). The Phase 6 and 7 gates re-run these specs. |
| `[data-testid=catalog-diagnostics]` role | `local-folder.spec.ts:130` | changed | `role=status` via `Notice` (warning kind), no longer `role=alert`; presence/absence assertions unchanged. |
| `[role="alert"]:not(.mcp-conn__error)` | `styleguide.spec.ts:15` | changed | `... :not([data-specimen])`; every specimen notice carries `data-specimen` (Phase 1). |
| `.guides-save-message`, `.topbar__save-message--error` | CSS only (`GuidesShell.svelte:1063`, `GovernanceShell.svelte:1440, 1446`) | `.guides-save-message` kept for the Topbar spans that stay (`readonly-reason`, `document-dirty-status`); `.topbar__save-message--error` deleted with V2 | none |
| `.diag`, `.diag-summary`, `.diag-list`, `.diag__msg`, `.diag-clear` | `validation.spec.ts`, Governance validation panel | kept | unchanged in the panel variant; the grouped row adds `.diag__count`. |

---

## Phases

Every phase's gate starts with `npm ci && npm run fetch-bindings`.

**Gate command (every phase):** `npm run typecheck && npm run lint && npm test` plus the phase's e2e line. A phase may not start before the previous gate is green and committed. e2e baselines are the last GREEN origin/main run, never an assumption.

### Phase 1: Notice model, components, tokens, styleguide

**Goal:** the model, `Notice`, `Toast`, the grouped `Diagnostics` variant and their tokens exist and are specimens on `/styleguide`; no shell uses them yet.

**Agent:** Web App Worker

#### Tasks

- [x] Capture the real shape first: load `e2e/fixtures` composition(s) in a throwaway vitest or node script, call `renderDocumentView` and `find`, and paste 3-5 real diagnostic strings (including a repeated R23 on a composition) into this plan under "Captured samples" and into the `groupDiagnostics` unit test as fixtures. If the repeats are not byte-identical, record that and keep the srs-rust issue as the fix; do not add parsing.
- [x] `src/lib/notices.svelte.ts`: `notify`, `dismiss`, `dismissKey`, `toasts`, `resetNotices`, `groupDiagnostics`, `diagnosticsFromStrings` per Contracts. The timer is cleared on `dismiss` and on a same-key replace. Errors are sticky.
- [x] `src/lib/components/Notice.svelte`: `kind: "info" | "success" | "warning" | "error"`, a Lucide icon per kind (`info`, `circle-check`, `triangle-alert`, `circle-alert` from `@lucide/svelte/icons/<name>`), `children`, optional `onDismiss` (renders `IconButton size="sm" icon={X} label="Dismiss"`), `testid`. `role="alert"` only for error; others `role="status"`. Warning is quiet (ink text, thin `--notice-warn-rule`); error is strong (`--color-error` rule, `--color-error-subtle` fill, medium weight). `data-part`: `icon body dismiss`.
- [x] `src/lib/components/ToastHost.svelte`: the VISUAL host only, mounted once by `Main.svelte` (one per app; shell tests render the shell only, with no extra harness host). It carries NO live-region role and NO `aria-live`; live regions are separate (next task).
  - an outer `popover="manual"` element (ADR-020 e) with the toast rows and their focusable close `IconButton`s; `showPopover()` while any toast exists, `hidePopover()` when none, both guarded by `:popover-open` (ADR-020 e: idempotent);
  - **re-stack:** a `restack()` = `hidePopover()` then `showPopover()` (safe because the live regions are outside the popover) runs on each new toast AND whenever a drawer opens (an `$effect` on `ShellState.navOpen` / `inspectorOpen` becoming true, read via `getShell()`, which is undefined-safe), so the host re-enters the top layer above the Drawer dialog and scrim;
  - position: bottom-centre of the main column, via a pure `placeBottomCentre(rect, size, viewport)` added to `popover-position.ts` (unit-tested). The host finds its own `.app__main` with `closest()`; the bottom edge uses `visualViewport` (height and offsetTop) so the toast stays above the mobile keyboard; the width is clamped to the viewport. Recomputed on window and `visualViewport` resize and on a `ResizeObserver` for `.app__main`. No dependency on `.app__main { position: relative }`;
  - unmount clears its timers.
  - Limitation (documented in the component header and ADR-020 j): while a MODAL drawer is open the toast is visible above the scrim but inert (the dialog makes everything outside it inert), so its close button cannot be clicked; a sticky error stays until the drawer closes and it is dismissed, or the next save replaces it.
- [x] `src/lib/components/LiveRegions.svelte` (rendered by `Main`, always, even with no toasts): two visually-hidden elements, one `aria-live="polite"` (non-error toasts) and one `role="alert"` (sticky errors), outside the popover. They mirror the current toast text: the component writes the text into the ALREADY-RENDERED node (never inserts the region with its content), and clears it when the toast goes. The empty regions carry no text. Visually hidden by the existing `.sr-only` utility (`utilities.css:39`).
- [x] `src/lib/components/NoticeRegion.svelte`: renders `pinned` (a grouped `Diagnostics` notice variant or a `Notice`). Real DOM order, no CSS `order`: `Main.svelte` gains a `bar?: Snippet` prop and renders `{@render bar?.()}<NoticeRegion />{@render children?.()}`, so tab and reading order is bar, notices, content, and the `.workspace` scroller (inside `children`) stays the one scroller.
- [x] `Diagnostics.svelte`: add props `variant: "panel" | "notice" = "panel"`, `documentKey?: string`, `testid?`. Both variants render `groupDiagnostics(...)` rows with a `.diag__count` ("x3") and the distinct `where` list. The notice variant renders its chrome THROUGH `Notice` (one visual and role path, one dismissal path: `Notice`'s `onDismiss`) with the grouped list as its body. It is one line collapsed ("2 warnings, 1 error", chevron `IconButton` `aria-expanded` + `aria-controls`), expands to the groups, and a dismiss `IconButton` hides it. Dismissal is a module-level `Map<documentKey, contentHash>` (session scope, D3): a dismissed key stays hidden until its `diagnostics` content hash changes. The panel variant is unchanged apart from grouping. A zero-count notice renders nothing; the panel keeps its all-clear text.
- [x] `src/styles/components/notice.css`, `toast.css`; `diagnostics.css` gains `.diag--collapsed`, `.diag__count`, `.diag__toggle`. Imported in `src/styles/index.css` in the components layer. Delete nothing ad-hoc yet (the shells still use it until their phase).
- [x] `src/styles/tokens-components.css`: `--notice-bg`, `--notice-border`, `--notice-pad`, `--notice-gap`, `--notice-radius`, `--notice-warn-rule`, `--notice-error-bg`, `--notice-error-rule`, `--toast-bg`, `--toast-border`, `--toast-shadow`, `--toast-width`, `--toast-offset-bottom`, `--toast-gap`. Component CSS reads only these and semantic tokens; no hex, no raw palette (`styles-tokens.test.ts` enforces).
- [x] Anchoring (no layout shift): the host is a top-layer popover, so it is out of flow by construction. `--toast-offset-bottom` leaves room for the agent dock; z-order against the dock and the modal Drawer is solved by the top layer, not by a z-index (so there is no `--toast-z`).
- [x] `src/Styleguide.svelte`: section `#notices`. Every specimen notice carries `data-specimen` (so the styleguide's no-alert gate can exclude it) and these testids: `specimen-toast-info`, `specimen-toast-success`, `specimen-toast-error` (static in-flow renderings of the toast row, NOT live hosts), `specimen-notice-info`, `specimen-notice-warning`, `specimen-notice-error`, `specimen-diagnostics-collapsed`, `specimen-diagnostics-expanded` (fixture with a repeated message so a count shows), `specimen-diagnostics-panel`; plus a "Fire toast" button (`specimen-fire-toast`) that calls the real `notify`.
- [x] `e2e/styleguide.spec.ts:15`: the no-alert gate becomes `[role="alert"]:not(.mcp-conn__error):not([data-specimen])`.
- [x] Unit tests: `tests/notices.test.ts` (`pinNotice` / `unpinNotice`, `toUiDiagnostic`, notify replaces by key, restarts the timer, error sticky, `dismissKey`, `groupDiagnostics` ordering and counts using the captured samples, `diagnosticsFromStrings`), `tests/Notice.test.ts` (roles per kind, dismiss), `tests/ToastHost.test.ts` (auto-dismiss via fake timers, `hidePopover` then `showPopover` on a new toast and when `ShellState.inspectorOpen` becomes true, close buttons focusable, timers cleared on unmount), `tests/LiveRegions.test.ts` (both regions exist with no toasts; a new toast writes its text into the SAME existing node, an error into the `role=alert` one; no live role or `aria-live` on the popover host), `tests/NoticeRegion.test.ts`, `tests/Main.test.ts` (DOM order bar, notice region, children), `tests/popover-position.test.ts` (`placeBottomCentre`: centred on the rect, clamped to the viewport width, bottom edge from the visualViewport), `tests/Diagnostics.test.ts` (grouped count, collapsed default, expand, dismiss per `documentKey`, panel unchanged).
- [x] `src/lib/components/index.ts` and `src/lib/components/README.md`: export and list `Notice`, `ToastHost`, `NoticeRegion`; `src/styles/README.md` file map gets `notice.css`, `toast.css`.

#### Acceptance Criteria

- [x] `/styleguide` shows every state; `e2e/styleguide.spec.ts` asserts each testid listed above is visible and the no-alert gate excludes `[data-specimen]`.
- [x] The "Captured samples" section below is FILLED with real strings (repeated R23 included) and the `groupDiagnostics` tests use them as fixtures; Phase 1 does not pass otherwise.
- [x] No hard-coded colour, size or z-index in the new CSS.
- [x] Existing shells render exactly as before.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- notices Notice ToastHost Diagnostics styles-tokens AppShell
npx playwright test e2e/styleguide.spec.ts e2e/validation.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: notice, toast and grouped diagnostics components with tokens and styleguide (#441)`.

---

### Phase 2: Toast host wired once, save results via App

**Goal:** the host is mounted by `Main`, App raises save/migration results as toasts, and the `saveMessage` prop is gone from the shells.

**Agent:** Web App Worker

#### Tasks

- [x] `Main.svelte` gains `bar?: Snippet` and renders `{@render bar?.()}<NoticeRegion />{@render children?.()}<LiveRegions /><ToastHost />`. Each shell moves its Toolbar/Topbar into `{#snippet bar()}` (small, explicit edits): `EssayShell.svelte:514-543` (`Toolbar`), `GenericSrsShell.svelte:501-509` (`Toolbar`), `GovernanceShell.svelte:998-1051` (`Topbar`) AND `:1134-1139` (the second `Main`, `Topbar`), `GuidesShell.svelte:587-631` (`Topbar`). The Generic read-only note and any other content that follows the bar stays in `children`. No CSS `order` rules. Test: DOM order is bar, notice region, children in each shell.
- [x] `App.svelte`: replace every `saveMessage = ...` with `notify` per inventory A1 (testid `save-status`, key `"save"` for EVERY save result); raise the catalog diagnostics with `pinNotice` (A3) and delete `catalogBanner`, its two `{@render}` calls (827, 854) and `catalogDiagnosticsOpen`; delete `saveMessage` state and the prop; `resetNotices()` on open-another and on loading a new document. `saveErrorMessage(e)` becomes a sticky error toast with `key: "save"`.
- [x] Delete `saveMessage` from exactly these sites (grep-verified): `src/lib/editors/registry.ts:33`; `src/App.svelte` (state 90, setters, props 836 and 865); the props and status snippets of the four shells (`EssayShell.svelte:86,104,541`, `GenericSrsShell.svelte:69,86,507`, `GovernanceShell.svelte:91,120,1037-1043`, `GuidesShell.svelte:81,99,606-612`). No file under `tests/` references `saveMessage` (grep-verified), so no test is rewritten for the prop; check `tests/editor-registry.test.ts` still types. Delete the Governance `topbar__save-indicator` ("Saved" fade, V1) and its `save-fade` CSS; `saveIndicator` keeps driving only the V2 failure.
- [x] Rewrite `tests/GovernanceShell.test.ts:485-539`, which assert `getByText("Saved")` and `topbar__save-indicator--visible`. The shell test renders the shell only (the host is inside `Main`), so assert the toast: `findByTestId("save-status")` reads "Saved", and `local-save-failed` is the sticky `role=alert` toast, absent after a later successful save (the same `"save"` key replaces it).
- [x] Toast timers are cleared when the host unmounts (covered by the `ToastHost` test); shell tests use fake timers where they assert disappearance.
- [x] Governance V1 and V2: `notify({ kind: "success", key: "save", text: "Saved", testid: "save-status" })` and `notify({ kind: "error", key: "save", testid: "local-save-failed", ... })`; the one key means App's and Governance's results replace each other.

#### Acceptance Criteria

- [x] After Save, one `save-status` toast reads "Saved." and disappears (the next save result replaces any earlier or sticky save toast); the Toolbar status shows only "Unsaved changes" (unchanged testid).
- [x] No shell takes a `saveMessage` prop (`grep -rn saveMessage src` returns nothing).

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- EssayShell GenericSrsShell GovernanceShell GuidesShell Main editor-registry
npx playwright test e2e/rfc038-concurrency.spec.ts e2e/local-folder.spec.ts e2e/cloud-storage.spec.ts e2e/mcp-relay.spec.ts e2e/essay-write-guard.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: one toast host; save results are toasts (#441)`.

---

### Phase 3: Essay adopts it

**Goal:** no ad-hoc notice markup left in `EssayShell.svelte`.

**Agent:** Web App Worker

#### Tasks

- [x] E2/E3: `copyLink` and `copyForAgent` call `notify` (key `copy-link` / `copy-agent`, `testid: "address-notice"`, texts "Link copied" / "Copied for agent"). `notice` state now holds only the address facts (E1).
- [x] E1, E4, E5 render as `Notice` (info with `onDismiss`, info holding the `Input`, error) where they are today, directly under the Toolbar inside `Main`, with the existing testids (location-bound, so inline; only the catalog notice goes through `NoticeRegion`). The "could not copy" failures (E5 at 383) stay as the inline error.
- [x] Delete `.essay-shell__status`, `.essay-shell__error` from `essay-shell.css`; E6 `saveMessage` span already gone (Phase 2).
- [x] Update `EssayShell.test.ts:350-352` only if the markup moved; text assertions stay.
- [x] Exports: `exportMarkdown` success raises `notify({kind:"success", key:"export", text:"Exported"})`; failure stays `error`.

#### Acceptance Criteria

- [x] Copy link shows exactly one toast (`role=status`), repeating the click does not stack, it disappears after the timeout, and the first child of `.workspace` does not move (Phase 5 e2e).
- [x] An unresolvable address shows the inline info Notice with a working dismiss.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- EssayShell Block essay-document address
npx playwright test e2e/essay-comments.spec.ts e2e/essay-purpose.spec.ts e2e/essay-editor.spec.ts e2e/essay-toolbar.spec.ts e2e/essay-export-markdown.spec.ts e2e/shell-layout.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: essay notices and status go through the notice system (#441)`.

---

### Phase 4: Generic adopts it (diagnostics grouped)

**Goal:** Generic renders engine diagnostics as grouped, collapsible, dismissible notices, and real failures as strong inline errors.

**Agent:** Web App Worker

#### Tasks

- [x] Split `documentError` into `documentDiagnostics: string[]` (from `renderDocumentView().diagnostics`, line 185) and `documentError: string | null` (thrown, 164/188); same split for `recordDiagnostics` (217/232/235). Delete both `.join(" ")` uses.
- [x] Render: `<Diagnostics variant="notice" diagnostics={diagnosticsFromStrings(documentDiagnostics)} documentKey={repositoryId + ":" + selectedCompositionId}>` under the title, errors via `Notice kind="error"`. Record-list diagnostics likewise with key `...:records:<containerId>`.
- [x] G1 read-only note and G4 edit error become `Notice` (testids `read-only-note`, `generic-edit-error`).
- [x] A3 is done in Phase 2 (store plus `NoticeRegion`); here verify Generic shows it below the Toolbar and delete the App CSS `.catalog-banner*` (1002-1026) if Phase 2 left it. `local-folder.spec.ts:130` must still see zero for a clean tree. Add an e2e that a registered-editor shell (Essay or Guides) shows the catalog notice too, because the old banner rendered for every shell.
- [x] Delete `.generic-notice`, `.generic-readonly` from `generic-shell.css`.
- [x] Add `tests/GenericSrsShell.test.ts` cases: a render result with the same warning three times yields one group "x3"; collapsed by default; expand shows one row; dismiss hides it for that composition and a second composition still shows its own; a thrown render shows an error `Notice`.
- [x] `e2e/notices.spec.ts` (new; first part): load a repo whose composition emits a repeated R23 (use the Phase 1 captured sample; add a fixture under `e2e/fixtures/` if none produces a repeated R23; `page.route` stubs are not allowed), assert one collapsed line, expand to one group with the count, dismiss, switch composition and back (still dismissed), reload (shown again, session scope).

#### Acceptance Criteria

- [x] No `join(" ")` of diagnostics in `GenericSrsShell.svelte`.
- [x] Repeated R23 shows one line, then one group with a count; dismiss works per document.
- [x] The read-only note keeps testid `read-only-note` and the Toolbar is unchanged.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- GenericSrsShell Diagnostics notices
npx playwright test e2e/notices.spec.ts e2e/local-folder.spec.ts e2e/load-repo.spec.ts e2e/record-edit.spec.ts e2e/blueprint-document-editor.spec.ts e2e/navigation.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: generic diagnostics are grouped notices; errors are inline and strong (#441)`.

---

### Phase 5: Governance and Guides adopt it (minimal)

**Goal:** the size banners, error divs and status spans in these two shells are `Notice`; nothing else changes (their full conversion is #424 PR-B).

**Agent:** Web App Worker

#### Tasks

- [x] Governance: V6 `size-warning-banner` becomes `Notice kind="warning" testid="size-warning"`; V7 `inspector__error` become `Notice kind="error"`; delete the `.size-warning-banner` CSS (1666-1682).
- [x] Guides: U3 as V6; U4/U5 `Notice kind="error"` with testids `guides-error` (added) and `guides-export-error`; delete `.guides-error`, `.size-warning-banner` CSS and the `guides-save-message` rules no longer used.
- [x] Re-point the selectors in the disposition table: `GuidesShell.test.ts:179-217`, `GovernanceShell.test.ts:226-274` to `[data-testid="size-warning"]`, `guides-view-discovery.spec.ts:39` to `getByTestId("guides-error")`.
- [x] Do not touch layout, Topbar structure, `Workspace`, or `.canvas` (PR-B). Do not convert `readonly-reason` / `document-dirty-status`.
- [x] `e2e/notices.spec.ts` (second part): Guides export failure shows an inline error `Notice` (no toast, `role=alert`, persistent) and a successful save still shows the `save-status` toast.

#### Acceptance Criteria

- [x] `grep -rn "size-warning-banner\|guides-error" src` finds only testid or Notice usage; no hard-coded notice colours remain in either shell.
- [x] The Governance validation panel is unchanged apart from grouping counts.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test -- GovernanceShell GuidesShell Notice
npx playwright test e2e/notices.spec.ts e2e/validation.spec.ts e2e/validate-on-save.spec.ts e2e/lifecycle.spec.ts e2e/decision-flow.spec.ts e2e/guides-editor.spec.ts e2e/guides-json-export.spec.ts e2e/guides-view-discovery.spec.ts e2e/guides-html-preview.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command plus the phase's e2e line. 3. Tick boxes. 4. Commit: `feat: governance and guides notices use the notice system (#441)`.

---

### Phase 6: Inline error sweep and boot states

**Goal:** the remaining standalone `<p role="alert">` sites that are neither forms, modals nor the agent panel use the one component.

**Agent:** Web App Worker

#### Tasks

- [x] Swap to `<Notice kind="error">` (testids and text unchanged): `InstanceNotes.svelte:65`, `AttachmentsPanel.svelte:187`, `AttachmentLinkPanel.svelte:95`, `DecisionLogView.svelte:143`, `DecisionLinkPicker.svelte:146`, `BlueprintDocumentEditor.svelte:381, 384`, `CreateGovernanceDocumentPanel.svelte:93`, `SourceChooser.svelte:332`, `Migrations.svelte:74, 103, 107`, and in `App.svelte` A4/A5 (`splash__error`, `migration-error`, `restore-banner__error`).
- [x] Remove each now-unused local error class from its CSS; keep the layout classes.
- [x] Explicitly NOT touched, with the reason in the PR body: `McpConnection` (#442), `GitSaveModal` and `SuccessorModal` (#428), `SectionForm`, `RecordForm`, `Field` (#426), the Topbar `readonly-reason` / `document-dirty-status` spans (#424 PR-B).
- [x] Add a guard test `tests/no-adhoc-notices.test.ts`, scoped to `role=alert` only (it does not police `role=status`). It scans `src/**/*.svelte` for `role="alert"`, `role='alert'` and dynamic `role={...}`; a dynamic `role={...}` is matched but NEVER allowlisted by default (each one must be resolved or given an explicit entry with a reason). It compares per-file counts with a `path -> count` allowlist, each entry with a reason comment: `McpConnection.svelte` (#442), `GitSaveModal.svelte` and `SuccessorModal.svelte` (#428), `SectionForm.svelte` and `RecordForm.svelte` (#426 form errors, incl. `.form-error`), `InspectorTrigger.svelte` (badge, not a notice), `Notice.svelte` and `ToastHost.svelte` (the components themselves), `Styleguide.svelte` (specimens). A new or removed site fails CI until the list is updated.

#### Acceptance Criteria

- [x] The allowlist test passes and lists exactly the entries above.
- [x] All existing component tests and e2e for the touched panels pass with unchanged selectors.

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test
npx playwright test e2e/instance-notes.spec.ts e2e/migrations.spec.ts e2e/migrate-rev7.spec.ts e2e/migrate-rev8.spec.ts e2e/decision-link.spec.ts e2e/create-document.spec.ts e2e/cloud-storage.spec.ts e2e/export-import.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command plus the phase's e2e line. 3. Tick boxes. 4. Commit: `refactor: remaining inline errors use Notice; guard against ad-hoc alerts (#441)`.

---

### Phase 7: Docs, ADR-020 part, final e2e

**Goal:** the rules are written down and the e2e for the owner's report is in.

**Agent:** Web App Worker, then Verification

#### Tasks

- [ ] `docs/adr/020-icon-set-and-component-token-api.md`: append **(j) Notices (#441)**: the model (toast = event, Notice = persistent state, Diagnostics = engine findings); roles (two always-present visually-hidden live regions in `Main`, polite and `role=alert`, written into after render, mirror the toasts; the popover host is visual only with no live role; inline Notices: `alert` for error, `status` for the rest); errors sticky and strong, everything else quiet and auto-dismissed; anchoring and the no-layout-shift rule (top-layer popover positioned from the main column rect); the `data-part` table (`Notice`: `icon body dismiss`; `ToastHost`: `host`; `Diagnostics`: `summary toggle group count dismiss`); tokens `--notice-*` `--toast-*`; grouping keys on exact message until the engine exposes `code`; the `no-adhoc-notices` guard (scoped to `role=alert`) and its allowlist; the top-layer `popover="manual"` toast host, re-stack (`hidePopover` then `showPopover`) on a new toast and a drawer opening, the live regions outside the popover, the modal-drawer inert limitation, the one `"save"` key and same-key replacement of a sticky error; `NoticeRegion` for pinned document notices and `Main`'s `bar` snippet (real DOM order bar, notices, content); Toolbar status keeps state ("Unsaved changes"), never events.
- [ ] `src/styles/README.md`, `src/lib/components/README.md`: file map and component table.
- [ ] Update this plan's "Captured samples" and tick all boxes.
- [ ] `e2e/notices.spec.ts` final cases, using Playwright's `page.clock` (`install()` before load, then `runFor(...)`) so toast timeouts are deterministic, with no real sleeps:
  - Copy link: exactly one toast (`address-notice`, visible row in the host); advance the clock past the duration, then `toHaveCount(0)`; a second click inside the window does not stack.
  - No layout shift: `boundingBox().y` of the first child of `.workspace` is equal before, while the toast is shown and after it is gone.
  - Drawer: at 900px open the inspector drawer and fire a toast; `elementFromPoint` at the toast's centre returns a toast descendant (visible above the scrim). Also: raise a sticky error toast BEFORE opening the inspector drawer; after the drawer opens it is still visible above the scrim (re-stack).
  - Errors stay inline: a location-bound error stays after the clock advances; a save-failure sticky toast (`role=alert`) stays after the clock advances and is replaced by the next save.
  - All Phase 1 specimen testids are visible on `/styleguide`.
  - Plus a mobile-width pass (`e2e/mobile-layout.spec.ts` extended: a toast fits the phone width and does not cover the Toolbar).
- [ ] Verification agent runs the full suite and the three-viewport screenshot pass on `/styleguide`.

#### Acceptance Criteria

- [ ] Strict-mode `getByRole("alert")` / `[role="alert"]` assertions elsewhere still pass (selector table); no sticky toast leaks between tests (`resetNotices()` on document change; each Playwright test has a fresh page).
- [ ] ADR-020 (j) exists and cites the tokens and parts actually shipped (the existing doc drift guards pass).

#### Testing

```bash
npm ci && npm run fetch-bindings
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/notices.spec.ts e2e/styleguide.spec.ts e2e/mobile-layout.spec.ts e2e/shell-layout.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Run the Gate command plus the phase's e2e line. 3. Tick boxes. 4. Commit: `docs: ADR-020 notices, README maps (#441)`.

---

## Final Acceptance

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] Full `npx playwright test` is no worse than the last GREEN origin/main run.
- [ ] e2e (`e2e/notices.spec.ts`):
  - the catalog notice shows in every shell, not only Generic;
  - repeated R23 on a composition shows a one-line summary that expands to ONE group with a count, and dismiss works per document;
  - Copy link shows exactly one toast (in the polite live region) that disappears, and the `boundingBox().y` of the first child of the main column's `.workspace` is identical before, during and after (no layout shift); a toast fired with the inspector drawer open at 900px is visible above the scrim;
  - an error (Guides export failure, Essay clipboard failure) stays inline, strong, `role=alert`, and persists until its cause or the user clears it.
- [ ] `/styleguide` shows toast (info, success, error), Notice (three kinds), Diagnostics collapsed and expanded.
- [ ] `grep -rn "saveMessage" src` is empty; no `.join(" ")` of diagnostics for display; `no-adhoc-notices` guard green.
- [ ] Out-of-scope items (#442, #424 PR-B, #426, #428) are untouched.

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). Diagnostics are displayed and grouped as given; no code is parsed from message text.
- Each changed selector is re-pointed in the same commit as its markup (table above); no aliases.
- The structured-diagnostics issue is already filed as srs-rust#1264; no task files it.
- Verification Agent runs after each gate and before sign-off.
- Agents push the branch only; the owner opens and merges the PR after review.

## Assumptions

- **Location-bound errors** are field-, form-, modal- or editor-context-specific errors (a form's save error, a picker's link error, an export error beside its button, the Essay clipboard failure): they stay inline as `Notice kind="error"`. Save results and other transient events are toasts; a save FAILURE is the one error that is a (sticky) toast, because it has no location (D5).

- `Main` is the one centre-column wrapper every shell renders, one at a time, so one `ToastHost` inside it is "one per app".
- Playwright's clipboard permission is already granted in the essay e2e (the existing Copy link specs assert the notice).
- Phase 6: the guard allowlist lists only sites that exist today: `SuccessorModal.svelte` has no `role=alert` (so no entry), and `HoverCard.svelte` has a dynamic `role={role}` (the card's own role, never an alert) with a reason.
- Phase 4 added `e2e/fixtures/essay-catalog.srsj` (essay.srsj plus one record whose type resolves to nothing: a real `SRS038-R13-DANGLING-REFERENCE` catalog error) for the "catalog notice shows in every shell" e2e.
- The fixtures can produce a repeated R23 on a composition; if not, a fixture is added (Phase 4), not a route stub. (Result: none did; `e2e/fixtures/r23.srsj` was added in Phase 1.)
- **Round-3 decision 1 (overrides the plan text above).** The always-rendered error region in `LiveRegions` is `aria-live="assertive" aria-atomic="true"` with NO `role="alert"`: an empty, always-present `role=alert` node would break the zero-alert assertions in `e2e/cloud-storage.spec.ts:623,781`, `e2e/create-document.spec.ts:66` and `e2e/musrs-fixture.spec.ts:38,50`. The polite region stays a plain `aria-live="polite"` div. The LiveRegions unit test and ADR-020 (j) say so. (Wherever this plan says the error region is `role=alert`, read "assertive".)
- **Round-3 decision 2 (overrides).** In the visual toast rows `aria-hidden="true"` is on the TEXT span only, never on a row that contains the focusable close button; screen readers hear the text once, from the live region. Confirmed: no e2e uses `getByRole("status")`.

## Captured samples

Captured 2026-10-05 against the real engine (bindings build.461), `renderDocumentView(..., "html")` (the format Generic uses). `render_composition` with `"json"` emits no R23 (the clamp is for markdown, html and adoc only).

- **Repeated R23 is byte-identical.** `e2e/fixtures/r23.srsj` (added here: a `contains` chain 7 deep rendered by a discovery-query composition, built with the `srs` CLI) yields exactly 10 copies of `[R23] computed heading level 7 exceeds 6 for format 'html'; clamped to 6`. The full muSrs `problem-statements-document` yields 18 diagnostics, the first four that same string. Exact-message grouping therefore collapses them; no code parsing is needed.
- Other real `render` strings (gallery fixture, muSrs): `[section:decisions] container not found: 08bac232-f5b9-46eb-aafe-ac6b237dbc25; rendering section as empty`; `[section:decisions] discovery-query 'governance/decision' matched 0 records`; `[T-2] view 2aba4d85-... theme 4f8a2c1e-... does not target format json; skipping theme`; `[view-dispatch] dispatched view c1ecb5a6-... for type com.mudemocracy.argument/grid-cell does not satisfy view; falling back to baseline`; `[section:essay] error: an arranged container-subset section without containerId needs a supplied container (RFC-043 [R9]); rendering nothing`.
- `find()` string: `warning: type 'nope/nope' names no type (expected namespace/name)`.
- These are the `groupDiagnostics` unit-test fixtures (`tests/notices.test.ts`).

## Decided by owner 2026-10-04

All five took option A; none is open.

1. **Toast position:** bottom-centre of the main column.
2. **Save state:** "Unsaved changes" stays in the Toolbar status; only save results become toasts.
3. **Dismissal:** per session, keyed by document; re-shows if the diagnostics change.
4. **Grouping:** exact message, no code chip. The structured-diagnostics issue is the-greenman/srs-rust#1264 (linked under muDemocracy.org#282); the code chip and id-tolerant grouping wait on it.
5. **Save failure:** a sticky error toast (`role=alert`, stays until dismissed or the next save). Errors tied to a location stay inline.
