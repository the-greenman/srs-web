/**
 * Human actor for UI writes (RFC-046, srs-web#359). The engine stamps `createdBy` from the
 * session actor; this module only decides WHO the session is and hands it to
 * `repo.set_actor`. Ids are scoped by login provider (`github:<login>`, a future provider
 * slots in as `<provider>:<id>`); with no login a generated `local:<uuid>` plus a display
 * name is kept in this browser; with neither, writes are unattributed.
 */
import type { Actor, SrsRepository } from "./srs-client.js";

const KEY = "srs-web.actor";
let signedIn: Actor | null = null;

/** The actor for a login provider: id `<provider>:<id>`, name = profile name (or the login). */
export function providerActor(provider: string, id: string, name?: string): Actor {
  return { kind: "human", id: `${provider}:${id}`, name: name || id };
}

const listeners = new Set<() => void>();
/** Subscribe to actor changes (login resolved / cleared, local name saved); returns unsubscribe. */
export function onActorChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const notify = () => {
  for (const fn of listeners) fn();
};

/** Called when a provider login resolves (null on sign-out or account switch). */
export function setSignedInActor(actor: Actor | null): void {
  signedIn = actor;
  notify();
}

/** Re-resolve the signed-in user: a null profile clears the previous actor (no stale attribution). */
export async function refreshSignedInActor(
  provider: string,
  profile: () => Promise<{ login: string; name?: string } | null>
): Promise<void> {
  const me = await profile();
  setSignedInActor(me ? providerActor(provider, me.login, me.name) : null);
}

export function localActor(): Actor | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return a?.id?.startsWith("local:") && a.name ? { kind: "human", id: a.id, name: a.name } : null;
  } catch {
    return null;
  }
}

/** Remember a display name (keeps the generated id once created). Null when blank or storage fails. */
export function saveLocalName(name: string): Actor | null {
  const n = name.trim();
  if (!n) return null;
  const actor: Actor = {
    kind: "human",
    id: localActor()?.id ?? `local:${crypto.randomUUID()}`,
    name: n,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(actor));
  } catch {
    return null;
  }
  notify();
  return actor;
}

export const currentActor = (): Actor | null => signedIn ?? localActor();

/** Install the current actor on a repository handle (clear it when there is none). */
export function applyActor(repo: SrsRepository): void {
  const a = currentActor();
  if (a) repo.set_actor(JSON.stringify(a));
  else repo.clear_actor();
}
