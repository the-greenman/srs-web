// Fixture data for the /styleguide route (srs-web#420). Plain objects typed against the
// component props; no SRS semantics (ADR-001) and never repository data.
import type { AgentStatus, AgentWrite } from "$lib/agent-activity";
import type { Annotation } from "$lib/annotations";
import type { Comment } from "$lib/comments";
import type { Layer } from "$lib/components/LayersPanel.svelte";
import type { PanelAgent } from "$lib/components/agent-panel";
import type { MenuAction, ToolbarAction } from "$lib/components/menu-action";
import { headerActions } from "$lib/essay/header-actions";
import type { GroupView } from "$lib/generic/RecordsView.svelte";
import { containerGraph, focusLayout } from "$lib/generic/map-layout";
import type { PairingResponse } from "$lib/mcp/relay-protocol";
import type { MethodDomain, MethodProblem, MethodRemedy } from "$lib/method/method-document";
import type { InstalledPackage } from "$lib/package-upgrade";
import { ShellState } from "$lib/shell-context.svelte";
import type { Actor, UpgradePackageResult } from "$lib/srs-client";

import type { DiscoveryHit } from "$lib/srs-client";
import type { StorageProviders } from "$lib/storage/index";
import type { Diagnostic, Status } from "$lib/types";

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

const act = (label: string, enabled = true, reason?: string): MenuAction => ({
  id: label.toLowerCase().replaceAll(" ", "-"),
  label,
  run: () => {},
  enabled,
  reason,
});
/** ActionBar (#532): three decisions, one disabled with its reason; and five, so two go in the ⋯. */
export const barActions: MenuAction[] = [
  act("Affirm"),
  act("Edit and affirm"),
  act("Set aside", false, "This repository has no Set aside container"),
];
export const barActionsMany: MenuAction[] = [...barActions, act("Edit"), act("Copy link")];

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
/** File attachments (RFC-017): one with a known size, one without (the core reports sizes with srs-rust#645). */
export const fileAnnotations: Annotation[] = [
  { kind: "comments", key: "fc", count: 0, label: "Opening" },
  {
    kind: "file",
    key: "file:d1",
    label: "interview-notes.md",
    icon: "file",
    text: "2 KB",
    documentId: "d1",
  },
  { kind: "file", key: "file:d2", label: "budget.csv", icon: "file", text: "", documentId: "d2" },
];

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
export const referenceItems = [
  {
    id: "r1",
    label: "Boundaries as relations",
    type: "source",
    paragraphs: [
      { id: "p1", label: "Opening" },
      { id: "p2", label: "The second claim" },
    ],
  },
  { id: "r2", label: "Nobody owns the edge", type: "claim", paragraphs: [] },
  // #519: a file row (kind, no link yet) and a URL row (kind + external link)
  { id: "r3", label: "call-transcript.md", type: "source", kind: "transcript", paragraphs: [] },
  {
    id: "r4",
    label: "https://example.org/small-democracy",
    type: "source",
    kind: "web",
    url: "https://example.org/small-democracy",
    paragraphs: [{ id: "p1", label: "Opening" }],
  },
];
/** Paragraphs the tray can link a reference to (#519). */
export const referenceParagraphs = [
  { id: "p1", label: "Opening" },
  { id: "p2", label: "The second claim" },
];

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
export const relays = [
  { id: "relay:a", label: "Test relay", url: "https://relay.example.org", isDefault: true },
  {
    id: "relay:b",
    label: `Long relay label ${LONG_WORD}`,
    url: `https://${LONG_WORD}.example.org`,
    isDefault: false,
  },
];
export const panelAgents: PanelAgent[] = [
  {
    conn: { id: "agent:alpha", relayId: "relay:a", lastConnectedAt: at(2) },
    name: "alpha",
    relayLabel: "Test relay",
    state: { status: "online", callerUrl: longCallerUrl, error: null },
    inUseElsewhere: false,
  },
  {
    conn: { id: "agent:beta", relayId: "relay:a" },
    name: "beta",
    relayLabel: "Test relay",
    state: { status: "rejected", callerUrl: null, error: longError },
    inUseElsewhere: false,
  },
  {
    conn: { id: "agent:gamma", relayId: "relay:b", lastConnectedAt: at(90) },
    name: longAgentName,
    relayLabel: relays[1].label,
    state: null,
    inUseElsewhere: false,
  },
  {
    conn: { id: "agent:delta", relayId: "relay:a" },
    name: "delta",
    relayLabel: "Test relay",
    state: null,
    inUseElsewhere: true,
  },
];
/** The AgentPanel specimen groups (#442): each is relays + agents, rendered at three widths. */
export const agentGroups = {
  none: {
    relays: [] as typeof relays,
    agents: [
      {
        ...panelAgents[3],
        conn: { id: "agent:seed" },
        relayLabel: "Relay missing",
        inUseElsewhere: false,
      },
    ],
  },
  empty: { relays: [relays[0]], agents: [] as PanelAgent[] },
  several: { relays, agents: [panelAgents[0], panelAgents[2], panelAgents[3]] },
  errors: {
    relays: [relays[0]],
    agents: [
      panelAgents[1],
      {
        ...panelAgents[1],
        conn: { id: "agent:eps", relayId: "relay:a" },
        name: "epsilon",
        state: { status: "error" as const, callerUrl: null, error: "relay bootstrap failed: 502" },
      },
    ],
  },
  pairing: {
    relays: [relays[0]],
    agents: [panelAgents[0]],
    pairing: {
      data: {
        code: "K7QPM-2XD4R",
        connectorUrl: "https://relay.example.com/v1/channels/ch1/call",
        expiresAt: NOW + 9 * 60_000 + 41_000,
      } as PairingResponse,
      error: null as string | null,
    },
  },
};
export const agentWidths = [
  ["20rem", "Rail 20rem"],
  ["18rem", "Rail 18rem"],
  ["16rem", "Narrow 16rem"],
] as const;
export const longDraftItems = [
  { id: "ld1", label: longLabel },
  { id: "ld2", label: "Short" },
];
export const longBinItems = [{ id: "lx1", label: longLabel }];
/** A web source in the pinned pane (#519): the URL as an external link, no relation to unlink. */
export const urlPinned = [
  {
    id: "up1",
    kind: "source",
    relation: "web",
    title: "https://example.org/small-democracy",
    text: "",
    href: "https://example.org/small-democracy",
    removable: false,
  },
];
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
/** Fake storage providers for the Landing specimens (#534); every handler is a no-op. */
const provider = (label: string, configured: boolean) => ({
  configured,
  label,
  authenticate: async () => {},
  open: async () => {
    throw new Error("Specimen only.");
  },
});
export const landingProviders = (configured: boolean) =>
  ({
    dropbox: provider("Dropbox", configured),
    googleDrive: provider("Google Drive", configured),
    github: provider("GitHub", configured),
  }) as unknown as StorageProviders;

