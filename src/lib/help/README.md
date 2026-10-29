# Editor help

Help is data (decision 9441693e, srs-web#639). The words live in **`help/`** at the repository root, an SRS repository with its own package `com.semanticops.help`. Components only name the feature they present.

- **A feature** is one `ui-feature` record. It has:
  - `feature_id`, a stable slug: `essay.add-paragraph`, or `shell.save` for UI every editor shares
  - `placement`: `ui` when it is on screen, `concept` when it is an idea only
  - `title` and `summary`, the words the help dialog shows
  - `explanation`, shown on More and given to agents
  - `ai_guidance`, how an agent should teach it
- **An editor's help** is the container whose `name` is the editor id (`essay`). Its entry order is the order shown. A shared record can be a member of several editors' containers.
- **A component** names the feature it presents with `use:feature={"essay.add-paragraph"}` (`feature.ts`, a string literal). It never holds help text.
- **No drift.** `tests/help-contract.test.ts` fails when:
  - a `use:feature` has no record
  - a `ui` record is on no component
  - an id is used twice
  
  Whether the words are still *true* is checked in review (the PR template asks).

## Changing the words

Open `help/` in the editor (Open → Folder on this device), edit the records, and save over the folder. Then commit the changed files. The CLI or the srs MCP server work too (`srs record update --repo help …`). Never hand-edit the JSON.

## Giving an editor help

1. Create a container in `help/` named after the editor id (its registry `id`).
2. Add `ui-feature` records to it, or add existing `shell.*` records as members.
3. Put `use:feature` on the components that present the `ui` features.

`helpFor(editorId)` (`help.ts`) returns the editor's help in order. An editor with no container has no help.
