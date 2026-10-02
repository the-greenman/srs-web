import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyActor,
  currentActor,
  localActor,
  providerActor,
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
