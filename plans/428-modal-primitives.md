# Plan: Modal primitives (#428)

## Summary
Move the remaining hand-rolled modals and one-off button controls onto `Modal`, `Button` and `IconButton` (Lucide), delete their scoped overlay/button/raw-colour CSS, and extend the token test so they cannot regress.

## Architecture Decisions
ADR-019 (components + specimens first), ADR-020 (token tiers, Lucide icons, no raw colours).

## Contracts
No WASM or TS contract change. Presentation only. All data-testid and aria-label values are preserved.

## Scope
1. `GitSaveModal`, `SuccessorModal`, `DecisionLinkPicker` onto `Modal` + `Button` (+ `Input`/`.select`); no `<style>` block. Generic body parts (fieldset, option list) live in `modal.css` on tokens.
2. `DecisionLogView` sort/show-all/export buttons and `SourceChooser` scan button onto `Button`.
3. `SectionForm` table editor buttons and `BlueprintDocumentEditor` move/remove buttons onto `Button`/`IconButton` (ChevronUp/ChevronDown/X/Plus); raw colours become tokens. Add `btn--danger` (component tokens) for destructive text buttons.
4. `tests/styles-tokens.test.ts`: scan `src/lib/editor/{SectionForm,BlueprintDocumentEditor}.svelte` for raw colour; fail on one-off button classes (`modal-btn`, `te-btn`, `*__*btn`, `modal-overlay/dialog`) in the migrated files.
5. Specimen: add the git branch-choice layout to the Dialogs section (inline Modal), reskins under Demo.

Out of scope: shells (#424), behaviour changes.

## Phases
- [ ] A: styles (modal.css parts, btn--danger) + modals + styleguide specimen
- [ ] B: DecisionLogView, SourceChooser buttons
- [ ] C: SectionForm, BlueprintDocumentEditor
- [ ] D: token test; gates; before/after screenshots

## Final Acceptance
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, full `npm run e2e` exit 0
- [ ] No testid/aria change; screenshots reviewed
