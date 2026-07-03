/**
 * type-registry.ts — single source of truth for known governance types.
 *
 * Each entry maps a typeId UUID to display hints (label, icon, typeName, etc.)
 * AND its custom view component. To register a new known type, add one entry here.
 *
 * Unknown types (discovered from loaded records at runtime) are not in this registry;
 * buildDynamicSections() auto-derives them with a fallback label and RecordView.
 *
 * ADR-006: dynamic section discovery + typeId-keyed view dispatch
 * ADR-007: TYPE_REGISTRY unifies display hints and view components into a single registry
 */

import DecisionView from "../../rendering/DecisionView.svelte";
import type RecordView from "../../rendering/RecordView.svelte";

export interface TypeRegistryEntry {
  label: string;
  icon: string;
  typeName: string;
  typeNamespace: string;
  typeVersion: number;
  /**
   * Custom view component for this type. Optional: absent entries fall back to RecordView
   * in RecordDispatch.svelte. All registered views accept { record: SrsRecord }.
   * Cast required: Svelte 5 component types are not structurally identical even when
   * they share the same prop interface.
   */
  view?: typeof RecordView;
}

export const DECISION_TYPE_ID = "1fcad6a2-9f78-5e41-94ba-d82e88b822f3";
export const DECISION_LOG_CONTAINER_TYPE = "decision-log";

// Release 1 is a decision-log-only editor. The `article`, `role`, and `exercise` types
// stay defined (dormant) in the com.mudemocracy.governance package, but the editor
// registers only the decision view. Any dormant-type record that appears falls back to
// RecordView via buildDynamicSections()/RecordDispatch.
export const TYPE_REGISTRY: Record<string, TypeRegistryEntry> = {
  [DECISION_TYPE_ID]: {
    label: "Decision Log",
    icon: "⊕",
    typeVersion: 1,
    typeName: "decision",
    typeNamespace: "governance",
    view: DecisionView as unknown as typeof RecordView,
  },
};
