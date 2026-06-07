/**
 * sections.ts — governance section definitions for the sidebar navigation.
 *
 * typeName values are the exact values from the gallery package. typeNamespace
 * is "governance" for all current types. Update this list if the package
 * gains new types.
 *
 * B4 governance viewer: https://github.com/the-greenman/srs-web/issues/3
 */

export const SECTIONS = [
  {
    key: "articles",
    label: "Articles",
    typeNamespace: "governance",
    typeName: "article",
    icon: "§",
  },
  {
    key: "decisions",
    label: "Decision Log",
    typeNamespace: "governance",
    typeName: "decision",
    icon: "⊕",
  },
  {
    key: "roles",
    label: "Roles",
    typeNamespace: "governance",
    typeName: "role",
    icon: "◈",
  },
  {
    key: "exercises",
    label: "Exercise Book",
    typeNamespace: "governance",
    typeName: "exercise",
    icon: "◻",
  },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];
