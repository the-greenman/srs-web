/**
 * Read-only repositories (#471). The core has no read-only repository handle, so the client refuses
 * every mutating binding here, as a hard stop beneath the hidden editing controls. A new binding is not
 * silently writable: tests/read-only.test.ts fails until it is classified below.
 */
import type { AgentWriteGuard, SrsRepository } from "./srs-client.js";
import { listContainers, listRecords } from "./srs-client.js";

/** Every `SrsRepository` method that changes the repository. */
export const MUTATING_METHODS: ReadonlySet<string> = new Set([
  "add_attachment",
  "add_container_member",
  "add_container_member_relative",
  "apply_migration",
  "copy_container",
  "create_container",
  "create_record",
  "create_record_in_container",
  "create_record_successor",
  "create_relation",
  "delete_record",
  "delete_relation",
  "fork_record",
  "graduate_note",
  "init_new_repository",
  "scaffold_new_repository",
  "insert_into_precedes_chain",
  "install_package_bundle",
  "link_attachment",
  "migrate_identity",
  "move_container_member",
  "move_container_member_relative",
  "move_in_precedes_chain",
  "protocol_run_abandon",
  "protocol_run_advance",
  "protocol_run_complete",
  "protocol_run_create",
  "rebuild_precedes_chain",
  "remove_container_member",
  "remove_from_precedes_chain",
  "repair_container_members",
  "set_lifecycle_state",
  "transition_record",
  "update_container",
  "update_record",
  "upgrade_package_bundle",
]);

/** Methods that do not change repository data (reads, exports, session/actor plumbing, `free`). */
export const NON_MUTATING_METHODS: ReadonlySet<string> = new Set([
  "available_migrations",
  "blueprint_schema",
  "check_package_requirements",
  "clear_actor",
  "clear_write_guard",
  "compositions_for_container",
  "containers_for_instance",
  "context_field",
  "context_record",
  "declared_extensions_conformance",
  "doctor",
  "export_archive",
  "export_package_bundle",
  "export_slice",
  "export_srsj",
  "export_tree",
  "find",
  "find_protocol_by_target_type",
  "find_similar",
  "free",
  "generate_schema_bundle",
  "get_allowed_lifecycle_transitions",
  "get_attachment_bytes",
  "get_container",
  "get_container_arrangement",
  "get_container_outline",
  "get_field",
  "get_field_value_by_name",
  "get_protocol_by_id",
  "get_record",
  "get_record_attachments",
  "get_type",
  "get_view",
  "list_attachments",
  "list_blueprint_structure",
  "list_blueprints",
  "list_compositions",
  "list_containers",
  "list_fields",
  "list_notes",
  "list_package_imports_json",
  "list_packages",
  "list_protocols",
  "list_records",
  "list_relation_types",
  "list_relations",
  "list_terms",
  "list_types",
  "list_views",
  "neighbours",
  "open_mcp_session",
  "order_by_precedes",
  "protocol_run_get",
  "protocol_run_list",
  "render_composition",
  "repository_navigation",
  "resolve_composition_attachments",
  "resolve_container_view",
  "set_actor",
  "type_json_schema",
  "type_schema",
  "validate",
  "write_epoch",
]);

/**
 * `repo` with every mutating method refused while `isReadOnly()` is true (a live flag: saving a copy to
 * the user's own storage turns it off). Reads, exports and the agent-session plumbing pass through.
 */
export function readOnlyRepo(repo: SrsRepository, isReadOnly: () => boolean): SrsRepository {
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof prop !== "string" || typeof value !== "function" || !MUTATING_METHODS.has(prop))
        return value;
      return (...args: unknown[]) => {
        if (isReadOnly())
          throw new Error("This repository was opened read-only. Save a copy to edit it.");
        return value.apply(target, args);
      };
    },
  });
}

/**
 * The core session write guard over the whole repository: every container (so every member at write
 * time) and every record. ponytail: the core guard cannot say "everything": relation_create and a
 * record or note created outside any container are not covered by it (srs-rust guard.rs).
 */
export function readOnlyGuard(repo: SrsRepository): AgentWriteGuard {
  return {
    containerIds: listContainers(repo).map((c) => c.containerId),
    instanceIds: [
      ...listRecords(repo).map((r) => r.instanceId),
      ...repo.list_notes().notes.map((n) => n.instanceId),
    ],
    fillOnlyFields: [],
  };
}

/** Whether the recovery copy (localStorage) may hold the document: never one opened from a link. */
export const mayKeepWorkingCopy = (readOnlyHost: string | null, dirty: boolean): boolean =>
  !readOnlyHost && dirty;
