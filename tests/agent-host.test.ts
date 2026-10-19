import { beforeEach, expect, it, vi } from "vitest";

const migrations = vi.hoisted(() => ({ needed: [] as string[] }));
vi.mock("../src/lib/srs-client", () => ({
  RFC046_MIGRATION_ID: "rfc046-actor-provenance",
  neededMigrationIds: () => migrations.needed,
  listRelations: () => [],
}));

import { applyAgentActor, applyAgentGuard, openAgentSession, type AgentHostEntry } from "../src/lib/agent-host";

const conn = { id: "agent:abc", label: "Red team" } as never;
const guard = { allow: [] } as never;

const session = () => ({
  set_write_guard: vi.fn(),
  clear_write_guard: vi.fn(),
  set_actor: vi.fn(),
  free: vi.fn(),
  handle: vi.fn(),
  take_write_summary: vi.fn(),
  is_initialized: () => true,
});
const entry = (s: ReturnType<typeof session> | null = null) =>
  ({ host: { detach: vi.fn(), attach: vi.fn(async () => {}) }, session: s }) as unknown as AgentHostEntry & {
    host: { detach: ReturnType<typeof vi.fn>; attach: ReturnType<typeof vi.fn> };
  };
const repoWith = (s: ReturnType<typeof session>) => ({ open_mcp_session: () => s }) as never;
const opts = (g: unknown = guard) => ({ guard: () => g as never, onWrite: vi.fn(), onGuardError: vi.fn() });

beforeEach(() => {
  migrations.needed = [];
});

it("sets the guard, then the actor, then attaches; frees the previous session", () => {
  const prev = session();
  const next = session();
  const e = entry(prev);
  openAgentSession(e, conn, repoWith(next), opts());
  expect(prev.free).toHaveBeenCalled();
  expect(e.session).toBe(next);
  expect(next.set_write_guard).toHaveBeenCalledWith(JSON.stringify(guard));
  expect(next.set_actor).toHaveBeenCalledWith(JSON.stringify({ kind: "ai", id: "agent:abc", name: "Red team" }));
  expect(e.host.attach).toHaveBeenCalledTimes(1);
});

it("no repository: the host is detached and nothing attaches", () => {
  const prev = session();
  const e = entry(prev);
  openAgentSession(e, conn, null, opts());
  expect(e.session).toBeNull();
  expect(prev.free).toHaveBeenCalled();
  expect(e.host.attach).not.toHaveBeenCalled();
});

it("no guard clears any earlier one", () => {
  const s = session();
  expect(applyAgentGuard(entry(s), opts(null))).toBe(true);
  expect(s.clear_write_guard).toHaveBeenCalled();
});

it("fails closed: a guard that cannot be applied detaches the agent and never attaches", () => {
  const s = session();
  s.set_write_guard.mockImplementation(() => {
    throw new Error("boom");
  });
  const e = entry();
  const o = opts();
  vi.spyOn(console, "error").mockImplementation(() => {});
  openAgentSession(e, conn, repoWith(s), o);
  expect(o.onGuardError).toHaveBeenCalledWith("Write guard failed: boom");
  expect(e.host.detach).toHaveBeenCalledTimes(2); // once to reopen, once failing closed
  expect(s.set_actor).not.toHaveBeenCalled();
  expect(e.host.attach).not.toHaveBeenCalled();
});

it("the actor is set only on a revision-9 corpus", () => {
  const s = session();
  migrations.needed = ["rfc046-actor-provenance"];
  applyAgentActor(s as never, {} as never, conn);
  expect(s.set_actor).not.toHaveBeenCalled();
  migrations.needed = [];
  applyAgentActor(s as never, {} as never, { id: "agent:x" } as never);
  expect(s.set_actor).toHaveBeenCalledWith(JSON.stringify({ kind: "ai", id: "agent:x" }));
});
