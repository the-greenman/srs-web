import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyActor,
  currentActor,
  localActor,
  onActorChange,
  providerActor,
  refreshSignedInActor,
  saveLocalName,
  setSignedInActor,
} from "../src/lib/actor";

const repo = () => ({ set_actor: vi.fn(), clear_actor: vi.fn() });

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  setSignedInActor(null);
});

describe("human actor", () => {
  it("scopes the id by provider and names it from the profile (login as fallback)", () => {
    expect(providerActor("github", "ada", "Ada L")).toEqual({
      kind: "human",
      id: "github:ada",
      name: "Ada L",
    });
    expect(providerActor("github", "ada").name).toBe("ada");
    expect(providerActor("codeberg", "bob").id).toBe("codeberg:bob");
  });

  it("prefers the signed-in provider actor over a saved local name", () => {
    saveLocalName("Local Lou");
    setSignedInActor(providerActor("github", "ada", "Ada"));
    expect(currentActor()?.id).toBe("github:ada");
  });

  it("falls back to a persisted local:<uuid> actor, keeping the id when the name changes", () => {
    const a = saveLocalName("  Lou ");
    expect(a).toMatchObject({ kind: "human", name: "Lou" });
    expect(a?.id).toMatch(/^local:/);
    expect(localActor()).toEqual(a);
    expect(saveLocalName("Louise")?.id).toBe(a?.id);
  });

  it("is unattributed with neither (and a blank name saves nothing)", () => {
    expect(saveLocalName("   ")).toBeNull();
    expect(currentActor()).toBeNull();
    const r = repo();
    applyActor(r as never);
    expect(r.clear_actor).toHaveBeenCalled();
    expect(r.set_actor).not.toHaveBeenCalled();
  });

  it("applies the actor as JSON to the repository handle", () => {
    setSignedInActor(providerActor("github", "ada", "Ada"));
    const r = repo();
    applyActor(r as never);
    expect(JSON.parse(r.set_actor.mock.calls[0][0])).toEqual({
      kind: "human",
      id: "github:ada",
      name: "Ada",
    });
  });
});

describe("signed-in actor lifecycle", () => {
  it("a null profile (sign-out) clears the previous actor", async () => {
    await refreshSignedInActor("github", async () => ({ login: "ada", name: "Ada" }));
    expect(currentActor()?.id).toBe("github:ada");
    await refreshSignedInActor("github", async () => null);
    expect(currentActor()).toBeNull();
  });

  it("an account switch replaces the actor", async () => {
    await refreshSignedInActor("github", async () => ({ login: "ada" }));
    await refreshSignedInActor("github", async () => ({ login: "bob" }));
    expect(currentActor()?.id).toBe("github:bob");
  });

  it("notifies subscribers on login, sign-out and a saved name (so the name prompt follows the actor)", async () => {
    const seen: (string | undefined)[] = [];
    const off = onActorChange(() => seen.push(currentActor()?.id));
    await refreshSignedInActor("github", async () => ({ login: "ada" }));
    await refreshSignedInActor("github", async () => null);
    saveLocalName("Lou");
    off();
    saveLocalName("Louise");
    expect(seen).toEqual(["github:ada", undefined, expect.stringMatching(/^local:/)]);
  });
});