export const componentTokens = [
  "--agent-panel-gap",
  "--agent-panel-row-pad",
  "--agent-panel-row-gap",
  "--agent-panel-dot-size",
  "--agent-panel-name-size",
  "--agent-panel-meta-size",
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
  "--srs-mark-ink",
  "--srs-mark-paper",
  "--srs-mark-line",
];

/** The essay header registry with no-op handlers: Save enabled, Comments `mixed`, Margin notes off. */
const nop = () => {};
export const toolbarActions = headerActions(
  {
    onnew: nop,
    oncopy: nop,
    onhelp: nop,
    oncomments: nop,
    onsave: nop,
    onexport: nop,
    onexportmd: nop,
    onexplorer: nop,
    onopenagents: nop,
    onopenanother: nop,
  },
  { shell: new ShellState({ wideEnabled: true }), comments: "mixed", saving: false, dirty: true }
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

/** The shell specimen (#424): a nav of two groups with a count, an inspector of two panels, a badge. */
export const shellFixture = {
  repo: "Small democracy",
  /** A long breadcrumb: the document bar's title slot, ellipsised beside the single Save primary (#463). */
  crumb: [
    { label: "Small democracy" },
    { label: "Articles", onclick: nop },
    { label: "How a decision is reopened after the review period closes" },
  ],
  navGroups: [
    {
      label: "Sections",
      items: [
        { label: "Articles", count: 12, active: true },
        { label: "Roles", count: 4, active: false },
      ],
    },
    {
      label: "Repository",
      items: [
        { label: "Decision log", count: 31, active: false },
        { label: "Migrations", count: undefined, active: false },
      ],
    },
  ],
  panels: [
    { title: "Record", aside: 1, body: "Article 3: How a decision is reopened." },
    { title: "Validation", aside: 0, body: "No problems found." },
  ],
  badge: 3,
  mainLine: "The main column holds one line here; the bar above carries both drawer triggers.",
};

/** Diagnostics for the notices specimens: a repeated message so a count shows. */
export const noticeDiagnostics: Diagnostic[] = [
  ...Array.from({ length: 3 }, () => ({
    severity: "warn" as const,
    message: "[R23] computed heading level 7 exceeds 6 for format 'html'; clamped to 6",
  })),
  { severity: "warn", message: "[section:essay] container not found; rendering section as empty" },
  { severity: "error", message: "view dispatch failed for type governance/decision_log" },
];

/**
 * A package upgrade plan (UpgradePlan specimen, #450): two definitions an earlier bundle proved
 * unmodified, one unproven (opt-in replace) and one kept local edit.
 */
export const upgradePlan: UpgradePackageResult = {
  packageId: "5b14a4d4-ec08-4e5b-be75-c183aec90c40",
  name: "essay",
  previousVersion: "1.5.0",
  version: "1.7.0",
  upgraded: false,
  dryRun: true,
  added: [{ kind: "field", id: "f1", version: 1, name: "purpose" }],
  newVersions: [{ kind: "type", id: "t1", version: 2, name: "document-state" }],
  updated: [
    { kind: "type", id: "t3", version: 1, name: "comment", provenBy: "1.5.0" },
    { kind: "field", id: "f2", version: 1, name: "comment_text", provenBy: "1.5.0" },
  ],
  unchanged: [{ kind: "field", id: "f3", version: 1, name: "title" }],
  repaired: [],
  conflicts: [
    { kind: "type", id: "t4", version: 1, name: "reference", conflictKind: "no-reference-copy" },
    { kind: "type", id: "t2", version: 1, name: "paragraph", conflictKind: "local-edit" },
  ],
  removedUpstream: [],
  dependencyWarnings: [],
  notes: [],
};

/** Bundled packages installed in a document (PackagesDialog specimen, #450): one outdated, one current. */
export const installedPackagesFx: InstalledPackage[] = [
  { packageId: "p1", name: "essay", bundled: "1.7.0", installed: "1.5.0", outdated: true },
  { packageId: "p2", name: "governance", bundled: "2.1.0", installed: "2.1.0", outdated: false },
];
/** A read-only document's toolbar (#471): no Save; Save a copy… sits in the Document menu beside Export. */
export const readOnlyToolbarActions: ToolbarAction[] = [
  { id: "export", group: "document", kind: "action", label: "Export", run: nop, enabled: true },
  {
    id: "save-copy",
    group: "document",
    kind: "action",
    label: "Save a copy…",
    run: nop,
    enabled: true,
    testid: "specimen-save-copy",
  },
  { id: "other", group: "go", kind: "action", label: "Open another", run: nop, enabled: true },
];

// ── Records explorer and relation map (#481): invented content, no repository data ──────────────────

const hitOf = (i: number, typeName: string, extra: Partial<DiscoveryHit> = {}): DiscoveryHit => ({
  instanceId: `fx-${typeName}-${i}`,
  label: `Sample ${typeName} ${i}`,
  typeNamespace: "com.example.spec",
  typeName,
  matchedFields: [],
  ...extra,
});

/** Grouped by type: collapsed groups with counts, one open with a "Show more", and a Notes group. */
export const recordGroups: GroupView[] = [
  {
    key: "t1",
    name: "mechanism",
    namespace: "com.example.spec",
    count: 175,
    open: true,
    hits: [
      hitOf(1, "mechanism", {
        label: "Manifest extensions (`ext:slices`)",
        lifecycleState: "draft",
      }),
      hitOf(2, "mechanism", {
        label:
          "A long mechanism title that wraps onto a second line when the column is narrow, as real titles do",
      }),
      hitOf(3, "mechanism"),
    ],
  },
  {
    key: "t2",
    name: "invariant",
    namespace: "com.example.spec",
    count: 128,
    open: false,
    hits: [],
  },
  {
    key: "t3",
    name: "rfc-proposed-artifact",
    namespace: "com.example.spec",
    count: 17,
    open: false,
    hits: [],
  },
  { key: "__notes__", name: "Notes", namespace: "", count: 27, open: false, hits: [] },
];

/** A ranked search: type and state per row, with the matching snippet where it differs from the label. */
export const recordSearchHits: DiscoveryHit[] = [
  hitOf(1, "concept", { label: "Travelling form", score: 9.9, snippet: "Travelling form" }),
  hitOf(2, "concept", {
    label: "What a container can hold, a bundle can carry",
    score: 8.4,
    lifecycleState: "ratified",
    snippet: "...the travelling form of a repository is a bundle that carries its container...",
  }),
  hitOf(3, "design-note", { label: "Portability and `Possession`", score: 6.7 }),
  {
    instanceId: "fx-note",
    label: "A note about forms",
    typeNamespace: "",
    typeName: "",
    matchedFields: [],
  },
];

const nb = (id: string, label: string, relationType: string, direction: "in" | "out") => ({
  id,
  label,
  relationType,
  direction,
});

/** Both directions: inbound on the left, outbound on the right, grouped by relation type. */
export const focusMap = {
  focus: { id: "fx-focus", label: "Extensions" },
  layout: focusLayout([
    nb("a", "Reading this specification", "contains", "in"),
    nb("b", "Foundations", "refines", "in"),
    nb("c", "Generated reference: View", "contains", "out"),
    nb("d", "Import Tracking", "contains", "out"),
    nb("e", "Addressability", "contains", "out"),
    nb(
      "f",
      "A long neighbour title that wraps to two lines and then truncates with an ellipsis",
      "depends-on",
      "out"
    ),
    nb("g", "Views L2", "depends-on", "out"),
  ]),
};

/** One-directional focus: the focus sits toward the empty side. */
export const outboundOnlyMap = {
  focus: { id: "fx-focus", label: "The case" },
  layout: focusLayout(
    Array.from({ length: 12 }, (_, i) =>
      nb(`o${i}`, `Claim number ${i + 1} under this topic`, "contains", "out")
    )
  ),
};

/** A container's first 24 members in outline order, of 41. */
export const cappedContainerMap = containerGraph(
  Array.from({ length: 41 }, (_, i) => ({
    id: i === 0 ? "hub" : `leaf${i}`,
    label: i === 0 ? "Hub record" : `Leaf ${i}`,
  })),
  Array.from({ length: 40 }, (_, i) => ({
    relationId: `r${i}`,
    relationType: "contains",
    source: "hub",
    target: `leaf${i + 1}`,
  }))
);

/** AttachDrop: a forced rejection list (#503). */
export const attachRejected = [
  { name: "photo.png", reason: "not a text file (image/png)" },
  { name: "transcript.txt", reason: "1.4 MB is over the 1 MB limit" },
];
export const MB = 1024 * 1024;

// Method board (srs-web#526): problems in each status, with and without links, one long title.
const problem = (p: Partial<MethodProblem> & { id: string; title: string }): MethodProblem => ({
  entity: "problem",
  problemId: "",
  statement: "",
  kind: "",
  imbalance: "",
  personas: [],
  sources: [],
  status: "suggested",
  commentCount: 0,
  ...p,
});
export const methodProblems: MethodProblem[] = [
  problem({
    id: "mp1",
    problemId: "SP-1",
    title: "A document cannot leave the editor and return",
    statement:
      "Export gives the writer markdown and a snapshot, but nothing comes back. Work edited elsewhere cannot return, so leaving the editor is a one way door.",
    kind: "condition",
    personas: [{ id: "per-w", label: "Writer", entity: "persona" }],
    sources: ["semanticops.com#21", "semanticops.com#29"],
    createdBy: agents[0],
    commentCount: 3,
  }),
  problem({
    id: "mp2",
    problemId: "SP-2",
    title: "Suggestions pile up unseen",
    statement: "Agent suggestions wait in a queue nobody reads.",
    kind: "consequence",
    imbalance: "missing",
    side: {
      id: "pole",
      label: "Testimony",
      tradeOff: { id: "ten", label: "Testimony and authority" },
    },
    personas: [{ id: "per-o", label: "Owner", entity: "persona" }],
    sources: ["https://example.org/notes"],
    createdBy: agents[1],
    status: "affirmed",
  }),
  problem({
    id: "mp3",
    problemId: "SP-30",
    title: "A very long problem title that wraps across two or three lines in a narrow column",
    statement: "Unattributed and set aside.",
    kind: "belief",
    status: "set-aside",
  }),
];
export const methodDomains: MethodDomain[] = [
  {
    id: "d1",
    title: "Writing and review",
    clusters: [{ id: "c1", title: "Leaving the editor", problems: methodProblems }],
  },
];

// Remedies under a problem (srs-web#541): one with every field, one bare and set aside.
export const methodRemedies: MethodRemedy[] = [
  {
    entity: "remedy",
    id: "mr1",
    title: "A return path for edited documents",
    move: "Let a document edited elsewhere come back as a new version.",
    doesNotFix: "Merging two people's edits to the same paragraph.",
    falsifier: "Writers still export and never return after a month.",
    returnWhen: "Round trips are routine and the next gap is conflicts.",
    sources: [],
    answers: [{ id: "mp1", label: "A document cannot leave the editor and return" }],
    createdBy: agents[0],
    status: "suggested",
    commentCount: 0,
  },
  {
    entity: "remedy",
    id: "mr2",
    title: "Weekly digest",
    move: "",
    doesNotFix: "",
    falsifier: "",
    returnWhen: "",
    sources: [],
    answers: [],
    status: "set-aside",
    commentCount: 0,
  },
];
export const methodLinks = [
  { id: "pc1", label: "Owner", entity: "persona" as const, status: "affirmed" as const },
  { id: "pc2", label: "Writer", entity: "persona" as const, status: "suggested" as const },
  { id: "pc3", label: "Reviewer", entity: "persona" as const, status: null },
];
