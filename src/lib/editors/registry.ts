import type { AgentPanelCtx, AgentStatus } from "$lib/agent-activity.js";
import EssayShell from "$lib/essay/EssayShell.svelte";
import { newEssay } from "$lib/essay/essay-document.js";
import { ESSAY_TYPE_ID } from "$lib/essay/type-registry.js";
import GovernanceShell from "$lib/governance/GovernanceShell.svelte";
import { DECISION_TYPE_ID } from "$lib/governance/type-registry.js";
import GuidesShell from "$lib/guides/GuidesShell.svelte";
import { bundledPackage } from "$lib/packages/bundles.js";
import {
  type AgentWriteGuard,
  type PackageRequirement,
  REQUIREMENT_MISSING,
  type RequirementOutcome,
  type SrsRepository,
  type TypeSummary,
  checkPackageRequirements,
  createGovernanceDocument,
  installBundles,
} from "$lib/srs-client.js";
/**
 * The one editor registry (srs-web#338).
 *
 * An EditorDefinition is presentation wiring, not repository interpretation: the Rust
 * engine supplies the resolved types; this registry decides which Svelte shell may be
 * offered for a known contract. Availability is keyed on UUID identity (`entryTypeId`),
 * never on a namespace/name label. Adding an editor = adding one entry here.
 */
import type { Component, Snippet } from "svelte";

/** The props App passes to every editor shell; each component is type-checked against this. */
export interface EditorShellProps {
  repo: SrsRepository;
  repoName: string;
  onExport: () => void;
  onExportSrsj?: () => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  documentDirty?: boolean;
  documentRevision?: number;
  onDocumentMutation?: () => boolean;
  /** Whether the last (deferred, srs-web#353) recovery-copy write succeeded. */
  workingCopySaved?: boolean;
  onOpenAnother: () => void;
  onOpenExplorer?: () => void;
  /** Open the agent library (Go > Agents…). Absent for a shell that hosts its own agent panel. */
  onOpenAgents?: () => void;
  documentProvider: string;
  readOnlyReason?: string | null;
  /** A shell declares (or, with null, withdraws) the write guard App applies to agent MCP writes. */
  /** `replacing` = the guard being withdrawn; App ignores a null from a shell whose guard is no longer current. */
  onAgentWriteGuard?: (guard: AgentWriteGuard | null, replacing?: AgentWriteGuard) => void;
  /**
   * The agent (MCP) connections UI, built once by App. A shell that renders it (the essay rail's
   * Agents panel) owns its placement; App shows the floating dock only for shells that do not.
   */
  agentPanel?: Snippet<[AgentPanelCtx?]>;
  /**
   * Connected/total agents, per-agent status and the newest-first agent writes, computed once in
   * App (agent-activity.ts). A shell that renders `agentPanel` shows this beside it (Panel `aside`,
   * AgentFeed); `agentPanel` is rendered with an `AgentPanelCtx` (per-agent last activity); the write source is each agent's own MCP session, never inferred.
   */
  agentStatus?: AgentStatus;
}

export interface EditorDefinition {
  id: string;
  label: string;
  description: string;
  /** UUID of the type whose presence in the repo's resolved types makes this editor available. */
  entryTypeId: string;
  requires: PackageRequirement[];
  create?: (repo: SrsRepository) => void | Promise<void>;
  /**
   * A new repository built for this editor instead of a blank one. Transitional: only governance
   * has one, until its package is installable (srs#390) and this field is removed.
   */
  seed?: (title: string) => SrsRepository;
  component: Component<EditorShellProps>;
  /** The shell renders `agentPanel` in its own layout, so App hides the floating agent dock. */
  hostsAgentPanel?: boolean;
}

export const EDITORS: EditorDefinition[] = [
  {
    id: "governance",
    label: "Governance",
    description: "Decision log editor for governance repositories.",
    // The decision type is what the shell edits; fixtures and seeds may lack the optional decision_log header.
    entryTypeId: DECISION_TYPE_ID,
    requires: [
      {
        packageId: "1cd9622e-3d05-4214-a683-4cb81d0c44d9",
        namespace: "com.mudemocracy.governance",
        name: "governance",
        version: "1.0.0",
      },
    ],
    seed: (title) => createGovernanceDocument(title).repo,
    component: GovernanceShell,
  },
  {
    id: "guides",
    label: "Guides",
    description: "Blueprint-driven guides editor.",
    entryTypeId: "8f138dd6-11d2-42a5-99ec-3d6e23bed54f",
    // No standalone guides package yet — see the-greenman/muDemocracy.org#244.
    requires: [],
    component: GuidesShell,
  },
  {
    id: "essay",
    label: "Essay",
    hostsAgentPanel: true,
    description: "Structured essay editor.",
    entryTypeId: ESSAY_TYPE_ID,
    requires: [
      {
        packageId: "5b14a4d4-ec08-4e5b-be75-c183aec90c40",
        namespace: "com.mudemocracy.essay",
        name: "essay",
        version: "1.3.0",
      },
    ],
    create: (repo) => {
      newEssay(repo, "Untitled essay");
    },
    component: EssayShell,
  },
];

