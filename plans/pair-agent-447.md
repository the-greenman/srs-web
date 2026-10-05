# Plan: Pair an agent — connector URL + pairing code in the Agents panel (#447)

## Summary

The relay (browser-executor-relay#12, merged at `8db0fd9`) speaks pairing-code OAuth (design: #446). An MCP client needs two things from srs-web: a secret-free **connector URL** and a **pairing code** it asks the user to type. This plan adds **Pair an agent…** to each connected agent's `⋯` menu. It shows both values (each with Copy) and a minute-granular "Expires in about N min". When the 10-minute window rolls, the code refreshes itself. The code is deterministic per window, so there is **no "New code" button** (#447 note). The raw capability URL moves under an **Advanced: direct URL** disclosure with its existing warning. Wording is client-neutral: "paste the URL into any MCP client; it will ask for this code".

Client UI over a relay contract (ADR-001): no SRS semantics, no WASM or srs-rust change, no new dependency. **Ownership (round 2):** a small `PairingLoader.svelte` under the open agent row owns the fetch, the refresh timer and the "new code" announcement; it is keyed by the agent's `callerUrl`, so rotate, disconnect, forget and row removal destroy it (and its `$effect` cleanup clears the timer) with no App state, App effect or App hooks. `McpConnection` stays presentation-only (plain data in, callbacks out); the styleguide feeds it plain data.

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
| [ADR-001](../docs/adr/001-thin-client.md) | Pairing is a relay transport concern; srs-web fetches and displays it. | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | New elements are `data-part`s on existing tokens; the new state is a `/styleguide` specimen. | accepted |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | (j) pairing errors are location-bound: inline `Notice`, not a toast; the "new code" announcement goes through the existing `notify`/`LiveRegions` channel (polite). (k) gets a "Pairing (#447)" addendum: parts `pairing`, `advanced`; specimen group count four -> five (line ~317 says "four groups"). | accepted, amended in Phase 3 |

Decisions made here (no new ADR):

| Ref | Decision |
|---|---|
| D1 | The menu item is enabled iff the agent row has `state.callerUrl` (a channel with credentials exists), whatever the socket status (`online`, `offline`, `rejected`, `replaced`). The relay's pairing route authenticates by executor credential + Origin only (`src/index.ts` returns `403 invalid_credential` / `403 executor_origin_forbidden`; no socket check). Saved-but-closed agents have no `RelayHost` in this tab, so no item (same rule as `Rotate URL`: `a.state` only). |
| D2 | Pairing data is ephemeral: never stored (no localStorage). |
| D3 | One pairing view at a time. `AgentPanel` keeps local `pairingOpen: { id: string; callerUrl: string } \| null`. The loader renders only while the row's current `state.callerUrl === pairingOpen.callerUrl`, so rotate (new URL), disconnect (no URL) and forget/row removal close it with no effect. A reconnect that reuses the same stored channel reopens the view; that is harmless. |
| D4 | `RelayHost.pair()` is the only door to the pairing route. The credential is parsed from the stored `executorUrl` by one helper in `relay-wire.ts`; the channel id comes from `ChannelBootstrap.channel`. |
| D5 | Bare `POST`, no body, no custom headers (a CORS simple request, no preflight; the browser supplies the `Origin` the relay binds). |
| D6 | The executor credential is never logged, shown or included in error text. |
| D7 | One refresh rule inside `PairingLoader`: a single `setTimeout` to `expiresAt - Date.now()`, and a **minimum interval `REFRESH_MIN_MS = 5000` between any two `pair()` calls, success or failure**. An `expiresAt` already in the past (clock skew, or a stale value) cannot cause a request storm. Client clock skew is otherwise harmless: the relay accepts the previous window's code, so an early or late refresh never shows a rejected code. |
| D8 | One `copyText(text): Promise<boolean>` helper replaces every inline `navigator.clipboard.writeText` try/catch. One `CopyField.svelte` (readonly field + Copy button + "Copied" flip) serves all three copy rows (connector URL, pairing code, direct URL). |
| D9 | The countdown is a pure `pairingMinutesLeft(expiresAt, now)` in `agent-panel.ts`, clamped to the window length, because `expiresAt` is wall-clock-window aligned and App's `now` can be up to 15 s stale. |

## Contracts

### WASM API surface

**No** new or changed WASM methods. No srs-rust issue.

### Vendored relay protocol (bump to `8db0fd9`)

`src/lib/mcp/relay-protocol.ts` is the relay's `src/protocol.ts` verbatim after a 3-line header; `scripts/check-relay-protocol.mjs` fetches `raw.githubusercontent.com/the-greenman/browser-executor-relay/${PIN}/src/protocol.ts` and compares everything after line 3 (verified in the script).

1. Resolve the full SHA: `git -C /home/greenman/dev/semanticops/browser-executor-relay rev-parse 8db0fd9`; confirm `git show <sha>:src/protocol.ts` equals the working-tree file.
2. Replace `relay-protocol.ts` with the 3-line header (new SHA on line 1) + that file verbatim.
3. Set `PIN` in the script to the full SHA. `node scripts/check-relay-protocol.mjs` must print `matches relay @ 8db0fd9`.
4. The diff against the old pin must be additive (new: `PairingResponse`, `PAIRING_ROUTE`, `PAIRING_WINDOW_SECONDS`, `PAIRING_CODE_LENGTH`, `pairingPath`, `connectorPath`). If any existing export changed, stop and re-plan.

### TypeScript

`src/lib/clipboard.ts` (new, flat `src/lib` layout like `relative-time.ts`):

```ts
/** Writes text to the clipboard. false when unavailable (no navigator.clipboard) or denied; never throws. */
export async function copyText(text: string): Promise<boolean>;
```

**Call-site count: 4 inline `navigator.clipboard.writeText` sites** (`grep -rn "navigator.clipboard" src`): `McpConnection.svelte:33` (`copy`), `PinnedPane.svelte:24` (keep "no feedback" on false), `EssayShell.svelte:349` (link copy: `if (await copyText(url)) {linkFallback = null; notify(...)} else linkFallback = url`) and `EssayShell.svelte:378` (agent copy: same shape, else `error = "Could not copy to the clipboard."`). Behaviour is unchanged at each site. The McpConnection site is replaced by `CopyField` in Phase 2; PinnedPane and EssayShell migrate in **their own commit** (Phase 1, before the pairing commit) so the unrelated change reviews separately.

`src/lib/mcp/relay-wire.ts`:

```ts
export async function relayErrorCode(res: Response): Promise<string | undefined>; // the body's string `error`, else undefined; never throws
export function executorCredential(executorUrl: string): string | null;
export async function requestPairing(relayUrl: string, creds: ChannelBootstrap, fetchImpl?: typeof fetch): Promise<PairingResponse>;
```

- `relayErrorCode` is extracted from `bootstrapChannel`'s inline `res.json().then(...)` and used by both `bootstrapChannel` and `requestPairing` (existing bootstrap behaviour and tests unchanged).
- `executorCredential`: `new URL(executorUrl).pathname`, split on `/`; the credential is the segment right after `executor`; `null` when the URL does not parse, there is no `executor` segment, or the next segment is empty. Query string and trailing slash are ignored.
- `requestPairing`: `POST ${relayUrl.replace(/\/+$/, "")}${pairingPath(creds.channel, cred)}`. Not ok: `code = await relayErrorCode(res)`, then throw:
  - `403` + `executor_origin_forbidden` -> "Relay refused pairing from this page's origin (executor_origin_forbidden). Open the app from its normal https URL.";
  - `403` + `invalid_credential` -> "This agent's channel is no longer valid; rotate the URL or reconnect.";
  - anything else -> `pairing failed: ${status} (${code})` (code omitted when absent).
- Ok: validate `typeof code === "string" && Number.isFinite(expiresAt) && typeof connectorUrl === "string"`, else throw `pairing failed: malformed response`.

`src/lib/mcp/relay-host.ts`:

```ts
export class StalePairing extends Error {}
async pair(): Promise<PairingResponse>;
```

`pair()`: `const creds = this.#creds; const seq = this.#seq;` throw "No channel yet: connect the agent first." if `!creds` (no `#stored()` fallback: `#creds` is set by `attach` before `callerUrl` is ever shown, and the menu item requires `callerUrl`; `#stored()` stays used by `attach`). `const r = await requestPairing(...)`; **stale guard**: `if (seq !== this.#seq || this.#creds !== creds) throw new StalePairing()`. `#seq` increments on every `#open` (rotate, takeover) and `detach`, and a rotate swaps `#creds`, so a rotate in flight can never return the old channel's code. No state change (`#set` is not called).

`src/lib/components/agent-panel.ts` (pure helpers; the existing file):

```ts
import { PAIRING_WINDOW_SECONDS } from "../mcp/relay-protocol";
/** Whole minutes left, rounded up, clamped to [1, PAIRING_WINDOW_SECONDS/60]; 0 when expiresAt <= now ("Refreshing…"). */
export function pairingMinutesLeft(expiresAt: number, now: number): number;
```

Unit tests (in `tests/agent-panel.test.ts` or the existing helper test file): `expiresAt = now + 9m41s` -> 10; `+ 60 s` -> 1; `+ 1 ms` -> 1; `= now` and `< now` -> 0; `now + 11 min` (stale `now`, window-aligned expiry) -> 10 (clamped, never 11).

### Component contract

New files: `src/lib/components/CopyField.svelte`, `src/lib/components/PairingLoader.svelte`.

`CopyField.svelte` props: `{ value: string; label: string; buttonLabel: string; testid: string }`. Renders a readonly `Input` (`aria-label={label}`, `data-testid={testid}`), and a Copy `IconButton` (`aria-label={buttonLabel}`, `data-testid={`${testid}-copy`}`) that calls `copyText(value)` and flips to "Copied" briefly (the existing McpConnection behaviour moves here). Existing ids are kept for the direct URL row: `testid="mcp-caller-url"` gives `mcp-caller-url-copy`; **Phase 2 renames `mcp-copy` -> `mcp-caller-url-copy` in every reader** (grep first, see Phase 2). Used three times with distinct names:

| Row | `label` | `buttonLabel` | `testid` |
|---|---|---|---|
| Connector URL | "Connector URL" | "Copy connector URL" | `pair-url` |
| Pairing code | "Pairing code" | "Copy pairing code" (copies the hyphenated `XXXXX-XXXXX`, which the relay normalises) | `pair-code` |
| Direct URL | "Direct URL" | "Copy direct URL" | `mcp-caller-url` |

`PairingLoader.svelte` (headless of agent semantics; owns the data path):

```ts
props: {
  pair: () => Promise<PairingResponse>;          // AgentPanel passes () => props.pair(a.conn.id)
  now: number;                                   // AgentPanel's existing `now` (App's 15 s agentNow)
  children: Snippet<[PairingView]>;              // renders the row with this view
}
export interface PairingView { data: PairingResponse | null; error: string | null; minutes: number } // minutes = pairingMinutesLeft(data.expiresAt, now), 0 when data is null
```

Behaviour (plain `setTimeout`/`Date.now`, tested with vitest fake timers; no injected clock or timer): on mount call `pair()` immediately; record `lastCall`; on success store `data`, clear `error`, and (`$effect`) schedule one `setTimeout(run, max(expiresAt - Date.now(), lastCall + REFRESH_MIN_MS - Date.now()))`. If the new `code` differs from a previous non-null code, call `notify({ kind: "info", text: "New pairing code", key: "pair-code" })` (never on first load, never on re-render). On failure: **keep the previous `data` visible** (the relay still accepts the previous window's code) and set `error` to the message beneath it; if there was no previous data the view shows the error alone. Retry timing: next attempt at `lastCall + REFRESH_MIN_MS`; a `StalePairing` rejection sets no error and retries on the same schedule. `retry()` (the Retry button) calls `run()` but is still subject to the `REFRESH_MIN_MS` floor (delay, not a drop). The `$effect` cleanup clears the timer; a sequence counter drops any result that arrives after destroy. `REFRESH_MIN_MS = 5000` is exported from the component's `<script module>`.

`AgentPanel.svelte` new props (the `now` prop already exists):

```ts
pair: (id: string) => Promise<PairingResponse>;   // App: (id) => hosts.get(id)!.host.pair()
```

`agentActions`: when `a.state?.callerUrl`, add first `{ id: 'pair', label: 'Pair an agent…', enabled: true, run: () => (pairingOpen = { id: a.conn.id, callerUrl: a.state.callerUrl }) }`; `itemTestid` maps `pair -> 'agent-pair'`. For the row where `pairingOpen` matches (D3), the row's `McpConnection` is rendered inside `<PairingLoader pair={() => pair(a.conn.id)} {now}>{#snippet children(view)}…{/snippet}</PairingLoader>`; other rows render it with `pairingView={null}`. A local `row(view)` snippet avoids duplicating the markup. `onClosePair` for `McpConnection` is `() => (pairingOpen = null)`.

`McpConnection.svelte` (presentation only: no timers, no promises, no `notify`): new props `pairingView?: PairingView | null`, `onClosePair?: () => void`, `onRetryPair?: () => void`. `PairingView` is exported from `agent-panel.ts` (type only), so the styleguide builds it from plain data.

Rendered (`data-part="pairing"`, above Advanced):

1. Help line (`pair-help`): "Paste the connector URL into any MCP client. It will ask for this code."
2. `CopyField` Connector URL (`pair-url`), then `CopyField` Pairing code (`pair-code`, mono).
3. Expiry (`pair-countdown`): **plain text** (no `role="timer"`, no `aria-live`), "Expires in about N min", or "Refreshing…" when `minutes === 0`. No separate live region: the new-code announcement is the loader's `notify` toast, heard through `LiveRegions`.
4. Security line (`pair-security`): "Anyone with this code can connect to this document until it refreshes. Changes stay unsaved until you Save or Export."
5. "Done" ghost button (`pair-close`).
6. Error (`pair-error`): `Notice kind="error"` (below the code when previous data is kept) + Retry (`pair-retry`, fires `onRetryPair`).
7. While `data` is null and no error: "Getting a pairing code…" (`pair-loading`).

**Focus:** on open (loader mount) focus moves to the `pair-code` input (or Done if the code is loading); when the view closes (Done, or rotate/disconnect via D3) focus returns to that agent's `⋯` `agent-menu` trigger if the row still exists (AgentPanel: `root.querySelector` scoped to the row, same `tick().then` pattern as `startRename`; a small `$effect` on "pairing view was shown, now is not").

**Advanced placement (exact):** inside `McpConnection`, after the pairing block (and after the error/rejected notes; the takeover actions area ordering stays as today), the caller-URL block (`CopyField` `mcp-caller-url` and the warning "Anyone with this URL can read and write this document while this tab is connected. MCP changes are unsaved until you Save or Export.", verbatim) is wrapped in `<Disclosure label="Advanced: direct URL" testid="mcp-advanced-open">`, closed by default. It renders whenever `callerUrl` is set (with or without pairing shown). Disclosure is reused unchanged.

`App.svelte`: only `pair={(id) => hosts.get(id)!.host.pair()}` on the shared `agentLibrary` snippet (both `AgentPanel` placements share it; one edit). No pairing `$state`, no `$effect`, no disconnect/forget hooks. `hosts.get(id)` is defined whenever the menu item exists (`a.state` is only set for rows with a host); if absent, `pair` rejects with "No channel yet: connect the agent first." so the loader shows an error rather than throwing.

Styles: `src/styles/components/mcp-connection.css` only (`.mcp-conn__code` mono, `.mcp-conn__expiry` muted); existing tokens, no new ones.

---

## Scope

- Protocol bump + pin; `copyText` and its call-site migration; `relayErrorCode`, `executorCredential`, `requestPairing`, `RelayHost.pair`; `pairingMinutesLeft`.
- `CopyField`, `PairingLoader`; `AgentPanel` menu item + `pair` prop; `McpConnection` pairing view + Advanced; App wiring (one prop).
- Styleguide, unit + e2e tests, docs.

**Out of scope:** real MCP client verification (semanticops-relay#1), relay deploy (semanticops-relay#2), a "New code" button, storing pairing data, revocation UI beyond Rotate, pairing for saved-but-closed agents, relay changes, feature detection for older relays.

---

## Phases

### Phase 1: Protocol, `copyText`, `RelayHost.pair()` (no UI)

**Goal:** the data path exists and is tested; the UI is unchanged except that PinnedPane and EssayShell use `copyText`.

**Agent:** Web App Worker

#### Tasks

- [x] Bump `relay-protocol.ts` and `PIN`; run `node scripts/check-relay-protocol.mjs`.
- [x] `src/lib/mcp/relay-wire.ts` (`relayErrorCode` extracted from `bootstrapChannel`, `executorCredential`, `requestPairing`), `relay-host.ts` (`pair`, `StalePairing`), `pairingMinutesLeft` in `agent-panel.ts`.
- [x] Tests: `tests/relay-pairing.test.ts`, extend `tests/relay-host.test.ts`, `pairingMinutesLeft` unit tests.
- [x] **Separate commit first:** `src/lib/clipboard.ts` + migrate PinnedPane and EssayShell (2 sites) + `tests/clipboard.test.ts`. (McpConnection's site is replaced by `CopyField` in Phase 2.)

#### Acceptance Criteria

- [x] `executorCredential("wss://relay.test/v1/channels/c1/executor/EXEC1?generation=x")` is `"EXEC1"`; also `"EXEC1"` with a trailing slash and with a query only; `null` for no `/executor/` segment, an empty segment (`.../executor/` and `.../executor//x`), and an unparsable string.
- [x] `requestPairing` sends exactly one `POST https://relay.test/v1/channels/c1/pairing/EXEC1` (assert URL and method; no body; no headers), including with a trailing slash on `relayUrl`.
- [x] Error mapping (unit): 403 `executor_origin_forbidden` -> origin message; 403 `invalid_credential` -> "no longer valid; rotate the URL or reconnect."; 500 `{error:"x"}` -> `pairing failed: 500 (x)`; 502 with a non-JSON body -> `pairing failed: 502`; malformed 200 -> `pairing failed: malformed response`. No message contains `EXEC1`. Existing `bootstrapChannel` tests still pass through `relayErrorCode`.
- [x] `RelayHost.pair()` uses the attached channel's creds; rejects before any channel exists; **stale guard**: start `pair()` against a fetch that resolves later, call `rotate()` (new creds) before it resolves, and the promise rejects with `StalePairing` (never resolves with the old channel's code); same for `detach()` and for a takeover re-open. A `pair()` after the rotate settles uses the new credential.
- [x] `pairingMinutesLeft`: cases listed under Contracts, including the clamp (`+11 min` -> 10) and `<= now` -> 0.
- [x] `copyText` returns true on success, false when the write rejects, and false (no throw) when `navigator.clipboard` is undefined; EssayShell/PinnedPane behaviour unchanged (existing tests pass).
- [x] `check-relay-protocol.mjs` passes; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.

#### Testing

```bash
node scripts/check-relay-protocol.mjs
npm run typecheck && npm run lint && npm test && npm run build
```

#### Milestone gate

1. Acceptance criteria met. 2. Gates pass. 3. Tick checkboxes. 4. Two commits: first `Add copyText and migrate PinnedPane and EssayShell (#447)`, then `Vendor relay protocol 8db0fd9; RelayHost.pair (#447)`.

Do not start the next phase until the gate passes.

---

### Phase 2: Panel UI, Advanced disclosure, styleguide

**Goal:** the Pair item works in the app and the specimen shows it.

**Agent:** Web App Worker

#### Tasks

- [x] **Re-grep first:** `grep -rn "mcp-copy\|mcp-caller-url" src tests e2e` and list every reader; the rename `mcp-copy` -> `mcp-caller-url-copy` and the Advanced move touch all of them.
- [x] `CopyField.svelte`; `PairingLoader.svelte` (+ `tests/PairingLoader.test.ts`, fake timers).
- [x] `McpConnection.svelte`: pairing view, `CopyField` for the three rows (the inline clipboard code goes), caller-URL under `Disclosure "Advanced: direct URL"`, updated header comment; CSS.
- [x] `AgentPanel.svelte`: `pair` prop, `pairingOpen`, menu item, `PairingLoader` wrap, focus handling. **`<AgentPanel` call sites (3):** `App.svelte:936` (the shared `agentLibrary` snippet), `Styleguide.svelte:125` (the "Agents" Panel) and `Styleguide.svelte:417` (the group loop); plus the `base` props in `tests/AgentPanel.test.ts`.
- [x] `App.svelte`: the single `pair` prop.
- [x] Styleguide: add group `pairing` to `agentGroups` in `src/styleguide/fixtures.ts` with shape `agentGroups.pairing = { agents, relays, pairing: { data: PairingResponse, error: string | null } }` (one online agent with `callerUrl`, relay `relays[0]`, `data: { code: "K7QPM-2XD4R", connectorUrl: "https://relay.example.com/v1/channels/ch1/call", expiresAt: NOW + 9 * 60_000 + 41_000 }`). `Styleguide.svelte` renders this group's frame with the presentational `McpConnection` directly, fed by `fx.pairing` as a `PairingView` and `now={fx.NOW}`; no `AgentPanel`, no loader, no timer, so `sg-agent-pairing` / `pair-code` are synchronous. Title in `agentGroupTitles`: "Pairing shown: connector URL, code, expiry". Rendered at 20/18/16rem.
- [x] `e2e/styleguide.spec.ts` (line ~328): add `"pairing"` to the group list (`["none","empty","several","errors","pairing"]`) and assert `sg-agent-pairing` contains a visible `pair-code`; the existing no-overflow loop at ~335 then covers it.
- [x] Update readers found by the re-grep to open Advanced first and use the new ids: `tests/McpConnection.test.ts`, `e2e/agent-channels.spec.ts:77` (count 2: open Advanced on both rows) and `:208`, `e2e/agent-library.spec.ts:74`, `e2e/mcp-relay.spec.ts:77`.
- [x] Unit tests below.

#### Acceptance Criteria

- [x] `tests/PairingLoader.test.ts` (fake timers): mount calls `pair` once; refreshes once at `expiresAt` with one timer; with `expiresAt` already in the past it makes at most one call per `REFRESH_MIN_MS` (advance 12 s: 3 calls max, not a storm); a failing `pair` retries no faster than `REFRESH_MIN_MS`, exposes `error` and **keeps the previous `data`**; `StalePairing` shows no error; destroy (unmount) clears the timer and drops an in-flight result; `notify` is called with "New pairing code" only when the code changes from a previous non-null code (not on first load, not on an unchanged refresh).
- [x] `tests/McpConnection.test.ts`: with `pairingView` data, the URL and code inputs have the aria-labels "Connector URL" / "Pairing code" and the right values; Copy buttons are named "Copy connector URL" / "Copy pairing code" / "Copy direct URL" and call `copyText` (mocked) with the URL, the hyphenated code and the direct URL; `pair-countdown` is plain text with no `aria-live`, `role="timer"`, or `pair-live`; `pair-security` text present; `pair-error` renders a `role="alert"` (and with previous data the code is still visible) and `pair-retry` fires `onRetryPair`; Done fires `onClosePair`; the direct URL and warning are absent until `mcp-advanced-open` is clicked (`aria-expanded` toggles); McpConnection source contains no `setInterval`/`setTimeout`/`notify`.
- [x] `tests/AgentPanel.test.ts`: `agent-pair` in the menu for an agent with `state.callerUrl`, absent for `state: null` and for `callerUrl: null`; choosing it mounts the loader (mock `pair`) and shows `pair-code`; "Expires in about 10 min" at `now` = `expiresAt - 9m41s`, "about 1 min" in the last minute, "Refreshing…" when past; opening on another agent closes the first; a `callerUrl` change on the open row (rerender) removes the view and the loader's timer; `state: null` (disconnect) removes it; Done removes it.
- [x] Focus: opening moves focus to `pair-code`; Done, rotate and disconnect return focus to that row's `agent-menu` trigger when it still exists.
- [x] No `Claude` (or other client name) in new strings.
- [x] Styleguide e2e: all five groups render three frames each at 1280 and 390 px without overflow or headings.
- [x] `grep -rn "navigator.clipboard" src` matches only `src/lib/clipboard.ts`.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/styleguide.spec.ts
```

#### Milestone gate

1. Criteria met. 2. Gates pass. 3. Tick checkboxes. 4. Commit (`Pair an agent: connector URL, code and expiry (#447)`).

---

### Phase 3: End-to-end and docs

**Goal:** the flow is covered end to end and documented.

**Agent:** Web App Worker, then Verification

#### Tasks

- [x] `e2e/helpers.ts` `routeRelayChannels`: add `pairing?: { ttlMs?: number; status?: number }` to the options. When set, also route `https://${host}/v1/channels/*/pairing/*`: method `POST`; channel read from the URL. **Code format (exact):** per-route call counter `n` starting at 1, the code is the literal "TEST", then n, then "-ABCDE" (tests never exceed 9 calls, so `n` is one digit and the code always matches `/^[0-9A-Z]{5}-[0-9A-Z]{5}$/`: `TEST1-ABCDE`, `TEST2-ABCDE`); `expiresAt = Date.now() + (ttlMs ?? 600_000)`, `connectorUrl = https://${host}/v1/channels/${ch}/call`. `status` set (e.g. 403) returns that status with `{ error: "executor_origin_forbidden" }`; a mutable `pairing.status` on the returned handle lets a test switch back to success for Retry. Requests are recorded.
- [x] **Return-type impact:** `routeRelayChannels` currently returns `Promise<void>` and is called from `e2e/helpers.ts` (`connectAgents`) and the specs (`agent-library`, `agent-channels`, `mcp-relay`) as `await routeRelayChannels(page, …)` with the result ignored. It changes to `Promise<{ pairingRequests: string[]; pairing: { status?: number } }>`; no existing call site reads the value, so none changes. `pairing` is optional and off by default, so existing specs add no route.
- [x] `e2e/agent-library.spec.ts` (reuse `load`, `addRelay`, `stubExecutors`; `context.grantPermissions(["clipboard-read","clipboard-write"])`):
  1. Pair: add relay, connect agent, `agent-menu` -> `agent-pair`; `pair-code` = `TEST1-ABCDE`; `pair-url` ends `/v1/channels/c1/call` and contains no `CALLER`/`EXEC`; exactly one request to `/v1/channels/c1/pairing/EXEC1`; countdown matches `/about (9|10) min/` (the displayed value depends on `Date.now()` and the 15 s tick; never assert exactly 10).
  2. Copy: both Copy buttons; read clipboard back.
  3. Auto-refresh: `ttlMs: 7000`; `pair-code` becomes `TEST2-ABCDE` without a click and the polite live region (`live-polite`) says "New pairing code"; no "New code" button (`getByRole("button", { name: /new code/i })` count 0).
  4. Advanced: direct URL hidden by default; `mcp-advanced-open` reveals `/call/CALLER1` and the warning.
  5. Failure: status 403 -> `pair-error` with the origin message; switch to success; `pair-retry` shows the code.
  6. Rotate while pairing is shown closes the view (no `pair-code`) and focus is on the row's `agent-menu`.
- [x] Docs: `README.md` "Agents and relays" (new bullet: Pair an agent… shows a connector URL and a 10-character code that refreshes every 10 minutes; paste the URL into any MCP client that supports the standard MCP sign-in; **the direct (capability) URL is deliberately hidden under "Advanced: direct URL"**; client verification is tracked in semanticops-relay#1). `src/lib/components/README.md`: `AgentPanel` row (+`pair`), `McpConnection` row (`pairingView?` `onClosePair?` `onRetryPair?`, Advanced), new `CopyField` and `PairingLoader` rows. ADR-020 (k): "Pairing (#447)" bullet (parts, inline error, notify-based announcement, no new tokens) and the specimen line "four groups" -> "five groups (… connection errors, pairing shown)".
- [x] Tick plan checkboxes; add "Deviations (as built)" if anything changed.

#### Acceptance Criteria

- [x] All six e2e cases pass; `agent-channels`, `agent-library`, `mcp-relay` otherwise unchanged in behaviour.
- [x] Docs updated as listed.
- [x] All gates and `npx playwright test e2e/agent-library.spec.ts e2e/agent-channels.spec.ts e2e/mcp-relay.spec.ts e2e/styleguide.spec.ts` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/agent-library.spec.ts e2e/agent-channels.spec.ts e2e/mcp-relay.spec.ts e2e/styleguide.spec.ts
```

#### Milestone gate

1. Criteria met. 2. All gates and targeted Playwright pass. 3. Tick checkboxes. 4. Commit (`Pairing e2e and docs (#447)`); push the branch only (review before opening a PR).

---

## Final Acceptance

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass
- [ ] `node scripts/check-relay-protocol.mjs` passes at the `8db0fd9` pin
- [ ] Targeted Playwright (agent-library, agent-channels, mcp-relay, styleguide) passes
- [ ] No inline `navigator.clipboard` remains outside `src/lib/clipboard.ts` (`grep -rn "navigator.clipboard" src`)
- [ ] No client-specific wording in the pairing UI or docs
- [ ] WASM is untouched (no `srs_bindings` change); the app still loads `gallery.srsj`

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only (this worktree); never edits `browser-executor-relay`.
- No SRS semantics in TypeScript (ADR-001): this plan has none.
- The vendored `relay-protocol.ts` is never hand-edited beyond the pin bump.
- Lead Integrator freezes the `AgentPanel` `pair` prop, the `PairingView` type, and the `CopyField`/`PairingLoader` props before McpConnection and the styleguide consume them.
- Verification Agent runs after each phase and before sign-off. Commits follow the project signing rule; no `--no-verify`.

## Assumptions

- The relay deployed for manual checks implements `8db0fd9`; until semanticops-relay#2 lands, only the mocked e2e exercises the route.
- The browser sends `Origin: <srs-web origin>` on the POST automatically, and that origin is the one bound into the executor credential.
- App's 15 s `agentNow` tick is fine for minute-granular text; `pairingMinutesLeft` clamps so a stale tick can only understate, never overstate past 10.
- `expiresAt` is the relay's conservative deadline, aligned to wall-clock windows; client clock skew is harmless (the relay accepts the previous window's code) and refresh is bounded by D7.
- `notify` toasts reach screen readers through the existing always-rendered `LiveRegions` (`live-polite`), so no new live region is added.
- E2E specs never request more than nine pairing codes per route.

## Round-2 amendments (architecture review, all accepted)

- App passes `pair={async (id) => { const e = hosts.get(id); if (!e) throw new Error("No channel yet: connect the agent first."); return e.host.pair(); }}` (never throws synchronously; no non-null cast).
- Closing the pairing view is permanent: clear `pairingOpen` when the view goes from shown to not shown (in the focus-return `$effect`), so a reconnect on the same channel does not silently reopen it.
- `PairingLoader` focuses `pair-code` in `tick().then(...)` (like `startRename`) so it does not race `ActionMenu` returning focus to its trigger; covered by the focus acceptance test.
- The loader's refresh-scheduling `$effect` reads only its `data` state, never the `now` prop; one loader test asserts that advancing `now` does not call `pair()` again.
- The "New pairing code" `notify` is also a visible toast for 4 s; accepted (existing channel, no `silent` option) and noted in the ADR-020 (k) bullet.

## Deviations (as built)

- Vendored protocol bump: `DEFAULT_LIMITS.maxBodyBytes` changed 128 KiB -> 700 KiB upstream (value only, no export added/removed/reshaped; srs-web does not use it), besides the additive pairing exports.
- `PairingLoader`'s `children` snippet receives `(view, retry)`; `PairingView` is `{data, error, minutes}` as planned, and `retry` is passed alongside so AgentPanel can wire `onRetryPair` without a new prop.
- Loader schedules via a `settled` counter (re-arms after every settled call) and skips scheduling while the first call is in flight; initial focus uses `document.querySelector` on `pair-code` / `pair-close` (the loader is headless).
- `AgentPanel` tags each row `data-agent-id` to find the row's `agent-menu` for focus return; the row markup shares a local `conn` snippet.
- `Styleguide.svelte` renders the `pairing` group with `McpConnection` directly (no `AgentPanel`), as planned; `AgentPanel` call sites there also pass a `pair` stub.
- e2e: `openAdvanced(page)` helper added to `e2e/helpers.ts` for readers of the direct URL.

