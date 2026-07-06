/**
 * slug.ts — filename slug helper (presentation-only).
 *
 * Used for download/save filenames. This is NOT the namespace slug — namespace
 * derivation from a title is SRS semantics and lives in the core
 * (`governance_scaffold_service::derive_namespace_from_title`), per ADR-001.
 */

/**
 * Turn a human title into a filename-safe kebab slug: lowercase, runs of
 * non-alphanumeric characters collapse to a single `-`, trimmed of leading and
 * trailing `-`, capped at 64 characters. Falls back to `"untitled"` when
 * nothing survives.
 */
export function slugifyFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug === "" ? "untitled" : slug;
}
