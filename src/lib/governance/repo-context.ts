/**
 * repo-context.ts — Svelte context for the active SrsRepository instance.
 *
 * Follows the field-meta.ts pattern: GovernanceShell sets the context once at
 * synchronous init; rendering-layer components read it via getRepoContext() to
 * call WASM methods without prop-drilling through RecordDispatch (ADR-013, ADR-001).
 */

import type { SrsRepository } from "$lib/srs-client.js";
import { getContext, setContext } from "svelte";

export const REPO_CONTEXT_KEY = Symbol("repo");

export interface RepoContext {
  readonly repo: SrsRepository;
}

/**
 * Call once during GovernanceShell synchronous init, after $state declarations.
 * Pass a getter (e.g. a $derived or lambda over $state) so the context getter
 * tracks reactive changes automatically.
 */
export function setRepoContext(getRepo: () => SrsRepository): void {
  setContext<RepoContext>(REPO_CONTEXT_KEY, {
    get repo() {
      return getRepo();
    },
  });
}

/**
 * Call once during rendering component init to obtain the reactive repo context.
 * Access `.repo` inside $derived to track reactive changes:
 *
 *   const _repoCtx = getRepoContext();
 *   const repo = $derived(_repoCtx.repo);
 *
 * Do NOT call getRepoContext() inside $derived — getContext is init-only in Svelte 5.
 */
export function getRepoContext(): RepoContext {
  return getContext<RepoContext>(REPO_CONTEXT_KEY);
}
