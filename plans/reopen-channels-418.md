# Plan: Agent channels survive a reload (#418)

## Summary

Two dogfooding failures (muDemocracy.org#270). (1) After a reload, saved channels stay in the library but are not reopened: `openChannel` runs only from the Connect click (`App.svelte:428`, `onConnect` `:1001`), so every client sees `executor_offline` until the writer reconnects. (2) After reconnecting, a client that initialized before the reload gets `MCP session is not initialized` on every call until it re-initializes. This plan (a) persists a per-agent "was open" flag and reopens those agents on load, reusing the stored channel so paired clients keep working, and (b) **transparently replays the client's own last successful `initialize` (and `notifications/initialized`) into the fresh session** when a request arrives on an uninitialized session, so the client never notices the reload. Only when nothing is stored does the call fail, with HTTP 404 plus the engine's error body (the MCP Streamable HTTP status for "unknown session, start a new one"). Client bookkeeping plus transport framing over existing engine surface (ADR-001): no SRS semantics, no new dependency, **no srs-rust change is required** (`McpSession.is_initialized()` is already bound).

## Findings: where session state lives (file:line evidence)

- **State is one boolean in srs-rust**: `Dispatcher.initialized` (`srs-rust/crates/srs-mcp-core/src/lib.rs:714`), set only by a successful `initialize` (`:806`). Every non-`initialize` request while false returns JSON-RPC `-32602 "MCP session is not initialized"` (`:817-820`); a repeat `initialize` re-runs initialization ("the relay shares one session across clients", `:803`). It is exposed to JS as `McpSession.is_initialized()` (`src/lib/srs_bindings/srs_bindings.d.ts`, typed at `src/lib/srs-client.ts:33`).
- **One McpSession per agent connection per loaded repository**: `openAgentSession` calls `current.open_mcp_session()` (`App.svelte:417`) on every attach and repo change (`:456-461`), after freeing the old one (`:416`). A reload therefore always starts uninitialized; so does a repo switch.
- **There is no `mcp-session-id` anywhere.** The srs-web executor ignores request headers (`relay-executor.ts:111-113` passes only the body to `session.handle`) and answers with only `content-type` (`:114-120`), never issuing an id. The relay could not carry one anyway: its request allow-list is `accept, content-language, content-encoding` and its response allow-list omits `mcp-session-id` (`browser-executor-relay/src/safe-headers.ts:6-15`). Today's "session" is the channel-level boolean above, shared by all clients of the channel.
- **srs-web can return 404 itself.** The executor builds the status (`relay-executor.ts:111-125`) and the relay passes any 200-599 status through (`browser-executor-relay/src/index.ts:284-297`). `is_initialized()` is already available, so no srs-rust change.
- **Consequence:** with no id issued, a bare 404 may not make every client re-initialize (unverified, semanticops-relay#1), which is why replay is primary and 404 is only the fallback.

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
| [ADR-001](../docs/adr/001-thin-client.md) | Reopen is client configuration; replay is transport bookkeeping (store/re-feed the client's own opaque request bodies, per connection); the only parsing is one `JSON.parse` per body in a single helper `rpcInfo` (`agent-activity.ts`) that reads the JSON-RPC `method`, `params.clientInfo.name` and whether an `error` member is present, replacing today's `text.includes('"initialize"')` substring test (`agent-activity.ts:52`), which also matches tool arguments. No result is interpreted, no tool, record or schema knowledge, no invented identity. | accepted |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) (j) | A reload that cannot reopen a channel because another tab holds it is location-bound: the existing `inUseElsewhere` row state, no toast. A reopen that fails (relay error) shows the row's existing error state. | accepted |
| ADR-020 (k) | Addendum "Reopen (#418)": a short paragraph at the end of section (k) (heading at `020-icon-set-and-component-token-api.md:290`, after the "Pairing (#447)" addendum) and the amended-by list in the header (line 9). It says: saved-open agents reopen on load on the same repository, reusing the same channel and credentials; the stored initialize holds only client metadata. No new part or token, so no styleguide specimen change. | amended in Phase 3 |

Decisions made here (no new ADR):

| Ref | Decision |
|---|---|
| D1 | `AgentConnection` gains optional `reopen?: string`: **the repositoryId the agent was connected on** (existing list `srs-web.agent-connections`; absent = never reopen, so old lists load unchanged with no migration). Reopen happens only when the opened repository's id equals it, so an agent connected on document A never serves document B after a reload (consent). The id comes from the existing `repositoryId(repo)` in `src/lib/srs-client.ts:779` (a full `exportSrsj` per call, marked `ponytail: ... srs-rust#1250`). It is called **once per repo load** (memoised in the reopen effect, plus once per `openChannel`), and swaps to the core accessor when srs-rust#1250 lands. This plan does not depend on that issue. |
| D2 | Set in `openChannel` after the lock is acquired (`setReopen(id, repositoryId(repo))`); refreshed for open agents when the repo changes (the existing repo-change effect); cleared in `disconnectAgent` (user Disconnect, and Forget via it). **Not** cleared on reload/unload, relay drop, `replaced` or `rejected` (transient; the writer did not choose them). |
| D3 | **Reopen runs once per page load** from a new `$effect`, when the first repository is non-null, for library entries whose `reopen` equals that repository's id, in library order. It calls `openChannel`, so the relay-bound check, the Web Lock and `hostFor`/`openAgentSession` are unchanged, and it reuses the stored channel (`RelayHost.#open(false, false)` takes `#stored()`, `relay-host.ts:96-99`; it only bootstraps when none exists), so connector URL and pairing tokens keep working. The selection and retry logic is a pure function in `src/lib/reopen.ts` (`reopenSaved`, below) as a unit-test seam. Nothing reopens with no repository. **No double open:** the repo-change effect (`App.svelte:456-461`) iterates `agents` and tracks only `repo`; at the first load `agents` is empty (reopen has not run) so it is a no-op, and for a later repo change `openAgentSession` calls `h.detach()` first and is idempotent. Reopen also never runs for an id already in `agents` (D5). |
| D4 | **Write guard first.** The shell declares the guard in effects of the same flush that makes `repo` non-null (`EssayShell.svelte:159` -> `onAgentWriteGuard`, App `agentGuard`/`agentGuardRepo`/`applyGuards`, `App.svelte:376-378,968-973`). The reopen effect therefore does `await tick()` after seeing `repo` (and bails if `repo` changed meanwhile) before calling `reopenSaved`. Justification: `tick()` resolves after that flush, so a shell that declares a guard has done so; a shell that declares none (generic explorer, packages) has nothing to wait for, so one mechanism is correct for both. The reopen itself then takes at least a lock request, a socket connect and a client request, and `applyGuards()` also re-applies to already-attached sessions on a late declaration. Verified by e2e (a guarded essay write is refused after reopen). |
| D5 | **`openChannel` concurrency.** A module-level `const opening = new Set<string>()` in `App.svelte`: `if (agents.some(..) \|\| opening.has(id)) return true; opening.add(id); try { ... } finally { opening.delete(id) }`, so a Connect click during an in-flight reopen (the existing check runs before an `await`) cannot add a duplicate row or a second session. `openChannel` now returns `Promise<boolean>`: `false` only when the lock is held elsewhere. |
| D6 | **Stuck after reload.** (a) Lock held by the dead page: `reopenSaved` retries `open(c)` **once** after ~1000 ms when it returned `false` (skipped if the repo changed or the agent appeared meanwhile). (b) Relay still holds the dead page's socket, so the agent reports `rejected`: this tab holds the Web Lock, so exactly **one** automatic takeover. App keeps `const autoTakeover = new Set<string>()`, filled by `reopenSaved`'s open callback for reopened ids; in `setAgentState`, when a status arrives as `rejected` and the id is in the set, remove it and `void hosts.get(id)?.host.takeover()`; remove it from the set on `online` too. Manual Connect never takes over. Without `navigator.locks` (degraded to "free", `agent-connections.ts`) this could displace a live other tab; accepted, since that browser already has no cross-tab protection and the relay replaces, never corrupts. |
| D7 | **Replay (primary stale-session fix).** Per agent the host stores the client's last successful `initialize` body and a flag that `notifications/initialized` followed, in localStorage `srs-web.mcp-init.<agentId>` (best-effort; **an empty body is never stored**). Done in `observeSession` (`agent-activity.ts`), using `rpcInfo` for the request and for the reply. (1) `initialize` whose reply has no `error` member and leaves `session.is_initialized()` true: store the body, flag false. (2) `notifications/initialized`: set the flag if an init is stored. (3) any request or notification other than `initialize` while `!session.is_initialized()` and an init is stored: first `session.handle(storedInit)` and, if flagged, `session.handle('{"jsonrpc":"2.0","method":"notifications/initialized"}')`, discard both replies, drain `take_write_summary()` for each replayed call without calling `onWrite`, then handle the real message and return its reply normally. This also covers the order initialize -> reload -> `notifications/initialized` -> `tools/list` (the notification triggers the replay; the later call is already initialized). **A failed replay** (the replayed initialize errors): clear the stored body, and the real message is then handled on the still-uninitialized session, so the client gets the engine's own `not initialized` error with HTTP 404 (D8). **Last initializer wins:** the relay shares one session across clients (`srs-mcp-core/src/lib.rs:803`), so a second client's successful `initialize` replaces the stored body, and after a reload every client of the channel is served under that last client's initialize (its `clientInfo` becomes the actor name, exactly as it does before the reload). **Replay never calls `onClientName`**, so the panel's `clientNames` entry is not overwritten or flipped by a replay (the engine actor name is unaffected); after a reload it reads label, else the generic fallback, until a client next initializes. |
| D8 | **Fallback 404, only for non-initialize requests.** `FrameHandler` gains optional `sessionUnknown?(): boolean`, answered by the `observeSession` wrapper: true iff the last handled message had a reply (not a notification), its method was not `initialize`, and `!session.is_initialized()` afterwards. `RelayExecutor.#process` answers `404 application/json` with the engine's JSON-RPC body unchanged when `sessionUnknown?.()` is true, else 200 as today (notifications still 202). A failed or malformed `initialize` therefore keeps its JSON-RPC error with HTTP 200. The executor still has no MCP knowledge. The client re-initializes, which stores a new body (D7). Rejected: auto-initializing from a non-initialize call with an invented client. |
| D9 | **Clearing.** The stored init is removed by `connections.remove(id)` (Forget) and by App's rotate handler (`App.svelte:1005`), which also deletes `clientNames[id]` (a new channel means new clients). Disconnect and takeover keep it. On load, `sweepInits()` removes `srs-web.mcp-init.*` keys whose agent id is not in the list (orphans from a crash between steps). It is never shown, logged or exported, and holds only the client's protocol version, capabilities and clientInfo. |

## Contracts

### WASM API surface

**No** new or changed WASM methods. `McpSession.is_initialized()` is already bound (`src/lib/srs-client.ts:33`); `observeSession`'s `ObservedSession` type gains `is_initialized(): boolean`, which the real `McpSession` that App passes already provides. No srs-rust issue is a dependency and **no follow-up issue is filed**: the `Mcp-Session-Id` through the relay path is dropped unless replay proves insufficient in real-client testing (semanticops-relay#1).

### TypeScript

`src/lib/agent-connections.ts`: `AgentConnection.reopen?: string`; `setReopen(id: string, repositoryId: string | null): AgentConnection[]` (`null` drops the key; via `patch`, best-effort `save`). `initKey = (id) => "srs-web.mcp-init." + id`; `saveInit(id, {body, initialized})` (no-op for an empty body), `loadInit(id)`, `clearInit(id)` (try/catch); `remove(id)` also clears it; `sweepInits(liveIds)` using `Storage.length/key()` where available.

`src/lib/reopen.ts` (new, pure):
```ts
export async function reopenSaved(
  library: AgentConnection[], repoId: string,
  open: (c: AgentConnection) => Promise<boolean>,      // false = lock held elsewhere
  o?: { retryMs?: number; stillValid?: () => boolean } // default 1000; false aborts the retry
): Promise<void>;
```
For each entry with `reopen === repoId`: `if (!(await open(c)) && o.stillValid?.() !== false) setTimeout(() => void open(c), retryMs)` (one retry only).

`src/lib/agent-activity.ts`:
```ts
export function rpcInfo(text: string): { method?: string; clientName?: string; isError: boolean } // one JSON.parse, never throws
export function observeSession(session: ObservedSession, agentId: string, o: {
  onWrite(w: AgentWrite): void; onClientName?(n: string): void;
  relationTarget?(relationId: string): string | undefined; initStore?: InitStore }): FrameHandler
```
(positional parameters become an options object; the one call site is `App.svelte:419`.) `InitStore = { load(): Init | null; save(i: Init): void; clear(): void }`, `Init = { body: string; initialized: boolean }`.

`src/lib/mcp/relay-executor.ts`:
```ts
export interface FrameHandler { handle(text: string): string | undefined; sessionUnknown?(): boolean }
```
`#process`: `out === undefined` -> 202 (unchanged); else `status = this.o.session.sessionUnknown?.() ? 404 : 200`.

`src/App.svelte`: `opening` and `autoTakeover` sets (D5, D6); `openChannel` returns `Promise<boolean>` and calls `setReopen`; `disconnectAgent` calls `setReopen(id, null)` before `hosts.delete`; the repo-change effect refreshes `reopen` for open agents; the reopen `$effect`:
```ts
let reopened = false;
$effect(() => {
  const r = repo;
  if (!r || reopened) return;
  reopened = true;
  void tick().then(() => {
    if (repo !== r) return;
    const id = repositoryId(r);
    void reopenSaved(library, id, (c) => { autoTakeover.add(c.id); return openChannel(c); }, { stillValid: () => repo === r });
  });
});
```
(`autoTakeover` is cleared for an id when `openChannel` returns false.) `rotate` handler: `clearInit(id)`, delete `clientNames[id]`, then `host.rotate()`.

---

## Scope

- `reopen` repo-id flag, `reopen.ts`, reopen effect with guard ordering (D4), lock retry and one takeover (D6), `opening` guard (D5).
- Stored-initialize replay with `rpcInfo` and options-object `observeSession` (D7), the `sessionUnknown` 404 fallback (D8), clearing and sweep (D9).
- Unit and e2e tests; README agents section; ADR-020 (k) addendum.

**Out of scope:** the `Mcp-Session-Id` header path through the relay (only if replay proves insufficient; no issue filed), an srs-rust error kind, reopening after a mid-session socket drop (the executor already reconnects), reopening a channel another tab holds beyond the one retry, pairing changes, changing the lock mechanism.

---

## Phases

### Phase 1: Persisted flag and reopen on load

**Goal:** a reload with a previously connected agent and the same repository open reopens that agent's stored channel with no click, after the write guard, without duplicates.

**Agent:** Web App Worker

#### Tasks

- [ ] `agent-connections.ts`: `reopen?: string`, `setReopen`, `sweepInits` stub call site (the sweep itself lands in Phase 2 with the init helpers).
- [ ] `src/lib/reopen.ts` and `App.svelte`: `opening` guard, `openChannel` returns boolean + `setReopen`, `disconnectAgent` clears, repo-change effect refreshes the flag, `tick()`-gated one-shot reopen effect, `autoTakeover` in `setAgentState` (D1-D6).
- [ ] Unit tests:
  - `tests/agent-connections.test.ts`: `setReopen` sets (a repo id) and clears (key absent), survives a store reload, leaves other entries untouched, a throwing storage does not throw, an old list (and a legacy `reopen: true`) loads as never-reopen.
  - `tests/reopen.test.ts` (fake timers): reopens only entries whose `reopen` equals `repoId`, in order; an entry with a different id or none is skipped; an entry whose relay is missing is skipped (the `open` callback is where that check lives, so assert `open` is called and its `true` result ends it); `open` returning false retries exactly once after 1000 ms and not again; `stillValid() === false` cancels the retry; running `reopenSaved` is the caller's once-per-load responsibility, asserted by the App effect's `reopened` guard in e2e.

#### Acceptance Criteria

- [ ] Connect, reload, open the same repo: the agent shows Connected without a click, same `callerUrl`/channel (no second `POST /v1/channels`).
- [ ] Open a different repository after the reload: the agent is not reopened.
- [ ] An agent disconnected before reload is not reopened; a forgotten agent is gone.
- [ ] A Connect click while a reopen is in flight yields one row and one executor socket.
- [ ] Before a repo is open, nothing connects. A later repo change does not open a second session for an open agent.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test
```

#### Milestone gate

1. Acceptance criteria above met.
2. `npm run typecheck` and `npm run build` pass.
3. Tick the checkboxes in this file.
4. Commit referencing `(#418)`.

### Phase 2: Replay the client's initialize; 404 fallback

**Goal:** after a reload a client's next call succeeds with no re-initialize; with nothing stored a non-initialize call gets HTTP 404 with the engine's JSON-RPC body and a fresh `initialize` works.

**Agent:** Web App Worker

#### Tasks

- [ ] `agent-connections.ts`: `initKey`, `saveInit/loadInit/clearInit`, `sweepInits`; `remove` clears; App calls `sweepInits` once at start.
- [ ] `agent-activity.ts`: `rpcInfo`, options-object `observeSession` (update `App.svelte:419`), replay (D7), `sessionUnknown` (D8), `ObservedSession.is_initialized`.
- [ ] `relay-executor.ts`: optional `sessionUnknown` and the 404 (D8).
- [ ] App rotate handler: `clearInit`, delete `clientNames[id]` (D9).
- [ ] Unit tests:
  - `tests/agent-activity.test.ts` (fake session with `initialized` state, spies for `onWrite`/`onClientName`):
    - `rpcInfo`: method, clientName and isError are read from one parse; a `tools/call` whose arguments contain the text `"initialize"` is not an initialize (regression for the old substring test); invalid JSON does not throw.
    - A successful `initialize` stores its body; a failed one (error member) does not; an empty body is never stored; a second successful one replaces the first (last initializer wins); `notifications/initialized` sets the flag.
    - Replay: `tools/list` on a fresh uninitialized session with a stored flagged init feeds the stored body then the notification, returns only the real reply, never calls `onWrite` and never calls `onClientName` (so `clientNames` is not overwritten); the order initialize -> (fresh session) -> `notifications/initialized` -> `tools/list` replays once and then needs no replay; no replay when already initialized; a failing replay clears the store and returns the engine's error with `sessionUnknown()` true.
    - `sessionUnknown()`: true only for a replied non-initialize message on an uninitialized session; false after a failed `initialize`; false for notifications.
  - `tests/agent-connections.test.ts`: save/load/clear round-trip; `remove(id)` clears the stored init; empty body not stored; `sweepInits` removes only orphaned keys; throwing storage does not throw.
  - `tests/relay-executor.test.ts`: `sessionUnknown: () => true` -> 404 with the handler's body; `false` or absent -> 200 unchanged; `undefined` out -> 202.

#### Acceptance Criteria

- [ ] All existing executor/activity tests pass (the `observeSession` signature change updates their call sites only).
- [ ] The replayed requests are the client's own stored bytes; the only TS-authored MCP message is the fixed paramless `notifications/initialized` notification.
- [ ] The 404 body is byte-for-byte the engine's; a failed `initialize` still returns 200.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass.

#### Testing

```bash
npm run typecheck && npm run lint && npm test
```

#### Milestone gate

As Phase 1.

### Phase 3: e2e, docs, ADR addendum

**Goal:** the behaviour is covered end to end and documented.

**Agent:** Web App Worker

#### Tasks

- [ ] `e2e/agent-reopen.spec.ts` (fixture `essay.srsj`, helpers `routeRelayChannels({ fixed: true })` and the `routeWebSocket` + `rpc` pattern from `agent-channels.spec.ts`; record every frame the mocked executor receives):
  1. **Reopen:** connect an agent, open the repo, `page.reload()`, reopen the same repo: the row reaches `online` with no Connect click, the executor socket URL has the same `EXEC` credential, channel bootstrap was called once overall.
  2. **Different repository:** after the reload open another document: no executor socket opens.
  3. **No tab conflict:** a second page in the same context loads the saved list while the first holds the lock: its row shows in-use and opens no socket (after the ~1 s retry still none).
  4. **Disconnect sticks:** disconnect, reload: not reopened.
  5. **Guard after reopen:** after the reload and reopen, an agent `record_update`/comment write on a guarded essay paragraph (the same case `agent-channels.spec.ts` uses for the guard) is refused, and an allowed write succeeds.
  6. **Replay:** `initialize` (clientInfo name `claude-code`) + `notifications/initialized`, reload, reopen the repo; ordering variant: after the reload send `notifications/initialized` then `tools/list`. `tools/list` replies 200 with tools, **no `initialize` frame was sent after the reload**, and a write made after the reload carries the same `createdBy` actor name as before.
  7. **Fallback:** with `srs-web.mcp-init.*` cleared before the reload, `tools/list` replies 404 with a body containing `not initialized`; then `initialize` replies 200 and `tools/list` replies 200.
  8. **Takeover after reload:** the first executor socket of the reopened agent is closed before opening (mock refusal, status `rejected`), the second socket request carries the takeover param: exactly one automatic takeover, the row ends `online`; a manual Connect after Disconnect never sends the takeover param.
  9. **Clearing:** after Rotate and after Forget, `localStorage` has no `srs-web.mcp-init.<id>`.
- [ ] README "Agents and relays" section: agents connected when the page closed reopen when the same repository opens (unless another tab holds them), reusing the same channel and credentials, so paired clients keep working; the host remembers each client's last `initialize` (per agent, in this browser, client metadata only) and replays it after a reload; with several clients on one channel the last one to initialize wins; Forget or Rotate URL discards it; without it a call on a fresh session gets HTTP 404 and the client must re-initialize.
- [ ] ADR-020 (k) addendum "Reopen (#418)" and the header amended-by list (line 9), as in the ADR table.

#### Acceptance Criteria

- [ ] New Playwright spec passes; `e2e/agent-library.spec.ts`, `agent-channels.spec.ts`, `mcp-relay.spec.ts` still pass.
- [ ] README and ADR text match the shipped behaviour.

#### Testing

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test e2e/agent-reopen.spec.ts e2e/agent-library.spec.ts e2e/agent-channels.spec.ts e2e/mcp-relay.spec.ts
```

#### Milestone gate

As Phase 1, plus the Playwright command above.

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Targeted Playwright (Phase 3) passes
- [ ] No srs-rust or relay change was needed to merge

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001): the executor only reads `sessionUnknown()`; the only JSON-RPC parsing is `rpcInfo` (`method`, `clientInfo.name`, `error` presence), used to store and replay bodies opaquely.
- No cross-repo dependency. Do not widen scope into the relay.
- Verification Agent runs after each phase and before sign-off.

## Assumptions

- A reload usually releases the old page's Web Lock before the new page asks; if not, the one ~1 s retry covers it, after which the row shows "in use elsewhere" and the user clicks Connect.
- The stored `initialize` body holds only the client's protocol version, capabilities and clientInfo (no secrets); it sits in the same localStorage as the channel credentials.
- If real-client testing (semanticops-relay#1) shows replay is insufficient, the id-based path (executor-minted `Mcp-Session-Id`, relay header forwarding) is the next step; one line here, no issue filed.
- Stale `reopen` flags for an agent whose relay was removed are harmless: `openChannel` returns early when the relay is missing.

## Lead decision (round 1)

- Replay sets the panel's client name from the replayed `initialize` only when `clientNames[id]` is not yet set (true after a reload), and never overwrites an existing name. This keeps the name visible after a reload and still avoids flipping identity between two clients. It overrides the "replay never calls `onClientName`" wording above.
