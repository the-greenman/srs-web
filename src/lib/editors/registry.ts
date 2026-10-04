import type { AgentPanelCtx, AgentStatus } from "$lib/agent-activity.js";
import EssayShell from "$lib/essay/EssayShell.svelte";
import { newEssay } from "$lib/essay/essay-document.js";
import { ESSAY_TYPE_ID } from "$lib/essay/type-registry.js";
import GovernanceShell from "$lib/governance/GovernanceShell.svelte";
import { DECISION_TYPE_ID } from "$lib/governance/type-registry.js";
import GuidesShell from "$lib/guides/GuidesShell.svelte";
import {
  type AgentWriteGuard,
  type SrsRepository,
  type TypeSummary,
  checkPackageRequirements,
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

/** The spec's packageDependencies shape plus the package UUID (srs#855). */
export interface PackageRequirement {
  packageId: string;
  namespace: string;
  name: string;
  version: string;
}

/** The props App passes to every editor shell; each component is type-checked against this. */
export interface EditorShellProps {
  repo: SrsRepository;
  repoName: string;
  onExport: () => void;
  onExportSrsj?: () => void;
  onSave?: () => Promise<void>;
  saving?: boolean;
  saveMessage?: string | null;
  documentDirty?: boolean;
  documentRevision?: number;
  onDocumentMutation?: () => boolean;
  /** Whether the last (deferred, srs-web#353) recovery-copy write succeeded. */
  workingCopySaved?: boolean;
  onOpenAnother: () => void;
  onOpenExplorer?: () => void;
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

export function getEditor(id: string): EditorDefinition | undefined {
  return EDITORS.find((editor) => editor.id === id);
}

/** An unmet requirement and the version the repository has installed (null = package absent). */
export interface UnmetRequirement {
  requirement: PackageRequirement;
  have: string | null;
}

/** An editor whose entry type is present; `unmet` = the first requirement the installed packages do not satisfy. */
export interface OfferedEditor {
  editor: EditorDefinition;
  unmet: UnmetRequirement | null;
}

/**
 * The one availability computation (srs-web#399): App's shell selection and the picker both consume it.
 * Entry type present = offered; an unmet `requires` (RFC-044, decided by the core) = offered but unusable.
 */
export function availableEditors(repo: SrsRepository, types: TypeSummary[]): OfferedEditor[] {
  const ids = new Set(types.map((type) => type.id));
  return EDITORS.filter((editor) => ids.has(editor.entryTypeId)).map((editor) => {
    const outcomes = checkPackageRequirements(repo, editor.requires);
    const i = editor.requires.findIndex((_, n) => !outcomes[n]?.satisfied);
    return {
      editor,
      unmet:
        i < 0
          ? null
          : { requirement: editor.requires[i], have: outcomes[i]?.candidateVersions?.[0] ?? null },
    };
  });
}
