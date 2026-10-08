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
export { default as Drawer } from "./Drawer.svelte";
export { default as InspectorTrigger } from "./InspectorTrigger.svelte";
export { default as NavTrigger } from "./NavTrigger.svelte";
export { default as ResizeHandle } from "./ResizeHandle.svelte";
export { default as Main } from "./Main.svelte";
export { default as Workspace } from "./Workspace.svelte";

// Navigation rail
export { default as Wordmark } from "./Wordmark.svelte";
export { default as Nav } from "./Nav.svelte";
export { default as NavGroup } from "./NavGroup.svelte";
export { default as NavItem } from "./NavItem.svelte";

// Inspector rail
export { default as Inspector } from "./Inspector.svelte";
export { default as Meta } from "./Meta.svelte";

// Content / records
export { default as Card } from "./Card.svelte";
export { default as CardField } from "./CardField.svelte";
export { default as LogTable } from "./LogTable.svelte";
export { default as DecisionSummaryCard } from "./DecisionSummaryCard.svelte";
export { default as MethodBoard } from "./MethodBoard.svelte";
export { default as ProblemCard } from "./ProblemCard.svelte";
export { default as DecisionLogView } from "./DecisionLogView.svelte";

// Forms
export { default as Field } from "./Field.svelte";
export { default as FieldInput } from "./FieldInput.svelte";
export { default as Input } from "./Input.svelte";
export { default as Checkbox } from "./Checkbox.svelte";
export { default as Modal } from "./Modal.svelte";
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
export { default as IconButton } from "./IconButton.svelte";
export { default as Diagnostics } from "./Diagnostics.svelte";
export { default as AttachDrop } from "./AttachDrop.svelte";
export { default as RepoSize } from "./RepoSize.svelte";
export { default as Notice } from "./Notice.svelte";
export { default as NoticeRegion } from "./NoticeRegion.svelte";
export { default as Toast } from "./Toast.svelte";
export { default as ToastHost } from "./ToastHost.svelte";
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
export { default as AgentPanel } from "./AgentPanel.svelte";
export { default as Disclosure } from "./Disclosure.svelte";
export type { PanelAgent } from "./agent-panel.js";

// Essay editor writing surface (srs-web#328)
export { default as Block } from "./Block.svelte";
export { default as BlockStack } from "./BlockStack.svelte";
export { default as LayersPanel } from "./LayersPanel.svelte";
export { default as ActionMenu } from "./ActionMenu.svelte";
export { default as Toolbar } from "./Toolbar.svelte";
export { default as BinTray } from "./BinTray.svelte";
export { default as ReferencesTray } from "./ReferencesTray.svelte";
export { default as MarkdownHelp } from "./MarkdownHelp.svelte";
export { default as MarkdownText } from "./MarkdownText.svelte";
export { default as Panel } from "./Panel.svelte";
export { default as Popover } from "./Popover.svelte";
export { default as AttachmentPreview } from "./AttachmentPreview.svelte";
export { default as TrayRow } from "./TrayRow.svelte";
export { default as DraftTray } from "./DraftTray.svelte";
export { default as CommentThread } from "./CommentThread.svelte";
export { default as EyeToggle } from "./EyeToggle.svelte";
export { default as InlineText } from "./InlineText.svelte";

// Attachments (srs-web#329)
export { default as AttachmentGlyph } from "./AttachmentGlyph.svelte";
export { default as ActorChip } from "./ActorChip.svelte";
export { default as ActorMark } from "./ActorMark.svelte";
export { default as ActorStack } from "./ActorStack.svelte";
export { default as AgentPresence } from "./AgentPresence.svelte";
export { default as AgentFeed } from "./AgentFeed.svelte";
export { default as CommentBadge } from "./CommentBadge.svelte";
export { default as AnnotationMargin } from "./AnnotationMargin.svelte";
export { default as HoverCard } from "./HoverCard.svelte";
export { default as PinnedPane } from "./PinnedPane.svelte";
