/**
 * lifecycle.ts — governance status transition map and immutability guard.
 *
 * B11 lifecycle & supersession: https://github.com/the-greenman/srs-web/issues/7
 */

/**
 * Valid transitions from each governance status.
 * Terminal states map to an empty array — no outgoing transitions.
 */
export const LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  draft:      ["proposed", "active", "deferred"],
  proposed:   ["active", "rejected", "deferred"],
  active:     ["closed", "superseded"],
  deferred:   ["active", "rejected"],
  // Terminal states — no transitions out
  closed:     [],
  rejected:   [],
  superseded: [],
  archived:   [],
};

/**
 * States where direct editing is blocked.
 * Users must create a successor draft instead.
 */
export const IMMUTABLE_STATES = new Set(["active", "closed"]);
