// ============================================================================
// srs-web component library — barrel export.
// Thin Svelte 5 wrappers over the global modular CSS design system
// (../../styles). Styling lives in CSS @layers; these components apply the
// BEM classes and provide typed props. Presentation only (ADR-001).
//
// Track B foundation — B1: https://github.com/the-greenman/srs-web/issues/2
// ============================================================================

// Layout shell
export { default as AppShell } from "./AppShell.svelte";
export { default as Breadcrumb } from "./Breadcrumb.svelte";
export { default as Main } from "./Main.svelte";
export { default as Topbar } from "./Topbar.svelte";
export { default as Workspace } from "./Workspace.svelte";

// Navigation rail
export { default as Nav } from "./Nav.svelte";
export { default as NavGroup } from "./NavGroup.svelte";
export { default as NavItem } from "./NavItem.svelte";

// Inspector rail
export { default as Inspector } from "./Inspector.svelte";
export { default as InspectorSection } from "./InspectorSection.svelte";
export { default as Meta } from "./Meta.svelte";

// Content / records
export { default as Card } from "./Card.svelte";
export { default as CardField } from "./CardField.svelte";
export { default as LogTable } from "./LogTable.svelte";
export { default as DecisionSummaryCard } from "./DecisionSummaryCard.svelte";
export { default as DecisionLogView } from "./DecisionLogView.svelte";

// Forms
export { default as Field } from "./Field.svelte";
export { default as FieldInput } from "./FieldInput.svelte";
export { default as Input } from "./Input.svelte";
export { default as Textarea } from "./Textarea.svelte";
export { default as Select } from "./Select.svelte";
export { default as SaveBar } from "./SaveBar.svelte";

// View selection
export { default as ViewPicker } from "./ViewPicker.svelte";

// Decision link picker modal
export { default as DecisionLinkPicker } from "./DecisionLinkPicker.svelte";

// Repository tools (ADR-014)
export { default as Migrations } from "./Migrations.svelte";

// Status / actions / validation
export { default as SrsMark } from "./SrsMark.svelte";
export { default as Tag } from "./Tag.svelte";
export { default as TagChip } from "./TagChip.svelte";
export { default as Button } from "./Button.svelte";
export { default as Diagnostics } from "./Diagnostics.svelte";
export { default as Lifecycle } from "./Lifecycle.svelte";

// Shared types
export type {
  BreadcrumbItem,
  Status,
  ButtonVariant,
  DiagnosticSeverity,
  Diagnostic,
  LifecycleTransition,
} from "../types";

// MCP relay connection (srs-web#307)
export { default as McpConnection } from "./McpConnection.svelte";

// Essay editor writing surface (srs-web#328)
export { default as Block } from "./Block.svelte";
export { default as BlockStack } from "./BlockStack.svelte";
export { default as LayersPanel } from "./LayersPanel.svelte";
export { default as DraftTray } from "./DraftTray.svelte";
export { default as CommentThread } from "./CommentThread.svelte";
export { default as EyeToggle } from "./EyeToggle.svelte";

// Attachments (srs-web#329)
export { default as AttachmentGlyph } from "./AttachmentGlyph.svelte";
export { default as HoverCard } from "./HoverCard.svelte";
export { default as PinnedPane } from "./PinnedPane.svelte";
