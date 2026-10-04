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
export const unattributed: Actor = { kind: "human", id: "anon" };

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
  "--color-muted",
  "--color-line",
  "--color-line-soft",
  "--color-line-strong",
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
export const spaces = ["--space-xs", "--space-sm", "--space-md", "--space-lg", "--space-xl"];
