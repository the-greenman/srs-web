# ADR-028: The host answers its own UI tools

- **Status:** accepted
- **Date:** 2026-10-29
- **Issue:** srs-web#643 (holon the-greenman/semanticops.com#49; decision 9441693e)

## Decision

Two MCP tools are answered by srs-web itself, not by the engine: **`ui_help`** returns the open editor's help (the `help/` records, in order, with whether each feature is on screen) as a manual for agents, and **`ui_highlight`** points at a feature (`data-feature`) or a paragraph (`data-block-id`) on the writer's screen with a short message.

- **Where.** `withUiTools` (`src/lib/agent-activity.ts`) wraps each agent's session: it appends both tools to the engine's first `tools/list` page and answers their `tools/call` without passing them on. The screen supplies a `UiHost` (App.svelte): the help, a visibility check and the highlight (`UiSpot`).
- **Why the host.** They are presentation: they read the client's own help and the client's own DOM, and mean nothing to the CLI or WASM core (capability-layering). So no srs-rust change, release or pin; the relay protocol is untouched (it carries frames, not tools).
- **Never a write.** Both are read-only (`readOnlyHint`), and neither changes the document, whatever the agent's write guard says (domain 2651f2ad: agents respond; they never write). An agent's message is shown as text, never markup.
- **Not on screen** is an answer, not an error: `{shown: false, reason}`, so the agent can tell the writer where to look.
