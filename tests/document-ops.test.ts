/**
 * Unit tests for document-ops.ts (srs-web#322): call-sequence contracts
 * against a mock repo — insert/move/remove each delegate to exactly the
 * expected WASM chain-splice/container/record bindings, in order, and call
 * `onMutation` exactly once on success.
 */

import { describe, expect, it, vi } from "vitest";
import { insertChild, insertComponent, moveComponent, removeComponent } from "../src/lib/editor/document-ops.js";
import type { SrsRepository } from "../src/lib/srs-client.js";

function fakeRepo(overrides: Partial<SrsRepository> = {}): SrsRepository {
  const notMocked = (name: string) => () => {
    throw new Error(`not mocked: ${name}`);
  };
  const base = {
    create_record_in_container: notMocked("create_record_in_container"),
    create_relation: notMocked("create_relation"),
    insert_into_precedes_chain: notMocked("insert_into_precedes_chain"),
    remove_from_precedes_chain: notMocked("remove_from_precedes_chain"),
    move_in_precedes_chain: notMocked("move_in_precedes_chain"),
    remove_container_member: notMocked("remove_container_member"),
    delete_record: notMocked("delete_record"),
  };
  return { ...base, ...overrides } as unknown as SrsRepository;
}

describe("insertComponent", () => {
  it("creates the record in the container, then splices it into the chain after the anchor", () => {
    const calls: string[] = [];
    const repo = fakeRepo({
      create_record_in_container: (containerId: string, typeId: string, typeVersion: number, inputJson: string) => {
        calls.push(`create:${containerId}:${typeId}:${typeVersion}:${inputJson}`);
        return { instanceId: "new-1", typeId, typeVersion, fieldValues: JSON.parse(inputJson).fieldValues };
      },
      insert_into_precedes_chain: (inputJson: string) => {
        calls.push(`insert:${inputJson}`);
        return { created: [], removed: [] };
      },
    });
    const onMutation = vi.fn();

    const created = insertComponent(
      repo,
      { typeId: "t1", typeVersion: 2, containerId: "c1", afterId: "prev-1", fieldValues: { heading: "Hi" } },
      onMutation
    );

    expect(created.instanceId).toBe("new-1");
    expect(calls).toEqual([
      'create:c1:t1:2:{"fieldValues":{"heading":"Hi"}}',
      'insert:{"instanceId":"new-1","afterId":"prev-1"}',
    ]);
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("skips the chain splice when neither afterId nor beforeId is given (empty document)", () => {
    const repo = fakeRepo({
      create_record_in_container: (_c: string, typeId: string, typeVersion: number) => ({
        instanceId: "new-1",
        typeId,
        typeVersion,
        fieldValues: {},
      }),
      insert_into_precedes_chain: () => {
        throw new Error("must not be called for the document's first component");
      },
    });
    const onMutation = vi.fn();

    const created = insertComponent(repo, { typeId: "t1", typeVersion: 1, containerId: "c1" }, onMutation);

    expect(created.instanceId).toBe("new-1");
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("defaults onMutation to a no-op when omitted", () => {
    const repo = fakeRepo({
      create_record_in_container: (_c: string, typeId: string, typeVersion: number) => ({
        instanceId: "new-1",
        typeId,
        typeVersion,
        fieldValues: {},
      }),
    });
    expect(() => insertComponent(repo, { typeId: "t1", typeVersion: 1, containerId: "c1" })).not.toThrow();
  });
});

describe("insertChild", () => {
  it("creates the record in the container, asserts the contains relation from the parent, then splices it after the anchor sibling", () => {
    const calls: string[] = [];
    const repo = fakeRepo({
      create_record_in_container: (containerId: string, typeId: string, typeVersion: number, inputJson: string) => {
        calls.push(`create:${containerId}:${typeId}:${typeVersion}:${inputJson}`);
        return { instanceId: "child-1", typeId, typeVersion, fieldValues: JSON.parse(inputJson).fieldValues };
      },
      create_relation: (inputJson: string) => {
        calls.push(`relation:${inputJson}`);
        return { relationId: "r1", relationType: "contains", sourceInstanceId: "parent-1", targetInstanceId: "child-1" };
      },
      insert_into_precedes_chain: (inputJson: string) => {
        calls.push(`insert:${inputJson}`);
        return { created: [], removed: [] };
      },
    });
    const onMutation = vi.fn();

    const created = insertChild(
      repo,
      { parentId: "parent-1", typeId: "t1", typeVersion: 1, containerId: "c1", afterId: "sib-1", fieldValues: { heading: "Hi" } },
      onMutation
    );

    expect(created.instanceId).toBe("child-1");
    expect(calls).toEqual([
      'create:c1:t1:1:{"fieldValues":{"heading":"Hi"}}',
      'relation:{"relationType":"contains","sourceInstanceId":"parent-1","targetInstanceId":"child-1"}',
      'insert:{"instanceId":"child-1","afterId":"sib-1"}',
    ]);
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("skips the chain splice for the parent's first child (no afterId)", () => {
    const repo = fakeRepo({
      create_record_in_container: (_c: string, typeId: string, typeVersion: number) => ({
        instanceId: "child-1",
        typeId,
        typeVersion,
        fieldValues: {},
      }),
      create_relation: () => ({ relationId: "r1", relationType: "contains", sourceInstanceId: "parent-1", targetInstanceId: "child-1" }),
      insert_into_precedes_chain: () => {
        throw new Error("must not be called for the parent's first child");
      },
    });

    const created = insertChild(repo, { parentId: "parent-1", typeId: "t1", typeVersion: 1, containerId: "c1" });
    expect(created.instanceId).toBe("child-1");
  });
});

describe("moveComponent", () => {
  it("calls move_in_precedes_chain with the given instance and anchor, then onMutation", () => {
    const calls: string[] = [];
    const repo = fakeRepo({
      move_in_precedes_chain: (inputJson: string) => {
        calls.push(inputJson);
        return { created: [], removed: [] };
      },
    });
    const onMutation = vi.fn();

    moveComponent(repo, { instanceId: "a", beforeId: "b" }, onMutation);

    expect(calls).toEqual(['{"instanceId":"a","beforeId":"b"}']);
    expect(onMutation).toHaveBeenCalledTimes(1);
  });
});

describe("removeComponent", () => {
  it("unlinks the chain, drops container membership, then deletes the record, in that order", () => {
    const calls: string[] = [];
    const repo = fakeRepo({
      remove_from_precedes_chain: (inputJson: string) => {
        calls.push(`chain:${inputJson}`);
        return { created: [], removed: [] };
      },
      remove_container_member: (containerId: string, instanceId: string) => {
        calls.push(`member:${containerId}:${instanceId}`);
        return [];
      },
      delete_record: (instanceId: string, cascade: boolean) => {
        calls.push(`delete:${instanceId}:${cascade}`);
      },
    });
    const onMutation = vi.fn();

    removeComponent(repo, { instanceId: "a", containerId: "c1" }, onMutation);

    expect(calls).toEqual(['chain:{"instanceId":"a"}', "member:c1:a", "delete:a:false"]);
    expect(onMutation).toHaveBeenCalledTimes(1);
  });

  it("passes cascade through to delete_record for a nested child (its inbound contains edge must be removed too)", () => {
    const calls: string[] = [];
    const repo = fakeRepo({
      remove_from_precedes_chain: () => ({ created: [], removed: [] }),
      remove_container_member: () => [],
      delete_record: (instanceId: string, cascade: boolean) => {
        calls.push(`delete:${instanceId}:${cascade}`);
      },
    });

    removeComponent(repo, { instanceId: "child-1", containerId: "c1", cascade: true });

    expect(calls).toEqual(["delete:child-1:true"]);
  });
});
