/**
 * sections.ts — governance section definitions for the sidebar navigation.
 *
 * typeName values are the exact values from the gallery package. typeNamespace
 * is "governance" for all current types. Update this list if the package
 * gains new types.
 *
 * typeId and typeVersion are stable gallery package identifiers used to call
 * typeSchema() and createRecord(). Sections without a typeId are read-only
 * (no create/edit form). See ADR-005.
 *
 * B4 governance viewer: https://github.com/the-greenman/srs-web/issues/3
 * srs-web#53 blueprint-driven form generator
 */

export interface SectionConfig {
  key: string;
  label: string;
  typeNamespace: string;
  typeName: string;
  icon: string;
  typeId?: string;
  typeVersion?: number;
}

export const SECTIONS = [
  {
    key: "articles" as const,
    label: "Articles",
    typeNamespace: "governance",
    typeName: "article",
    icon: "§",
    typeId: "a1142ac3-5385-5c0e-8630-1dd3432cdf7f",
    typeVersion: 1,
  },
  {
    key: "decisions" as const,
    label: "Decision Log",
    typeNamespace: "governance",
    typeName: "decision",
    icon: "⊕",
    typeId: "1fcad6a2-9f78-5e41-94ba-d82e88b822f3",
    typeVersion: 1,
  },
  {
    key: "roles" as const,
    label: "Roles",
    typeNamespace: "governance",
    typeName: "role",
    icon: "◈",
    typeId: "e53dce11-6b83-5714-a8fe-f730edb500fa",
    typeVersion: 1,
  },
  {
    key: "exercises" as const,
    label: "Exercise Book",
    typeNamespace: "governance",
    typeName: "exercise",
    icon: "◻",
  },
] satisfies readonly SectionConfig[];

export type SectionKey = (typeof SECTIONS)[number]["key"];
