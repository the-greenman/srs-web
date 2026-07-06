/**
 * type-registry.ts — single source of truth for known governance types.
 *
 * Each entry maps a typeId UUID to display hints (label, icon, typeName, etc.)
 * AND its custom view component. To register a new known type, add one entry here.
 *
 * ADR-007: TYPE_REGISTRY unifies display hints and view components into a single registry
 * ADR-009: TYPE_REGISTRY is presentation hints only — icon and view component.
 *          It no longer drives sidebar section appearance (container-driven nav).
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
  /**
   * When this type is a container ROOT/header type (RFC-013 sections), the type that
   * "New …" creates inside that container. Presentation-level create-target config,
   * like the rest of this registry (ADR-005/ADR-009). Interim until the blueprint
   * schema projects member types (`requiredTypes`) for record-only blueprints —
   * see srs-rust#382; container/view-driven config is srs-web#94/#95.
   */
  memberTypeId?: string;
}

export const DECISION_TYPE_ID = "1fcad6a2-9f78-5e41-94ba-d82e88b822f3";
/** RFC-013 decision-log header type (`governance/decision_log`) — the root record of a scaffolded Decision Log container. */
export const DECISION_LOG_TYPE_ID = "5a061505-dd0e-4c8d-9e20-fa28a3c42b68";

// Release 1 is a decision-log-only editor. The `article`, `role`, and `exercise` types
// stay defined (dormant) in the com.mudemocracy.governance package, but the editor
// registers only the decision view. Any dormant-type record falls back to RecordView
// via RecordDispatch.
export const TYPE_REGISTRY: Record<string, TypeRegistryEntry> = {
  [DECISION_TYPE_ID]: {
    label: "Decision Log",
    icon: "⊕",
    typeVersion: 1,
    typeName: "decision",
    typeNamespace: "governance",
    view: DecisionView as unknown as typeof RecordView,
  },
  // Scaffolded documents (srs-web#141) have an RFC-013 Decision Log container whose
  // root record is a decision_log header; creating inside it must produce decisions.
  [DECISION_LOG_TYPE_ID]: {
    label: "Decision",
    icon: "⊕",
    typeVersion: 1,
    typeName: "decision_log",
    typeNamespace: "governance",
    memberTypeId: DECISION_TYPE_ID,
  },
};
