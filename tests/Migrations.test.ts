// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/svelte";
import { vi, describe, it, expect } from "vitest";
import Migrations from "../src/lib/components/Migrations.svelte";
import type { SrsRepository } from "../src/lib/srs-client.js";

function mockRepo(overrides: Partial<SrsRepository>): SrsRepository {
  const base: SrsRepository = {
    validate: () => { throw new Error("not mocked"); },
    list_records: () => { throw new Error("not mocked"); },
    get_record: () => { throw new Error("not mocked"); },
    list_notes: () => { throw new Error("not mocked"); },
    create_record: () => { throw new Error("not mocked"); },
    update_record: () => { throw new Error("not mocked"); },
    delete_record: () => { throw new Error("not mocked"); },
    export_srsj: () => { throw new Error("not mocked"); },
    list_relations: () => { throw new Error("not mocked"); },
    create_relation: () => { throw new Error("not mocked"); },
    delete_relation: () => { throw new Error("not mocked"); },
    set_lifecycle_state: () => { throw new Error("not mocked"); },
    transition_record: () => { throw new Error("not mocked"); },
    blueprint_schema: () => { throw new Error("not mocked"); },
    render_document_view: () => { throw new Error("not mocked"); },
    list_containers: () => { throw new Error("not mocked"); },
    get_container: () => { throw new Error("not mocked"); },
    add_container_member: () => { throw new Error("not mocked"); },
    remove_container_member: () => { throw new Error("not mocked"); },
    containers_for_instance: () => { throw new Error("not mocked"); },
    type_schema: () => { throw new Error("not mocked"); },
    list_blueprints: () => { throw new Error("not mocked"); },
    document_views_for_container: () => { throw new Error("not mocked"); },
    list_document_views: () => { throw new Error("not mocked"); },
    find: () => { throw new Error("not mocked"); },
    list_terms: () => { throw new Error("not mocked"); },
    create_record_successor: () => { throw new Error("not mocked"); },
    resolve_container_view: () => { throw new Error("not mocked"); },
    repository_navigation: () => { throw new Error("not mocked"); },
    scaffold_new_repository: () => { throw new Error("not mocked"); },
    get_allowed_lifecycle_transitions: () => { throw new Error("not mocked"); },
    available_migrations: () => { throw new Error("not mocked"); },
    apply_migration: () => { throw new Error("not mocked"); },
  };
  return { ...base, ...overrides };
}

describe("Migrations", () => {
  it("renders loading state before WASM call resolves", () => {
    const repo = mockRepo({
      available_migrations: vi.fn().mockReturnValue([]),
    });
    render(Migrations, { props: { repo, onMigrationApplied: vi.fn() } });
    expect(screen.getByText("Loading migrations…")).toBeDefined();
  });

  it("renders migration list with status badges after load", async () => {
    const repo = mockRepo({
      available_migrations: vi.fn().mockReturnValue([
        {
          id: "m1",
          title: "Migrate Identity",
          description: "Migrate Tier-0 identity to purpose record",
          status: { needed: true, alreadyApplied: false, notApplicable: false },
        },
      ]),
    });
    render(Migrations, { props: { repo, onMigrationApplied: vi.fn() } });
    expect(await screen.findByText("Migrate Identity")).toBeDefined();
    expect(await screen.findByText("Needed")).toBeDefined();
  });

  it("Apply button disabled when status is alreadyApplied", async () => {
    const repo = mockRepo({
      available_migrations: vi.fn().mockReturnValue([
        {
          id: "m1",
          title: "Repo Upgrade",
          description: "Already done",
          status: { needed: false, alreadyApplied: true, notApplicable: false },
        },
      ]),
    });
    render(Migrations, { props: { repo, onMigrationApplied: vi.fn() } });
    const btn = await screen.findByRole("button", { name: /Apply/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("Apply button disabled when status is notApplicable", async () => {
    const repo = mockRepo({
      available_migrations: vi.fn().mockReturnValue([
        {
          id: "m1",
          title: "Old Format",
          description: "Not applicable",
          status: { needed: false, alreadyApplied: false, notApplicable: true },
        },
      ]),
    });
    render(Migrations, { props: { repo, onMigrationApplied: vi.fn() } });
    const btn = await screen.findByRole("button", { name: /Apply/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("shows success result and calls onMigrationApplied after apply", async () => {
    const onMigrationApplied = vi.fn();
    const applyResult = { id: "m1", payload: { message: "ok" } };
    const availableMigrationsMock = vi.fn().mockReturnValue([
      {
        id: "m1",
        title: "Migrate Identity",
        description: "Desc",
        status: { needed: true, alreadyApplied: false, notApplicable: false },
      },
    ]);
    const repo = mockRepo({
      available_migrations: availableMigrationsMock,
      apply_migration: vi.fn().mockReturnValue(applyResult),
    });
    render(Migrations, { props: { repo, onMigrationApplied } });

    const btn = await screen.findByRole("button", { name: /Apply/i });
    fireEvent.click(btn);

    expect(await screen.findByRole("status")).toBeDefined();
    expect(onMigrationApplied).toHaveBeenCalledTimes(1);
  });

  it("shows error message when apply throws", async () => {
    const repo = mockRepo({
      available_migrations: vi.fn().mockReturnValue([
        {
          id: "m1",
          title: "Migrate Identity",
          description: "Desc",
          status: { needed: true, alreadyApplied: false, notApplicable: false },
        },
      ]),
      apply_migration: vi.fn().mockImplementation(() => {
        throw new Error("apply failed");
      }),
    });
    render(Migrations, { props: { repo, onMigrationApplied: vi.fn() } });

    const btn = await screen.findByRole("button", { name: /Apply/i });
    fireEvent.click(btn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("apply failed");
  });
});
