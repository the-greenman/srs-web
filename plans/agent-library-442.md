# Plan: Agent library — manage relays and saved agents in the UI (#442)

## Summary

Owner review, 2026-10-04: "There is no way to connect an agent anymore." The whole agent surface (the essay rail's Agents panel, the floating `.mcp-dock` elsewhere) renders only when `relayUrl` is truthy (`src/App.svelte` ~286: `VITE_MCP_RELAY_URL`, else the hidden `localStorage["srs-web.mcp-relay-url"]`). On a dev server, or any deployment without the env var, it silently vanishes. Saved agents already exist (`src/lib/agent-connections.ts`, key `srs-web.agent-connections`) but are tied to nothing: one global `relayUrl` is passed to every `RelayHost`.

This plan makes relays and agents two user-managed libraries, and replaces App.svelte's `agentDock` snippet with **one `AgentPanel` component** (rows, not headings, per the owner's 2026-10-04 styling comment):

- **Relay library** (new `src/lib/relay-library.ts`): `{id, label, url, isDefault}`; `VITE_MCP_RELAY_URL` and the legacy `srs-web.mcp-relay-url` seed it once; https-only except localhost.
- **Agent entries** gain `relayId`, `lastConnectedAt` and a rename (`label` already exists). Each agent's relay is fixed at creation.
- **Always present** when a repository is open; with no relay the panel says so and offers "Add a relay".
- **Placement:** the essay rail and the floating dock render the same `AgentPanel`; a Toolbar **Go → Agents…** action (essay and generic shells, the only two that mount a `Toolbar`) opens it, including at drawer widths. The Guides and Governance shells use a menu-less `Topbar` and rely on the always-present dock (checked reachable at phone width in e2e).
- **Styling:** rows with a compact `ActorMark`, name, relay label, status dot; Connect/Disconnect as `Button size="sm"`, Forget in a `⋯` `ActionMenu`; disclosure buttons with a Lucide chevron and `aria-expanded` instead of native `<details>`; type scale from the panel tokens; styleguide specimens at rail width (18–20rem) and narrow.

Client configuration only (ADR-001). No WASM or srs-rust change. Persisting agent identity in the repository stays with RFC-046.

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
| [ADR-001](../docs/adr/001-thin-client.md) | Relay/agent management is client configuration. No SRS semantics in TS; the agent actor (`{kind:"ai", id, name}`) is still set by the host through the WASM `McpSession.set_actor` exactly as today. | accepted |
| [ADR-019](../docs/adr/019-ui-theming-surface-and-live-styleguide.md) | `AgentPanel` parts and `--agent-panel-*` tokens are skin API; every state is a `/styleguide` specimen. | accepted |
| [ADR-020](../docs/adr/020-icon-set-and-component-token-api.md) | Lucide icons by file name; `data-part` tables; `ActorMark` shape-not-colour (f); notices (j): location-bound errors stay inline. Phase 4 appends part (k) "Agent library". | accepted, amended in Phase 4 |
| [ADR-017](../docs/adr/017-refresh-token-in-memory.md) | Not extended. It concerns GitHub refresh tokens kept out of browser storage. Relay channel credentials are already persisted in localStorage per agent (`credsKey`), and #358/#391 own that; this plan neither adds secrets nor changes where they live. A durable/secure store is deferred (below). | n/a |
| [ADR-013](../docs/adr/013-repo-context.md) | Unrelated (record-view context). Panel gets props from App, not Svelte context, to stay presentational. | n/a |

Decisions made in this plan (no new ADR; written into ADR-020 (k) and component headers):

| Ref | Decision |
|---|---|
| D1 | A relay with agents cannot be removed (blocked, with the reason shown inline). Simplest safe option: no cascade that silently destroys channel credentials. |
| D2 | An agent's `relayId` is fixed at creation. Channel credentials are per agent per relay (`credsKey(agentId)`, which already stores `relayUrl`; `RelayHost.#stored` ignores creds whose URL differs). |
| D3 | A relay's URL is editable only while no agent uses it; its label is always editable. Otherwise "remove and re-add" is the path. |
| D4 | The env var and legacy key seed the library **once** (a single `seeded: boolean` in the stored object), so deleting a seeded relay sticks. Changing `VITE_MCP_RELAY_URL` in a later build does **not** re-seed viewers who already have a library; they add the new relay by hand (documented in README and `.env.example`). |
| D5 | First run keeps today's behaviour: `list()` seeds one agent (or migrates the legacy one), bound to the default relay by `adoptRelay`. With no relay, the seeded agent is **hidden** until a relay exists, so the empty state is just "No relay · Add a relay". Plan decision (not an owner ruling): the issue does not ask for a first-run change, and keeping it avoids rewriting the existing agent specs. |
| D6 | Rename is offered only while an agent is **disconnected** (saved, not open in this tab). The actor name is fixed by `set_actor` at session open; renaming a live session would need a reopen, so we do not offer it. |
| D7 | "Go → Agents…" uses the existing handler pattern: `onopenagents` in `HeaderHandlers` and `GenericHandlers`, and the existing `Panel` `open = $bindable`. No new module-level store. |

