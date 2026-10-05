/**
 * Governance's Toolbar registry (#463): the shared actions (Save, exports, Wide, Agents…, Open another)
 * plus "New {label}", the first Document item. Wiring only; no shell imports another's registry.
 */
import type { ToolbarAction } from "../components/menu-action.js";
import { type CommonHandlers, commonActions } from "../components/shell-actions.js";
import type { ShellState } from "../shell-context.svelte.js";

export interface GovernanceHandlers extends CommonHandlers {
  /** Absent in a form or with no section schema: no "New" is offered. */
  onnew?: () => void;
  /** The active section's label ("Article"). */
  newLabel?: string;
}

export function governanceActions(
  h: GovernanceHandlers,
  s: { shell: ShellState; saving: boolean }
): ToolbarAction[] {
  const common = commonActions(h, s);
  if (!h.onnew) return common;
  // First in the array, so first in the Document menu (Save is a bar primary, not a menu row).
  return [
    {
      id: "new",
      group: "document",
      kind: "action",
      label: `New ${h.newLabel ?? "record"}`,
      run: h.onnew,
      enabled: !s.saving,
      testid: "governance-new-record",
    },
    ...common,
  ];
}
