// Fixture data for the /styleguide route (srs-web#420). Plain objects typed against the
// component props; no SRS semantics (ADR-001) and never repository data.
import type { AgentStatus, AgentWrite } from "$lib/agent-activity";
import type { Layer } from "$lib/components/LayersPanel.svelte";
import type { MenuAction } from "$lib/components/menu-action";
import type { Annotation } from "$lib/essay/annotations";
import type { Actor } from "$lib/srs-client";
import type { Status } from "$lib/types";

export const NOW = Date.parse("2026-10-04T12:00:00Z");

export const human: Actor = { kind: "human", id: "human-ada", name: "Ada" };
export const agents: Actor[] = [
  { kind: "ai", id: "agent-scribe", name: "Scribe" },
  { kind: "ai", id: "agent-critic", name: "Critic" },
  { kind: "ai", id: "agent-linker", name: "Linker" },
];
/** An unattributed author is no actor at all. */
export const unattributed: Actor | undefined = undefined;
export const manyActors: Actor[] = [
  human,
  ...agents,
  { kind: "human", id: "human-bo", name: "Bo" },
  { kind: "ai", id: "agent-mapper", name: "Mapper" },
  { kind: "ai", id: "agent-checker", name: "Checker" },
];

export const statuses: Status[] = [
  "draft",
  "proposed",
  "active",
  "deferred",
  "superseded",
  "closed",
  "rejected",
  "archived",
  "ratified",
  "abandoned",
];

export const menuActions: MenuAction[] = [
  { id: "rename", label: "Rename", run: () => {}, enabled: true },
  { id: "hide", label: "Hide", run: () => {}, enabled: true },
  { id: "delete", label: "Delete", run: () => {}, enabled: false },
];

export const annotations: Annotation[] = [
  { kind: "comments", key: "c", count: 3, label: "3 comments" },
  {
    kind: "attachment",
    key: "a",
    label: "Budget sheet",
    icon: "spreadsheet",
    text: "Q3 budget figures.",
    relation: "evidences",
  },
  { kind: "relation", key: "r", label: "Opening", icon: "refines", direction: "out" },
  { kind: "shared", key: "s", label: "Shared with Critic", actor: agents[1] },
];

export const comments = [
  { id: "1", text: "This paragraph needs a source.", author: agents[1] },
  { id: "2", text: "Added one from the budget sheet.", author: agents[0] },
  { id: "3", text: "Thanks, looks right.", author: human },
];

export const layers: Layer[] = [
  {
    id: "l1",
    depth: 0,
    label: "Opening",
    hidden: false,
    inherited: false,
    hasChildren: true,
    folded: false,
  },
  {
    id: "l2",
    depth: 1,
    label: "Background",
    hidden: true,
    inherited: false,
    hasChildren: false,
    folded: false,
  },
  {
    id: "l3",
    depth: 1,
    label: "Detail",
    hidden: false,
    inherited: true,
    hasChildren: false,
    folded: false,
  },
  {
    id: "l4",
    depth: 0,
    label: "Conclusion",
    hidden: false,
    inherited: false,
    hasChildren: false,
    folded: false,
  },
];

export const stackItems = [
  { id: "b1", depth: 0 },
  { id: "b2", depth: 1 },
  { id: "b3", depth: 0 },
];
export const stackText: Record<string, { title: string; body: string }> = {
  b1: { title: "Opening", body: "A **short** opening paragraph." },
  b2: { title: "Background", body: "Nested one level, with a [link](https://example.com)." },
  b3: { title: "Conclusion", body: "- one\n- two" },
};

export const draftItems = [
  { id: "d1", label: "Spare idea" },
  { id: "d2", label: "Old intro" },
];
export const binItems = [{ id: "x1", label: "Deleted paragraph" }];

export const pinned = [
  {
    id: "p1",
    kind: "note",
    relation: "evidences",
    title: "Interview notes",
    text: "Key quote: **we need this**.",
  },
];

const writes: AgentWrite[] = [
  {
    seq: 3,
    agentId: "agent-scribe",
    tool: "record_update",
    changed: [{ target: "instance", id: "b1", kind: "updated" }],
    instanceId: "b1",
    at: NOW - 120_000,
  },
  {
    seq: 2,
    agentId: "agent-critic",
    tool: "note_create",
    changed: [{ target: "instance", id: "b2", kind: "created" }],
    instanceId: "b2",
    at: NOW - 600_000,
  },
  {
    seq: 1,
    agentId: "agent-linker",
    tool: "relation_create",
    changed: [{ target: "relation", id: "rel1", kind: "created" }],
    at: NOW - 3_600_000,
  },
];
export const agentStatus: AgentStatus = {
  connected: 2,
  total: 3,
  agents: [
    { id: "agent-scribe", name: "Scribe", status: "online" },
    { id: "agent-critic", name: "Critic", status: "online" },
    { id: "agent-linker", name: "Linker", status: "offline" },
  ],
  writes,
};
export const paragraphLabel = (id: string) => stackText[id]?.title;