/** An unmet requirement and the one human-readable reason (built once; the picker shows it in two places). */
export interface UnmetRequirement {
  requirement?: PackageRequirement;
  reason: string;
  /** Present only when every unsatisfied requirement is missing and has a pinned bundle (Install offers these). */
  install?: PackageRequirement[];
}

/** An editor that is offered; `unmet` = why it cannot be opened (null = usable). */
export interface OfferedEditor {
  editor: EditorDefinition;
  unmet: UnmetRequirement | null;
}

function unmetReason(req: PackageRequirement, have: (string | null)[] | undefined): string {
  // The core's installed-set order is shown as given: no client version comparison.
  const installed = (have ?? []).filter((v): v is string => !!v);
  return `Needs ${req.name} package ${req.version}${installed.length ? ` (you have ${installed.join(", ")})` : ""}`;
}

/**
 * The unsatisfied requirements, when every one is installable: the core says it is `missing`
 * (R1; an outdated or incompatible package is never installed over) and a bundle is pinned.
 * Undefined when nothing is unsatisfied or any one is not installable.
 */
export function installableRequirements(
  outcomes: (RequirementOutcome | undefined)[],
  requires: PackageRequirement[]
): PackageRequirement[] | undefined {
  const unsatisfied = requires.filter((_, n) => !outcomes[n]?.satisfied);
  const installable = unsatisfied.every(
    (req) =>
      outcomes[requires.indexOf(req)]?.reason === REQUIREMENT_MISSING &&
      bundledPackage(req.packageId)
  );
  return unsatisfied.length > 0 && installable ? unsatisfied : undefined;
}

/**
 * The one availability computation (srs-web#399): App's shell selection and the picker both consume it.
 * Entry type present = offered; an entry type that is absent is offered only when Install can supply it.
 * An unmet `requires` (RFC-044, decided by the core) = offered but unusable.
 * Fails closed: if the check throws or returns nonsense, every editor with requirements is unmet.
 */
export function availableEditors(repo: SrsRepository, types: TypeSummary[]): OfferedEditor[] {
  const ids = new Set(types.map((type) => type.id));
  const offered: OfferedEditor[] = [];
  for (const editor of EDITORS) {
    const present = ids.has(editor.entryTypeId);
    if (editor.requires.length === 0) {
      if (present) offered.push({ editor, unmet: null });
      continue;
    }
    let outcomes: RequirementOutcome[];
    try {
      outcomes = checkPackageRequirements(repo, editor.requires);
    } catch {
      if (present) {
        offered.push({ editor, unmet: { reason: "Could not check package requirements" } });
      }
      continue;
    }
    const i = editor.requires.findIndex((_, n) => !outcomes[n]?.satisfied);
    if (i < 0) {
      if (present) offered.push({ editor, unmet: null });
      continue;
    }
    const install = installableRequirements(outcomes, editor.requires);
    if (!present && !install) continue;
    offered.push({
      editor,
      unmet: {
        requirement: editor.requires[i],
        reason: unmetReason(editor.requires[i], outcomes[i]?.candidateVersions),
        install,
      },
    });
  }
  return offered;
}

/** Install the bundles an offered editor needs (its `unmet.install`), in order; the core checks each. */
export function installEditor(repo: SrsRepository, offered: OfferedEditor): void {
  installBundles(
    repo,
    (offered.unmet?.install ?? []).map((req) => req.packageId)
  );
}

/** The editors a new repository can be created for: a `seed`, or every requirement bundled. */
export function creatableEditors(): EditorDefinition[] {
  return EDITORS.filter(
    (e) => e.seed || (e.requires.length > 0 && e.requires.every((r) => bundledPackage(r.packageId)))
  );
}

/** The one shell gate: the editor App may render for `mode`, or null (generic shell) if it is absent or unmet. */
export function usableEditor(offered: OfferedEditor[], mode: string): EditorDefinition | null {
  return offered.find((o) => o.editor.id === mode && !o.unmet)?.editor ?? null;
}