## Contracts

### WASM API surface

**No** new or changed WASM methods. `McpSession.set_actor` / `set_write_guard` / `open_mcp_session` are called as today. No srs-rust issue.

### TypeScript types and storage

Storage follows the inline `try/catch` + in-memory cache style of `agent-connections.ts` (no shared helper exists; none is added).

New `src/lib/relay-library.ts`:

```ts
export interface Relay { id: string; label: string; url: string; isDefault: boolean }
// storage: localStorage["srs-web.relays"] = { v: 1, relays: Relay[], seeded: boolean }
export function validateRelayUrl(input: string): { ok: true; url: string } | { ok: false; error: string };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Result = { relays: Relay[] } | { error: string };
export function createRelayStore(
  getStorage?: () => Store,
  opts?: { env?: string; legacy?: () => string | null; usedBy?: (relayId: string) => number } // usedBy = agents on that relay
): {
  list(): Relay[];                                              // seeds once; in-memory cache after
  add(label: string, url: string): Result;
  update(id: string, patch: { label?: string; url?: string }): Result; // url refused while usedBy(id) > 0 (D3)
  setDefault(id: string): Relay[];
  remove(id: string): Result;                                   // refused while usedBy(id) > 0 (D1)
  get(id: string): Relay | undefined;
};
export const relays: ReturnType<typeof createRelayStore>; // wired to import.meta.env + localStorage
```

- **Validation** (`validateRelayUrl`): trim; `new URL()`; protocol `https:`, or `http:` only when hostname is `localhost` or `127.0.0.1` (and `[::1]`); no credentials, no hash; stored normalised to `origin` (no path, no trailing slash, which is what `bootstrapChannel` expects today). Duplicate normalised URL is an error (`"That relay is already in the library."`). Label: trimmed, 1–40 chars, default = host.
- **Default:** exactly one `isDefault` whenever the list is non-empty. First relay added is default; removing the default promotes the first remaining; `setDefault` moves the flag.
- **Seeding** (first `list()` only, while `seeded` is false, then set true): `VITE_MCP_RELAY_URL` (label from host, becomes the default), then legacy `localStorage["srs-web.mcp-relay-url"]` (read, never removed or rewritten; documented in the README as the e2e/dev seed). An invalid seed is skipped. Because the flag is set once, a removed seed does not return and a changed env var does not re-seed (D4). The e2e seed therefore must be set in `addInitScript` before the first load (as `helpers.ts` does); a seed added after the library exists is ignored.
- Ids: `relay:${crypto.randomUUID()}`.

`src/lib/agent-connections.ts`:

```ts
export interface AgentConnection {
  id: string;               // agent:<uuid>, unchanged: it is the actor id
  label?: string;           // host-fixed display name (rename edits this)
  relayId?: string;         // fixed at creation; absent only pre-migration
  lastConnectedAt?: string; // ISO 8601, set when status first reaches "online" in a session
}
// store methods (all return the new list, like add/remove today):
add(label: string | undefined, relayId: string | undefined): AgentConnection[];  // relayId undefined only for a seeded entry with no relay
rename(id: string, label: string): AgentConnection[];                             // empty label clears it; D6 enforced in the UI
touch(id: string, at?: string): AgentConnection[];                                // sets lastConnectedAt (default now)
adoptRelay(defaultRelayId: string): AgentConnection[];                            // sets relayId on every entry lacking one
count(relayId: string): number;                                                   // agents on a relay (the relay store's `usedBy`)
```

- **Migration:** entries without `relayId` get the default relay's id via `adoptRelay`, which App calls whenever the relay list changes (so a profile with agents and no relay adopts the first relay added). Creds already store `relayUrl`, so a reconnect keeps its channel iff the adopted relay's URL equals the stored one; otherwise `RelayHost` mints a fresh channel (existing behaviour, no new code). Rename applies only to a disconnected agent (D6), so the new name is used the next time `openAgentSession` sets the actor.
- **First run (D5):** `list()` keeps today's seed/migrate of one entry; `adoptRelay(defaultId)` binds every unbound entry once a default relay exists.
- `credsKey`, Web Locks (`acquireChannelLock`, `releaseChannelLock`, `channelsInUseElsewhere`) are unchanged.

`App.svelte` (line refs against base 9b2725f): the `relayUrl` const (~286) is deleted. Naming: `library` stays the agent list (~312), `relayList` is the new relay list. `hostFor(conn)` (~318) resolves `relays.get(conn.relayId)?.url`; an agent whose relay is missing (should not happen, D1) shows "Relay missing" and cannot connect. The two `if (!relayUrl) return;` effect guards (~416, ~424) become `agents.length === 0` / `library.length === 0` guards. Handler signatures:

