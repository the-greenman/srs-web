// ============================================================================
// Shared presentation types for the srs-web Svelte component library.
// Mirrors the governance vocabulary from the SRS package — presentation only,
// no SRS semantics live here (ADR-001). The authoritative shapes come from the
// WASM payload schemas (srs-rust/crates/srs-cli/schemas/payload/) at runtime.
//
// Track B foundation — B1: https://github.com/the-greenman/srs-web/issues/2
// ============================================================================

/** The governance/status enum — see gallery package field status-aee7afe9.json. */
export type Status =
  | "draft"
  | "proposed"
  | "active"
  | "deferred"
  | "superseded"
  | "closed"
  | "rejected"
  | "archived"
  | "ratified"
  | "abandoned";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "mono";

export type DiagnosticSeverity = "error" | "warn" | "info";

/** One entry from the CLI/WASM `diagnostics[]` array. */
export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** Where the finding applies, e.g. "field: governance/context". */
  where?: string;
}

/** One level in a Topbar breadcrumb trail. */
export interface BreadcrumbItem {
  label: string;
  /** Tooltip shown on hover (e.g. "Opened from local"). */
  title?: string;
  /** If present, renders the item as a clickable button that calls this handler. */
  onclick?: () => void;
}

/** A legal lifecycle transition out of the current status (B11). */
export interface LifecycleTransition {
  to: Status;
  /** True when the transition spawns a successor record (supersede/amend). */
  successor?: boolean;
}

/**
 * A relation type option for the DecisionLinkPicker dropdown.
 * Mapped from the core's `listRelationTypes(repo)` (srs-client).
 */
export interface RelationTypeOption {
  /** Relation type key as installed in the package (e.g. "precedes"). */
  value: string;
  /** Human-readable label from the package definition (e.g. "Precedes"). */
  label: string;
}
