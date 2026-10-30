// @vitest-environment node
/**
 * The Read view's pages (ADR-029) against the REAL engine: the spec archive and muSrs
 * (the default test config stubs the WASM bindings, so the generated JS is copied aside).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { SrsRepository } from "../src/lib/srs-client.js";

const bindings = path.resolve(__dirname, "../src/lib/srs_bindings");
const haveBindings = existsSync(path.join(bindings, "srs_bindings_bg.wasm"));
if (process.env.CI && !haveBindings) {
  it("real WASM bindings are present in CI", () => {
    throw new Error("src/lib/srs_bindings missing: run npm run fetch-bindings before vitest in CI");
  });
}
const fixture = (name: string) => path.resolve(__dirname, "../e2e/fixtures", name);

describe.skipIf(!haveBindings)("Read view pages on the real engine", () => {
  let spec: SrsRepository;
  let musrs: SrsRepository;
  let method: SrsRepository;
  let loadSpec: () => SrsRepository;
  let client: typeof import("../src/lib/srs-client.js");
  let read: typeof import("../src/lib/read/read-model.js");

  beforeAll(async () => {
    const dir = path.resolve(__dirname, "../node_modules/.cache/srs-real-bindings");
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(bindings, "srs_bindings.js"), path.join(dir, "read-model.mjs"));
    // biome-ignore lint/suspicious/noExplicitAny: the private bindings module
    const mod: any = await import(/* @vite-ignore */ path.join(dir, "read-model.mjs"));
    mod.initSync({ module: readFileSync(path.join(bindings, "srs_bindings_bg.wasm")) });
    loadSpec = () => mod.SrsRepository.load_archive(readFileSync(fixture("srs-spec.srs")));
    spec = loadSpec();
    musrs = mod.SrsRepository.load(readFileSync(fixture("muSrs.srsj"), "utf8"));
    method = mod.SrsRepository.load(readFileSync(fixture("method.srsj"), "utf8"));
    client = await import("../src/lib/srs-client.js");
    read = await import("../src/lib/read/read-model.js");
  });

  it("opens on the identity record, its items the navigation sections in order", () => {
    for (const repo of [spec, musrs]) {
      const nav = client.repositoryNavigation(repo);
      const door = read.frontDoor(repo);
      const page = read.readPage(repo, door.containerId, door.id);
      expect(page.id).toBe(nav.identity.instanceId);
      expect(page.record ?? page.note).toBeDefined();
      const sections = nav.sections.filter((s) => s.depth === 0).map((s) => s.instanceId);
      expect(page.items.map((i) => i.id)).toEqual(sections);
    }
  });

  it("opening a section moves into its section container and lists its top level in arranged order", () => {
    const door = read.frontDoor(spec);
    const front = read.readPage(spec, door.containerId, door.id);
    const section = front.items.find((i) => i.sectionContainerId);
    expect(section).toBeDefined();
    const to = read.openTarget(front, section!);
    expect(to.containerId).toBe(section!.sectionContainerId);
    const page = read.readPage(spec, to.containerId, to.id);
    const top = client.getContainerOutline(spec, to.containerId).body.filter((e) => !e.parentInstanceId);
    const ids = top.map((e) => e.instanceId);
    const shown = page.groupedBy ? [...page.items].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) : page.items;
    expect(shown.map((i) => i.id)).toEqual(ids);
    expect(page.items.every((i) => i.label && !/^[0-9a-f]{8}$/.test(i.label))).toBe(true);
  });

  it("drills a second level through nested outline entries", () => {
    // no fixture nests entries, so nest one (in a fresh copy): a section's second top-level entry into its first
    const spec = loadSpec();
    const door = read.frontDoor(spec);
    const section = read.readPage(spec, door.containerId, door.id).items.find((i) => i.sectionContainerId)!;
    const cid = section.sectionContainerId!;
    const [first, second] = client.getContainerOutline(spec, cid).body.filter((e) => !e.parentInstanceId);
    client.moveContainerMemberRelative(spec, cid, second.instanceId, { relativeTo: first.instanceId, placement: "into" });
    const top = read.readPage(spec, cid, section.id);
    expect(top.items.map((i) => i.id)).not.toContain(second.instanceId);
    const parent = top.items.find((i) => i.id === first.instanceId)!;
    expect(read.opensOnto(parent)).toBe(true);
    const to = read.openTarget(top, parent);
    expect(to).toEqual({ containerId: cid, id: first.instanceId });
    expect(read.readPage(spec, to.containerId, to.id).items.map((i) => i.id)).toEqual([second.instanceId]);
  });

  it("a wall of more than WALL items is grouped, and items carry a first line", () => {
    const walls = client
      .listContainers(spec)
      .map((c) => read.readPage(spec, c.containerId))
      .filter((p) => p.items.length > read.WALL);
    expect(walls.length).toBeGreaterThan(0);
    for (const p of walls) {
      expect(p.groupedBy).toBeDefined();
      expect(p.items.every((i) => i.group !== undefined)).toBe(true);
    }
    const withText = walls.flatMap((p) => p.items).filter((i) => i.first.length > 0);
    expect(withText.length).toBeGreaterThan(0);
  });

  it("a note in a list is named as one", () => {
    const pages = client.listContainers(method).map((c) => read.readPage(method, c.containerId));
    const notes = pages.flatMap((p) => p.items).filter((i) => !i.record);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((i) => i.typeName === "Note")).toBe(true);
  });

  it("opens on Read only with a front door: an identity record and a navigation section", () => {
    expect(read.opensOnRead(spec)).toBe(true);
    expect(read.opensOnRead(method)).toBe(false); // identity, no sections: the explorer
  });

  it("a note page carries its text", () => {
    const pages = client.listContainers(method).map((c) => read.readPage(method, c.containerId));
    const page = pages.find((p) => p.note);
    expect(page).toBeDefined();
    expect(page!.record).toBeUndefined();
    expect(page!.title).toBe(page!.note!.title);
    expect(page!.note!.sections?.some((s) => s.content?.trim())).toBe(true);
  });
});