```ts
function addRelay(label: string, url: string): string | null;                 // error text or null; calls adoptRelay on success
function updateRelay(id: string, patch: { label?: string; url?: string }): string | null;
function removeRelay(id: string): string | null;
function setDefaultRelay(id: string): void;
function connectAgent(label: string | undefined, relayId: string): void;     // was connectAgent(label?)
function renameAgent(id: string, label: string): void;                       // disconnected agents only
function adoptRelays(): void;                                                // library = connections.adoptRelay(default.id) when a default exists; called after every relay change and once at start
```

---

## Scope

- `relay-library.ts` and `agent-connections.ts` changes above, with unit tests.
- `AgentPanel.svelte` (new, presentational: all data and handlers via props from App) replacing the `agentDock` snippet in both placements; `McpConnection.svelte` slimmed to the per-agent detail block, no longer owning identity/status. Its props become `{ status: McpConnectionStatus; callerUrl: string | null; error: string | null; onTakeover?: () => void }`; `agentName`, `actor`, `repositoryName`, `lastActivity`, `onDisconnect`, `onRotate` move to the row. `tests/McpConnection.test.ts` is rewritten for the new props (the `agent-last` and name assertions move to an `AgentPanel` test).
- Toolbar entry **Go → Agents…** in `src/lib/essay/header-actions.ts` and `src/lib/generic/toolbar-actions.ts`, via one shared `agentsAction(run)` in `src/lib/components/shell-actions.ts` (next to `wideAction`) fed by an `onopenagents` handler (D7).
- Always-present surface; empty state "No relay · Add a relay".
- Relay management UI in the panel: add, edit label, edit URL while unused (D3, same form as add), set default, remove (D1). Each is required by the issue ("add, name, edit and remove", "mark one as the default").
- Agent management UI: connect, disconnect, forget, rename (D6), choose relay at creation (a relay `Select`, shown only when more than one relay), last connected, in-use-elsewhere marker (existing).
- Connection errors: inline in the row via `Notice` (location-bound, ADR-020 j); `notify({kind:"info", key:"agents", text})` toasts (from App's handlers, never from `AgentPanel`) for "Relay added", "Relay removed", "Agent forgotten" (confirmation for a non-focus-visible result, polite live region for free).
- Styleguide specimens, e2e, docs.

**Out of scope / deferred:**

- A durable (cross-device) relay or agent store: localStorage per viewer only (the issue allows "a durable store if one exists later").
- Persisting agent identity or the agent list in the repository (RFC-046 actors; separate question).
- Moving relay channel credentials out of localStorage (ADR-017-style hardening) or encrypting them.
- Cascade-forget of a relay's agents on removal; moving an agent to another relay (forget and create anew).
- Relay health checks / pinging a relay on add (a bad URL surfaces as a connect error).
- Per-repository agent sets (the library is global to the viewer).
- Removing the `srs-web.mcp-relay-url` seed (kept, documented, e2e depends on it).
- Any srs-rust change or new dependency.

---

## Phases

### Phase 1: Stores (no UI)

**Goal:** relay library and extended agent entries exist, tested, and App runs on them with the old panel still rendering.

**Agent:** Web App Worker

#### Tasks

- [x] `src/lib/relay-library.ts`: `validateRelayUrl`, `createRelayStore`, `relays` singleton wired to `import.meta.env.VITE_MCP_RELAY_URL` and the legacy key.
- [x] `agent-connections.ts`: `relayId`, `lastConnectedAt`, `add(label, relayId)`, `rename`, `touch`, `adoptRelay`, `count(relayId)`; D5 first run.
- [x] `App.svelte`: delete the `relayUrl` const; `hostFor` uses the agent's relay; `connectAgent(label, relayId)`; `renameAgent`; call `touch` when a host first reports `online`; call `adoptRelay(default)` on relay changes; relay mutation handlers (`addRelay`, `updateRelay`, `removeRelay`, `setDefaultRelay`) as thin wrappers over the store that keep a reactive `relayList = $state(relays.list())`. Still render the existing `agentDock` snippet for now, gated on `relayList.length > 0`.
- [x] `tests/relay-library.test.ts`, extend `tests/agent-connections.test.ts`, new `tests/relay-host.test.ts` (list below).
- [x] Run the full e2e once after wiring; the legacy-key seed still yields a relay and D5 keeps the seeded agent, so existing agent specs stay green unchanged.

#### Acceptance Criteria

- [x] Vitest: URL validation accepts `https://relay.test`, `http://localhost:8787`, `http://127.0.0.1:8787`; rejects `http://relay.test`, `ftp://x`, `javascript:alert(1)`, `https://u:p@x`, empty, garbage; normalises `https://relay.test/` and `https://relay.test/v1` to the origin; rejects duplicates.
- [x] Vitest: seeding from env and from the legacy key, once only (removing a seeded relay and reloading does not resurrect it; a changed env value on a later load does not re-seed); invalid seed skipped; legacy key not modified.
- [x] Vitest: one default invariant across add / remove-default / set-default; `remove` while `usedBy(id) > 0` returns an error and changes nothing; `update` of `url` while used errors, label still allowed.
- [x] Vitest: agent migration: entries without `relayId` get the default via `adoptRelay`.
- [x] Vitest (`tests/relay-host.test.ts`, new; no RelayHost test exists today): `RelayHost` with creds stored for `https://a.test` and `relayUrl: "https://b.test"` ignores them and bootstraps a fresh channel; same URL reuses them.
- [x] Vitest: seeded entry with no relay stays unbound until a relay is added, then `adoptRelay` binds it.
- [x] Vitest: a throwing storage never throws and never mints a fresh id mid-session (existing pattern, now also for relays).
- [x] Vitest: first run keeps today's seed (one entry, with or without legacy keys); `rename`, `touch`, `count` behave as typed.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass; `e2e/agent-channels.spec.ts` and `e2e/mcp-relay.spec.ts` still pass.

#### Deviations (as built)

- `e2e/agent-channels.spec.ts` "reload keeps ids" compared the raw `srs-web.agent-connections` string; `lastConnectedAt` legitimately changes on reconnect, so the snapshot now compares agent ids only.
- Until Phase 2 wires the relay handlers to `AgentPanel`, App holds a `void [...]` line (marked TEMP) so typecheck passes.

#### Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test e2e/agent-channels.spec.ts e2e/mcp-relay.spec.ts
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
3. Mark completed task checkboxes `[x]`.
4. Commit with a message referencing the issue (`Relay library and agent relay binding (#442)`).

Do not start the next phase until the milestone gate passes.

---

### Phase 2: AgentPanel component

**Goal:** one presentational `AgentPanel` with the redesigned rows, used by both placements, surface always present.

**Agent:** Web App Worker

#### Tasks

- [x] `src/lib/components/AgentPanel.svelte` (+ `src/styles/components/agent-panel.css`, imported in `src/styles/index.css` in the components layer next to `mcp-connection.css`). Props (all from App; no store imports inside):
  ```ts
  { relays: Relay[]; agents: PanelAgent[]; repositoryName?: string | null;
    ctx?: AgentPanelCtx;
    onAddRelay(label: string, url: string): string | null;            // returns an error message or null
    onUpdateRelay(id: string, patch: { label?: string; url?: string }): string | null;
    onRemoveRelay(id: string): string | null;
    onSetDefault(id: string): void;
    now: number;                                                       // App's 15 s clock (EssayShell's `now` is private to it; the dock needs its own)
    onConnectNew(label: string, relayId: string): void;
    onConnect(id: string): void; onDisconnect(id: string): void; onForget(id: string): void;
    onRename(id: string, label: string): void;
    onRotate(id: string): void; onTakeover(id: string): void }
  // PanelAgent is exported from src/lib/components/agent-panel.ts (like menu-action.ts / icon.ts), not declared inline:
  // export interface PanelAgent { conn: AgentConnection; name: string; relayLabel: string; state: HostState | null /* null = saved, not open here */; inUseElsewhere: boolean }
  ```
- [x] Layout, top to bottom: **agents list**, **"Connect an agent"** disclosure, **relays list**, **"Add a relay"** disclosure. Empty state when `relays.length === 0`: the single line "No relay · Add a relay" (the disclosure button opened); the agents list, a seeded unbound agent (D5) and the "Connect an agent" disclosure are all hidden. With a relay and no agents: "No agents yet." and "Connect an agent" visible.
- [x] **Agent row** (`<li>`, `data-part="agent"`): `ActorMark size="sm"` (`{kind:"ai", id, name}`), name (a `<span>`, never a heading; `text-overflow: ellipsis`, full name in `title`), relay label (muted, own line under the name at rail width), status dot (reuse the `.mcp-conn__dot--{status}` colour tokens by moving them to `agent-panel.css` as `.agent-panel__dot--*`; the dot is `aria-hidden`). The status word is real **visually-hidden text** in the row with `data-testid="mcp-status"` (exactly one per open agent, text "Connected" etc.), because `e2e/helpers.ts` and `agent-channels.spec.ts` (:82, :86, :137, :216, :228, :231, :283) assert it with `toHaveText`/`toHaveCount`. Actions: `Button size="sm"` **Connect** (saved agents; disabled with "in use in another tab" when `inUseElsewhere`) or **Disconnect** (open agents); `ActionMenu` (`⋯`, `title="Agent actions"`, `label={name}`) with **Rename** (disconnected only), **Rotate URL** (open only, `itemTestid` → `mcp-rotate`), **Forget** (`itemTestid` → `mcp-library-forget`; asserted at `agent-channels.spec.ts:140`). The Disconnect button keeps `data-testid="mcp-disconnect"` (asserted at :136). Rename (only for disconnected agents, D6) edits inline in the row (an `Input` replaces the name; Enter saves, Escape cancels).
- [x] Open agents show the slimmed `McpConnection` (props in Scope: caller URL + copy, takeover for `rejected`/`replaced`, notes) directly under the row, always visible while the agent is open (no second collapse per agent). Connection error text renders as `Notice kind="error"` inside the row (inline, location-bound); the "Another tab holds it / executor_origin_forbidden" note stays.
- [x] Last connected: muted `Connected 2 min ago` / `Never connected` under the relay label, from `lastConnectedAt` via `relativeTime(at, now)` imported from `$lib/relative-time.js` (the helper EssayShell uses at :17/:396; do not add another). `lastConnectedAt` and the existing `lastActivity` (from `AgentPanelCtx`) are different data and both stay.
- [x] **Relay row** (`data-part="relay"`): label, URL (mono, truncated, `title`), "Default" `Tag` when `isDefault`, count of agents; `ActionMenu` with **Make default**, **Edit**, **Remove**. Remove with agents surfaces the D1 error inline ("Forget its 2 agents first.") and does nothing. Edit opens the inline form with the URL field disabled when the relay has agents (D3) and a one-line reason.
- [x] **Disclosures**: no existing component does this (`NavGroup` is a static label; `Panel` is a native `<details>` with a CSS chevron). Add one small `src/lib/components/Disclosure.svelte` (`{ label, open = $bindable(false), testid?, children }`): `Button size="sm" variant="ghost"` + Lucide `ChevronRight`/`ChevronDown` + `aria-expanded` + `aria-controls` → a region; export and README row. Used for "Connect an agent" and "Add a relay" only. `Panel` itself stays `<details>` (noted in ADR-020 (k)).
- [x] **Connect an agent** form: optional name `Input`, a relay `Select` only when `relays.length > 1` (preselects the default), submit `Button size="sm"`. **Add a relay** form: label `Input`, URL `Input` (`type="url"`, `inputmode="url"`), inline validation message from `onAddRelay` via `aria-describedby`.
- [x] Tokens: `--agent-panel-*` for row padding, gap, dot size, name/meta font sizes (panel scale: name = body, meta = the smaller panel size), all on the `.agent-panel` root; no hard-coded px outside the token defaults.
- [x] `App.svelte`: delete the `agentDock` snippet; build `PanelAgent[]` and pass `AgentPanel` as the `agentPanel` snippet for the essay (`registry.ts` `agentPanel`/`hostsAgentPanel` unchanged); add a 15 s `now` clock in App (cleared on destroy); `PanelAgent[]` is a `$derived` of `library`, `agents`, `relayList`, `inUse` and render it in the `.mcp-dock` `Panel` for other editors. `agentPanel`/`agentStatus` are always passed when `repo` is open (drop the `relayUrl ?` ternaries at ~878-879; the dock condition is at ~930), and the dock condition becomes `repo && !activeEditor?.hostsAgentPanel`.
- [x] `src/lib/components/index.ts` exports and `src/lib/components/README.md` rows for `AgentPanel` and `Disclosure`; update the `McpConnection` row; rewrite `tests/McpConnection.test.ts` for the slim props and add `tests/AgentPanel.test.ts` (empty state, row content, hidden unbound agent, no headings, `agent-last` text).
- [x] `EssayShell.svelte`: the "Agents" `Panel` stays (its `aside` count and `AgentPresence` actions are kept); it already renders `agentPanel`. With no relay the `aside` count and `AgentFeed` are hidden (nothing can be connected); the panel body is only "No relay · Add a relay".

#### Acceptance Criteria

- [x] No relay: the panel shows "No relay · Add a relay" with the add form open and nothing else (no seeded agent), in both the essay rail and the dock.
- [x] No agent name renders as a heading element (`h1`–`h6`); no `<details>` in the panel.
- [x] Every disclosure toggles `aria-expanded`; the ActionMenu is keyboard operable (existing ActionMenu behaviour); every icon-only control has an accessible name.
- [x] At 18rem, a long agent name and a long relay label truncate without horizontal scroll; Connect and `⋯` stay on the row.
- [x] Existing e2e still pass unchanged: test ids `mcp-library-connect` (row Connect), `mcp-library-forget`, `mcp-library-item` (row), `mcp-connect-open` (the Disclosure button), `mcp-connect-agent` (form submit), `mcp-status`, `mcp-disconnect`, `mcp-rotate`, `mcp-caller-url`, `mcp-in-use` are kept on the redesigned elements.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.

#### Deviations (as built)

- `--agent-panel-*` tokens live in `src/styles/tokens-components.css` (the token-literal test only allows px/colour literals there), not on the `.agent-panel` root.
- The dock `Panel` is `bind:open={dockOpen}`, starting open only when a relay exists: an always-open dock with the add form sat over the generic shell's Save button and broke `notices.spec.ts`. Phase 3 reuses `dockOpen` for Go → Agents….
- `e2e/agent-channels.spec.ts`: Forget now lives in the row's ⋯ menu, so the spec opens `agent-menu` in the `mcp-library-item` row first (the id `mcp-library-forget` is unchanged). `mcp-agent-row` is the new id for an open agent's row (`mcp-library-item` stays saved-only; the spec counts it).
- `e2e/styleguide.spec.ts`: the role=alert exemption selector now names the AgentPanel specimens' Notices (`.agent-panel .notice`) instead of `.mcp-conn__error`. `tests/no-adhoc-notices.test.ts` drops the McpConnection allowance (its error is now a `Notice`).
- `McpConnection` renders nothing when it has no caller URL, error or takeover to show (avoids an empty bordered box).
- The Styleguide agent block now renders `AgentPanel` with `fx.relays`/`fx.panelAgents`; Phase 4 expands it to the five specimen groups.

#### Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test e2e/agent-channels.spec.ts e2e/mcp-relay.spec.ts e2e/essay-editor.spec.ts e2e/notices.spec.ts
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. `npm run typecheck`, `npm run build` pass.
3. Mark completed task checkboxes `[x]`.
4. Commit (`AgentPanel: one agent library surface (#442)`).

Do not start the next phase until the milestone gate passes.

---

### Phase 3: Toolbar entry and reachability

**Goal:** Go → Agents… opens the panel in every editor, at every width.

**Agent:** Web App Worker

#### Tasks

- [x] `agentsAction(run: () => void): ToolbarAction` in `src/lib/components/shell-actions.ts` (next to `wideAction`): `{ id: "agents", group: "go", kind: "action", label: "Agents…", testid: "toolbar-agents", enabled: true, run }`. Add `onopenagents: () => void` to `HeaderHandlers` (`src/lib/essay/header-actions.ts`, the `go` group beside `onexplorer`/`onopenanother`, ~116-130) and to `GenericHandlers` (`src/lib/generic/toolbar-actions.ts`, `go` group, ~54). No shared module store (D7).
- [x] Only `GenericSrsShell` (`<Toolbar>` at :510) and `EssayShell` (:515) mount a `Toolbar`; `GuidesShell` (:588) and `GovernanceShell` (:994, :1111) use a menu-less `Topbar` and get no Go menu. They rely on the always-present dock: add an e2e check that the dock is visible and operable at 390px in one Topbar shell (Guides).
- [x] Reaction, essay shell: `onopenagents` sets `shell.inspectorOpen = true` (the existing `ShellState` field, `shell-context.svelte.ts:18`; a no-op above the inspector breakpoint where the rail is inline) and a local `agentsOpen = $state(true)` bound to the Agents `Panel` (`open = $bindable`, `Panel.svelte:15`), then focuses the panel's first control after `tick()`. Generic shell: it does not host the panel (the dock is App-level), so App passes it an `onOpenAgents` prop (like the existing `onOpenAnother`, `GenericSrsShell.svelte:76,90,426`); add `onopenagents` to `GenericHandlers` (`toolbar-actions.ts:10`) as well as `HeaderHandlers`, and update the genericActions fixtures/tests that construct it: App sets a `dockOpen = $state(true)` bound to the dock `Panel` and focuses its first control. Closing the drawer returns focus to the trigger (existing Drawer behaviour).
- [x] `ToolbarSpecimen`/toolbar docs: add the action to `fx.toolbarActions` (`src/styleguide/fixtures.ts`, which also gets `onopenagents: nop` next to `onagent` at :452) so the styleguide shows it; `src/lib/components/README.md` Toolbar section mentions the Go group entry and the Topbar-shell note.

#### Acceptance Criteria

- [x] In the essay editor and the generic explorer, Go → Agents… exists and focuses the panel, with no relay configured.
- [x] At drawer widths (Playwright viewport 1000px wide: below `BREAKPOINTS.wide` (1100, `DRAWER_INSPECTOR`) where the inspector is a drawer) the action opens the inspector drawer showing the Agents panel.
- [x] In the narrow tier the action appears in the overflow menu under the Go section.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass; `e2e/essay-toolbar.spec.ts` and `e2e/shell-layout.spec.ts` pass.

#### Deviations (as built)

- `onopenagents` is optional in `HeaderHandlers` and `GenericHandlers` (like `onexplorer`): the action is offered only when the shell can open the library. `GenericSrsShell` takes an optional `onOpenAgents` prop; App passes `openDock`. The essay shell passes it only when it has an `agentPanel`.
- "Focus the panel" focuses the first control in DOM order: the "Add a relay" Disclosure button when no relay exists.
- The Phase 3 e2e live in `e2e/agent-library.spec.ts` (created here, extended in Phase 4); the Guides check expands the collapsed dock first (the dock starts collapsed with no relay, see Phase 2).
- `playwright.config.ts` `webServer.env: { VITE_MCP_RELAY_URL: "" }` was added here, since the new spec needs it.

#### Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test e2e/essay-toolbar.spec.ts e2e/shell-layout.spec.ts e2e/mobile-layout.spec.ts
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. `npm run typecheck`, `npm run build` pass.
3. Mark completed task checkboxes `[x]`.
4. Commit (`Go → Agents… toolbar entry (#442)`).

Do not start the next phase until the milestone gate passes.

---

### Phase 4: Styleguide, e2e, docs

**Goal:** every state specimen'd, the issue's e2e list green, docs written.

**Agent:** Web App Worker (Verification agent signs off)

#### Tasks

- [ ] **Styleguide** (`src/Styleguide.svelte`, `src/styleguide/fixtures.ts`): replace the hand-rolled agent block (~116-132) with a new `agents` section rendering `AgentPanel` with fixtures, each in a `Frame` at **20rem**, **18rem** (the rail range) and **narrow** (a `Frame` at 16rem, inside the phone tier `BREAKPOINTS.phone` = 480px) widths:
  1. no relay (empty state);
  2. one relay, no agents;
  3. several relays (one default, one with a long label/URL) and agents (online with caller URL, saved, in-use elsewhere, a long name);
  4. connection error (`rejected` and `error` rows, inline `Notice`);
  5. relay form with a validation error; relay remove blocked (D1 message).
  The existing essay-rail specimen's Agents `Panel` renders `AgentPanel` too. Add `sg-agent-*` testids and a `sg__tokens`-style listing of the `--agent-panel-*` tokens consistent with how other components list theirs.
- [ ] `e2e/styleguide.spec.ts`: assert the specimens render, no horizontal overflow at 18rem and narrow (`scrollWidth <= clientWidth`), no headings inside `.agent-panel`.
- [ ] `e2e/agent-library.spec.ts` (new), mocked relay as in `agent-channels.spec.ts` (`page.route("https://relay.test/v1/channels", ...)`, `page.routeWebSocket(/relay\.test.*executor/, ...)`); use the one extracted helper (next task). Tests, each on a **fresh profile with `VITE_MCP_RELAY_URL` empty**: set `webServer.env: { VITE_MCP_RELAY_URL: "" }` in `playwright.config.ts` (a process variable wins over every `.env*` file, so a developer's `.env.local` cannot leak in; verify by a unit-level check that the "fresh profile" test sees "No relay"):
  1. fresh profile, open `essay.srsj`: the Agents panel is visible with "No relay" and "Add a relay";
  2. add `https://relay.test` labelled "Test relay": appears as default; **reload** (`page.reload`, reopen the fixture): still present; `http://relay.test` is rejected with the inline message;
  3. connect an agent through it (mocked relay): status "Connected", caller URL shown; rename it; Disconnect; Forget with confirmation toast;
  4. two relays (`relay.test`, `relay2.test`, both mocked) and two agents (one per relay): two distinct rows with their relay labels; removing a relay that has an agent shows the D1 error and the relay stays; forgetting its agent then allows removal;
  5. legacy seed: `addInitScript` setting `srs-web.mcp-relay-url` yields a relay entry (this is the documented e2e seed);
  6. Go → Agents… from the Toolbar focuses the panel at desktop and at a drawer-width viewport.
- [ ] **Extract the relay mock once.** Add to `e2e/helpers.ts`: `export async function routeRelayChannels(page: Page, o?: { host?: string; fixed?: boolean }): Promise<void>`. It registers `page.route(\`https://${host}/v1/channels\`, ...)` returning `c${k}`/`CALLER${k}`/`EXEC${k}` for a per-call counter `k`, or `c`/`CALLER`/`EXEC` when `fixed` (the single-agent specs). Default `host` is `relay.test`. Migrate **every** inline copy: `helpers.ts:57` (`connectAgents`), `agent-channels.spec.ts:19, :154, :292`, `essay-editor.spec.ts:177`, `essay-write-guard.spec.ts:35`, `mcp-relay.spec.ts:25, :134`, `essay-comments.spec.ts:61` (re-grep `relay.test/v1/channels` first; it must return only the helper). The `routeWebSocket` handlers differ per spec and stay local. The existing test ids are unchanged, so no other spec edits.
- [ ] **Docs:** `README.md` (agents/relay section: library, default, https rule, the env var and the `srs-web.mcp-relay-url` e2e/dev seed, that changing `VITE_MCP_RELAY_URL` later does not re-seed an existing library, per-viewer localStorage, relay fixed per agent, channel credentials per agent); `.env.example` gains a documented, empty `VITE_MCP_RELAY_URL=` line (dev does not load `.env.production`, which is why dev had no relay); `src/lib/components/README.md` rows (`AgentPanel`, `Disclosure`, `McpConnection`), `src/lib/components/index.ts`; ADR-020 gains part **(k) Agent library (#442)** (rows not headings, the `Disclosure` pattern and that `Panel` stays `<details>`, D1–D7, inline errors, tokens, the deployment story: env seeds once) following (j)'s style, and #442 (part (k)) is added to its "Amended by" line (:9); the `Notice`/toast usage noted. No new ADR: no new constraint beyond ADR-020's component API. A note under ADR-001's consequences is not needed; the plan and (k) state "client configuration, not SRS semantics".
- [ ] Tick `plans/agent-library-442.md` checkboxes.

#### Acceptance Criteria

- [ ] The issue's e2e list is covered by `e2e/agent-library.spec.ts`: fresh-profile visibility, add relay persists across reload, connect through it, forget, two relays + two agents distinct.
- [ ] Styleguide has all five specimen groups at rail width and narrow; no overflow.
- [ ] No remaining reference to `relayUrl` as a module-level constant or to `agentDock`; `rg "<details" src/lib/components/AgentPanel.svelte src/lib/components/Disclosure.svelte src/App.svelte` is empty.
- [ ] Docs updated as listed; ADR-020 (k) present and in "Amended by".
- [ ] `rg "relay.test/v1/channels" e2e` matches only `e2e/helpers.ts`.
- [ ] Full gates below pass.

#### Testing

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
```

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e`; compare any e2e failure with last-green `main` before blaming this change.
3. Mark completed task checkboxes `[x]`.
4. Commit (`Agent library: styleguide, e2e, docs (#442)`). Push the branch only; review the diff before opening the PR (owner rule).

---

## Final Acceptance

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] `npm run e2e` passes (or every failure reproduced on last-green `main`)
- [ ] WASM loads and the agent write guard / actor still apply: `e2e/essay-write-guard.spec.ts` and `e2e/agent-channels.spec.ts` green against `essay.srsj`
- [ ] A fresh dev profile with no env var shows the agent surface with "No relay · Add a relay"
- [ ] Relay and agent libraries persist across reload; legacy `srs-web.agent-connections` entries migrate to the default relay with their ids and creds intact
- [ ] Panel has no headings, no `<details>`, uses `ActorMark`, `Button sm`, `ActionMenu`, and `Disclosure` (Lucide chevrons with `aria-expanded`)

## Coordination Rules

- Web App Worker keeps to `srs-web/**` only.
- No SRS semantics in TypeScript (ADR-001). The agent actor, write guard and session are WASM calls exactly as before; this plan only stores URLs and labels.
- Reuse over new (the only new UI parts are `AgentPanel` and `Disclosure`): `Button`, `IconButton`, `ActionMenu`, `ActorMark`, `Input`, `Select`, `Tag`, `Panel`, `Notice`, `notify`, `Toolbar` registries, `RelayHost`, `credsKey`, Web Locks. No new dependency.
- One owner of host/session lifecycle: App.svelte. `AgentPanel` never touches storage or hosts.
- Verification Agent runs after each gate and before sign-off. Stage the new files explicitly when committing (the ship stages: plan, design pause, reviewer agents, docs, dogfood apply).
- Check `git rev-list HEAD..origin/main` before the PR; rebase if #441/#444 follow-ups touched `Main`/`Panel`.

## Round-2 review notes

- `playwright.config.ts` has `reuseExistingServer: true`: the first fresh-profile e2e test asserts the "No relay" empty state so a leaked `.env.local` relay fails loudly; the README e2e section says to stop any running dev server before e2e.
- With zero relays, a seeded unbound agent is hidden; `adoptRelays()` binds it on the first relay add, so it appears then. State this in the README; cover it with an `AgentPanel`/store unit test.

## Assumptions

- Dev and e2e do not load `.env.production` (checked: it holds `VITE_MCP_RELAY_URL=https://relay.semanticops.com`; `.env.example` has no such line); `webServer.env` pins it empty for e2e.
- `Panel.svelte` already exposes `open = $bindable(true)` (checked), so no Panel change.
- `RelayHost.#stored` ignoring creds with a different `relayUrl` is the correct and sufficient behaviour when an adopted relay differs from the old URL (`relay-host.ts:57`); no RelayHost test exists, so Phase 1 adds one.
- A relay URL is normalised to its origin; relays hosted under a path prefix are not supported (matches current `bootstrapChannel` use).
- localStorage-only persistence is acceptable per the issue.