export const swatches = [
  "--color-bg",
  "--color-surface",
  "--color-page",
  "--color-text",
  "--color-text-strong",
  "--color-muted",
  "--color-muted-strong",
  "--color-line",
  "--color-line-soft",
  "--color-line-strong",
  "--color-nav-bg",
  "--color-focus",
  "--color-on-accent",
  "--color-surface-raised",
  "--color-hover",
  "--color-on-dark",
  "--color-error",
  "--color-warn",
  "--color-success",
  "--black",
  "--paper",
  "--grey-1",
  "--grey-2",
  "--grey-3",
  "--grey-4",
  "--ink",
];
export const sizes = [
  "--size-xs",
  "--size-sm",
  "--size-base",
  "--size-md",
  "--size-lg",
  "--size-xl",
];
export const radii = ["--radius-sm", "--radius-md", "--radius-pill"];
export const spaces = ["--space-xs", "--space-sm", "--space-md", "--space-lg", "--space-xl"];

// Long text, so a rail component that cannot wrap shows itself at 18rem and 15rem (srs-web#421).
export const LONG_WORD =
  "Supercalifragilisticexpialidocious-and-an-unbreakable-identifier-0123456789";
export const longLabel = `A very long paragraph title that must truncate or wrap rather than widen the rail ${LONG_WORD}`;
export const longRepoName = `The Limehouse Town Hall Working Group Governance Repository (${LONG_WORD})`;
export const longCallerUrl = `https://relay.example.org/v1/mcp/${LONG_WORD}/0000-1111-2222-3333-4444-5555-6666-7777/session`;
export const longError = `Connection refused: another tab holds it, or the relay rejected this page origin (executor_origin_forbidden). ${LONG_WORD}`;
export const longAgentName = `Scribe agent for the quarterly governance review ${LONG_WORD}`;
export const longDraftItems = [
  { id: "ld1", label: longLabel },
  { id: "ld2", label: "Short" },
];
export const longBinItems = [{ id: "lx1", label: longLabel }];
export const longPinned = [
  {
    id: "lp1",
    kind: "spreadsheet",
    relation: "evidences",
    title: `Budget workbook ${LONG_WORD}`,
    text: `Quarterly figures ${LONG_WORD} ${LONG_WORD}`,
  },
];
export const longComments = [
  {
    id: "lc1",
    text: `A comment with an unbreakable run: ${LONG_WORD} ${LONG_WORD}`,
    author: agents[1],
  },
];
export const longLayers = fxLongLayers();
function fxLongLayers(): Layer[] {
  return [
    {
      id: "ll1",
      depth: 0,
      label: longLabel,
      hidden: false,
      inherited: false,
      hasChildren: true,
      folded: false,
    },
    {
      id: "ll2",
      depth: 1,
      label: "Child",
      hidden: false,
      inherited: false,
      hasChildren: false,
      folded: false,
    },
  ];
}

/** Component tokens listed in the Tokens section (names only; values are read from the page). */
export const componentTokens = [
  "--btn-bg",
  "--btn-fg",
  "--btn-border",
  "--btn-hover-border",
  "--btn-hover-fg",
  "--btn-primary-bg",
  "--btn-primary-fg",
  "--btn-primary-hover-bg",
  "--btn-sm-padding",
  "--btn-sm-size",
  "--icon-btn-fg",
  "--icon-btn-hover-fg",
  "--icon-btn-hover-bg",
  "--icon-btn-border",
  "--popover-bg",
  "--popover-border",
  "--popover-shadow",
  "--hue-pill-s",
  "--hue-pill-s-bg",
  "--hue-pill-s-solid",
  "--hue-pill-l-border",
  "--hue-pill-l-bg",
  "--hue-pill-l-fg",
  "--hue-pill-l-solid",
  "--actor-mark-size",
  "--actor-mark-size-sm",
  "--actor-mark-radius-human",
  "--actor-mark-radius-ai",
  "--actor-mark-notch",
  "--actor-stack-overlap",
];
