// Fixture data for the /styleguide route (srs-web#420). Plain objects typed against the
// component props; no SRS semantics (ADR-001) and never repository data.
import type { AgentStatus, AgentWrite } from "$lib/agent-activity";
import type { Annotation } from "$lib/annotations";
import type { Comment } from "$lib/comments";
import type { Layer } from "$lib/components/LayersPanel.svelte";
import type { MenuAction } from "$lib/components/menu-action";
import { headerActions } from "$lib/essay/header-actions";
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

export const comments: Comment[] = [
  {
    id: "1",
    text: "This paragraph needs a source.",
    createdAt: "2026-10-04T11:40:00Z",
    author: agents[1],
  },
  {
    id: "2",
    text: "Added one from the budget sheet.",
    createdAt: "2026-10-04T11:52:00Z",
    author: agents[0],
  },
  { id: "3", text: "Thanks, looks right.", createdAt: "2026-10-04T11:58:00Z", author: human },
];

const att = (i: number, icon: string, label: string, actor?: Actor): Annotation => ({
  kind: "attachment",
  key: `att${i}`,
  label,
  icon,
  text: `Preview of ${label}.`,
  relation: "evidences",
  actor,
});
const rel = (
  i: number,
  icon: string,
  label: string,
  direction: "out" | "in",
  actor?: Actor
): Annotation => ({
  kind: "relation",
  key: `rel${i}`,
  label,
  icon,
  direction,
  actor,
});
const KINDS = [
  "note",
  "source",
  "problem",
  "claim",
  "counter-claim",
  "spreadsheet",
  "document",
  "image",
  "link",
  "mystery",
];
/** A paragraph's annotations: 0, 1, 4 or 10 of them (the first is always the comments row). */
export const annotationSet = (n: number): Annotation[] => {
  const comments: Annotation = {
    kind: "comments",
    key: "c",
    count: n === 0 ? 0 : 3,
    label: "Opening",
  };
  if (n <= 1) return [comments];
  const rest: Annotation[] = [
    ...KINDS.slice(0, 6).map((k, i) =>
      att(i, k, `A ${k} attached by ${agents[i % 3].name}`, agents[i % 3])
    ),
    rel(1, "refines", "Background", "out", human),
    rel(2, "supersedes", "Conclusion", "in", agents[1]),
    { kind: "shared", key: "s", label: "Shared with Critic" },
  ];
  return [comments, ...rest.slice(0, n - 1)];
};
const LONG_LABEL =
  "An unusually long attached note title that must wrap onto two lines and then clamp, never spilling out of the margin";
/** Long labels on every row kind. */
export const longLabelAnnotations: Annotation[] = [
  { kind: "comments", key: "c", count: 12, label: "Opening" },
  att(1, "source", LONG_LABEL, agents[0]),
  att(2, "mystery", "unbrokenrunofcharacters".repeat(6), undefined),
  rel(1, "derived-from", LONG_LABEL, "in", human),
  { kind: "shared", key: "s", label: `Also in ${LONG_LABEL}` },
];

const at = (min: number) => new Date(NOW - min * 60_000).toISOString();
const c = (id: string, text: string, min: number, author?: Actor): Comment => ({
  id,
  text,
  createdAt: at(min),
  author,
});
const REVIEW = [
  "**Review of the opening paragraph.** The argument is clear, but three claims need support before it can stand.",
  "",
  "1. The first sentence asserts that small groups decide faster. *Which* groups, and measured how?",
  "2. The second names a cost without a source.",
  "3. The conclusion repeats the premise.",
  "",
  "Suggested sources: the budget workbook, the 2024 meeting notes, and the interview with the clerk. Each of them bears directly on the first claim, and the workbook also answers the second one if you read the Q3 tab.",
  "",
  "A longer paragraph follows so this comment is certain to exceed the six-line clamp. ".repeat(6),
].join("\n");
export const annotatedItems = [0, 1, 4, 10].map((n) => ({ id: `ann${n}`, depth: 0 }));
/** One long agent review, then short replies. */
export const reviewThread: Comment[] = [
  c("r1", REVIEW, 190, agents[1]),
  c("r2", "Added the workbook as a source.", 150, agents[0]),
  c("r3", "Thanks, that covers it.", 140, human),
];
/** 25 comments: older ones sit behind "earlier comments". */
export const manyComments: Comment[] = Array.from({ length: 25 }, (_, i) =>
  c(
    `m${i}`,
    i === 0 ? "The thread starts here." : `Reply number ${i}`,
    600 - i * 20,
    i % 3 === 2 ? human : agents[i % 2]
  )
);
/** Consecutive comments by one actor share one chip. */
export const runComments: Comment[] = [
  c("u1", "First from Scribe.", 50, agents[0]),
  c("u2", "Second from Scribe.", 49, agents[0]),
  c("u3", "Third from Scribe.", 48, agents[0]),
  c("u4", "Ada replies.", 40, human),
  c("u5", "Ada again.", 39, human),
  c("u6", "Critic weighs in.", 30, agents[1]),
  c("u7", "Unattributed note.", 20),
  c("u8", "Another unattributed note.", 19),
];
/** Markdown renders; raw HTML shows as text. */
export const markdownComments: Comment[] = [
  c(
    "k1",
    "**Bold**, *italic*, `code`, and a [link](https://example.com).\n\n- one\n- two",
    10,
    agents[0]
  ),
  c("k2", "<script>alert(1)</script> and <img src=x onerror=alert(2)> stay inert.", 5, agents[1]),
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
export const longComments: Comment[] = [
  {
    id: "lc1",
    text: `A comment with an unbreakable run: ${LONG_WORD} ${LONG_WORD}`,
    createdAt: "",
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
  "--toolbar-bg",
  "--toolbar-border",
  "--toolbar-gap",
  "--toolbar-pad",
  "--toolbar-title-size",
  "--toolbar-title-max",
  "--block-tools-bg",
  "--block-tools-border",
  "--block-tools-shadow",
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
  "--margin-width",
  "--margin-width-wide",
  "--margin-mark-size",
  "--margin-label-lines",
  "--comment-thread-max",
  "--comment-clamp-lines",
  "--comment-composer-max",
];

/** The essay header registry with no-op handlers: Save enabled, Comments `mixed`, Margin notes off. */
const nop = () => {};
export const toolbarActions = headerActions(
  {
    onnew: nop,
    oncopy: nop,
    onagent: nop,
    onhelp: nop,
    onvariant: nop,
    oncomments: nop,
    onsave: nop,
    onexport: nop,
    onexportmd: nop,
    onexplorer: nop,
    onopenanother: nop,
  },
  { expanded: false, comments: "mixed", saving: false, dirty: true }
);

/** Paragraph strip specimens: one-line, titled, and a long title the strip may cover the end of. */
export const stripText = {
  oneLine: { title: "", body: "A one-line paragraph." },
  titled: { title: "Claim", body: "A titled paragraph with a neighbour." },
  longTitle: {
    title: "A very long paragraph title that runs under the hover strip at the end of the row",
    body: "The strip may cover the end of a long title; that is accepted.",
  },
};
