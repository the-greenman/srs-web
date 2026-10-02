import EssayShell from "$lib/essay/EssayShell.svelte";
import { newEssay } from "$lib/essay/essay-document.js";
import { ESSAY_TYPE_ID } from "$lib/essay/type-registry.js";
import GovernanceShell from "$lib/governance/GovernanceShell.svelte";
import { DECISION_TYPE_ID } from "$lib/governance/type-registry.js";
import GuidesShell from "$lib/guides/GuidesShell.svelte";
import type { SrsRepository, TypeSummary } from "$lib/srs-client.js";
/**
 * The one editor registry (srs-web#338).
 *
 * An EditorDefinition is presentation wiring, not repository interpretation: the Rust
 * engine supplies the resolved types; this registry decides which Svelte shell may be
 * offered for a known contract. Availability is keyed on UUID identity (`entryTypeId`),
 * never on a namespace/name label. Adding an editor = adding one entry here.
 */
import type { Component } from "svelte";

/** The spec's packageDependencies shape plus the package UUID (srs#855). */
export interface PackageRequirement {
  packageId: string;
  namespace: string;
  name: string;
  version: string;
}

/** The union of props App passes to every editor shell. */
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
  onOpenAnother: () => void;
  onOpenExplorer?: () => void;
  documentProvider?: string;
  readOnlyReason?: string | null;
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
    component: GovernanceShell as unknown as Component<EditorShellProps>,
  },
  {
    id: "guides",
    label: "Guides",
    description: "Blueprint-driven guides editor.",
    entryTypeId: "8f138dd6-11d2-42a5-99ec-3d6e23bed54f",
    // No standalone guides package yet — see the-greenman/muDemocracy.org#244.
    requires: [],
    component: GuidesShell as unknown as Component<EditorShellProps>,
  },
  {
    id: "essay",
    label: "Essay",
    description: "Structured essay editor.",
    entryTypeId: ESSAY_TYPE_ID,
    requires: [
      {
        packageId: "5b14a4d4-ec08-4e5b-be75-c183aec90c40",
        namespace: "com.mudemocracy.essay",
        name: "essay",
        version: "1.0.0",
      },
    ],
    create: (repo) => {
      newEssay(repo, "Untitled essay");
    },
    component: EssayShell as unknown as Component<EditorShellProps>,
  },
];

export function getEditor(id: string): EditorDefinition | undefined {
  return EDITORS.find((editor) => editor.id === id);
}

export function availableEditors(types: TypeSummary[]): EditorDefinition[] {
  const ids = new Set(types.map((type) => type.id));
  return EDITORS.filter((editor) => ids.has(editor.entryTypeId));
}
