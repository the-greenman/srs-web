// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import GuidesShell from "../src/lib/guides/GuidesShell.svelte";
import type { SrsRepository } from "../src/lib/srs-client.js";

function mockRepo(overrides: Partial<SrsRepository>): SrsRepository {
  const base: SrsRepository = {
    validate: () => {
      throw new Error("not mocked");
    },
    list_records: () => {
      throw new Error("not mocked");
    },
    get_record: () => {
      throw new Error("not mocked");
    },
    list_notes: () => {
      throw new Error("not mocked");
    },
    create_record: () => {
      throw new Error("not mocked");
    },
    update_record: () => {
      throw new Error("not mocked");
    },
    delete_record: () => {
      throw new Error("not mocked");
    },
    export_srsj: () => {
      throw new Error("not mocked");
    },
    export_archive: () => {
      throw new Error("not mocked");
    },
    list_relations: () => {
      throw new Error("not mocked");
    },
    create_relation: () => {
      throw new Error("not mocked");
    },
    delete_relation: () => {
      throw new Error("not mocked");
    },
    set_lifecycle_state: () => {
      throw new Error("not mocked");
    },
    transition_record: () => {
      throw new Error("not mocked");
    },
    blueprint_schema: () => {
      throw new Error("not mocked");
    },
    render_composition: () => {
      throw new Error("not mocked");
    },
    list_containers: () => {
      throw new Error("not mocked");
    },
    get_container: () => {
      throw new Error("not mocked");
    },
    add_container_member: () => {
      throw new Error("not mocked");
    },
    remove_container_member: () => {
      throw new Error("not mocked");
    },
    containers_for_instance: () => {
      throw new Error("not mocked");
    },
    type_schema: () => {
      throw new Error("not mocked");
    },
    list_types: () => {
      throw new Error("not mocked");
    },
    list_blueprints: () => {
      throw new Error("not mocked");
    },
    compositions_for_container: () => {
      throw new Error("not mocked");
    },
    list_compositions: () => {
      throw new Error("not mocked");
    },
    find: () => {
      throw new Error("not mocked");
    },
    list_terms: () => {
      throw new Error("not mocked");
    },
    create_record_successor: () => {
      throw new Error("not mocked");
    },
    resolve_container_view: () => {
      throw new Error("not mocked");
    },
    repository_navigation: () => {
      throw new Error("not mocked");
    },
    scaffold_new_repository: () => {
      throw new Error("not mocked");
    },
    get_allowed_lifecycle_transitions: () => {
      throw new Error("not mocked");
    },
    order_by_precedes: () => {
      throw new Error("not mocked");
    },
    get_field_value_by_name: () => {
      throw new Error("not mocked");
    },
    list_attachments: () => {
      throw new Error("not mocked");
    },
    add_attachment: () => {
      throw new Error("not mocked");
    },
    link_attachment: () => {
      throw new Error("not mocked");
    },
    get_attachment_bytes: () => {
      throw new Error("not mocked");
    },
    get_record_attachments: () => {
      throw new Error("not mocked");
    },
  };
  return { ...base, ...overrides };
}

/**
 * Minimal repo mock for GuidesShell banner tests.
 * list_blueprints returns no summaries so onMount exits early (schemaError path),
 * then refreshValidation() runs unconditionally after the try/catch.
 */
function makeBaseRepo(overrides: Partial<SrsRepository> = {}): SrsRepository {
  return mockRepo({
    list_blueprints: () => ({ summaries: [] }),
    validate: () => ({
      diagnostics: [],
      summary: { checked: 0, errors: 0, warnings: 0 },
    }),
    ...overrides,
  });
}

const defaultProps = {
  repoName: "test.srsj",
  documentProvider: "local",
  onExport: vi.fn(),
  onOpenAnother: vi.fn(),
};

describe("GuidesShell — size warning banner", () => {
  it("shows the warning banner when validate returns warnings and no errors", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 5, errors: 0, warnings: 1 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    // Wait for mount — the "Open another file" button is always rendered
    await screen.findByRole("button", { name: /Open another file/i });
    const banner = container.querySelector(".size-warning-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("1 size warning");
  });

  it("suppresses the warning banner when errors are present (safety interlock)", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 5, errors: 1, warnings: 2 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });
    expect(container.querySelector(".size-warning-banner")).toBeNull();
  });

  it("shows no banner when there are no warnings", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 0, errors: 0, warnings: 0 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });
    expect(container.querySelector(".size-warning-banner")).toBeNull();
  });

  it("shows plural form for multiple warnings", async () => {
    const repo = makeBaseRepo({
      validate: () => ({
        diagnostics: [],
        summary: { checked: 5, errors: 0, warnings: 3 },
      }),
    });
    const { container } = render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });
    const banner = container.querySelector(".size-warning-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("3 size warnings");
  });
});

describe("GuidesShell — blueprint schema with non-fatal diagnostics", () => {
  const GUIDE_TYPE_ID = "8f138dd6-11d2-42a5-99ec-3d6e23bed54f";

  /** A usable guide blueprint schema (root $ref resolves; no section types). */
  function guideSchema() {
    return {
      properties: {
        root: { $ref: `#/definitions/${GUIDE_TYPE_ID}` },
        contains: { type: "array", items: { oneOf: [] } },
      },
      definitions: {
        [GUIDE_TYPE_ID]: { type: "object", properties: {} },
      },
    };
  }

  function guidesRepo(diagnostics: string[]): SrsRepository {
    return makeBaseRepo({
      list_blueprints: () => ({
        summaries: [{ id: "bp-guide", namespace: "com.mudemocracy", name: "guide", version: 1 }],
      }),
      blueprint_schema: () => ({ schema: guideSchema(), diagnostics }),
      list_types: () => [
        { id: GUIDE_TYPE_ID, namespace: "com.mudemocracy", name: "guide", version: 1 },
      ],
      list_compositions: () => [],
      list_records: () => [
        {
          instanceId: "guide-1",
          displayLabel: "My Guide",
          record: {
            instanceId: "guide-1",
            typeId: GUIDE_TYPE_ID,
            typeVersion: 1,
            typeNamespace: "com.mudemocracy",
            typeName: "guide",
            fieldValues: {},
          },
        },
      ],
      list_containers: () => [],
      order_by_precedes: (ids: string[]) => ids,
    });
  }

  it("still lists guides when blueprintSchema returns a non-fatal warning", async () => {
    // Regression: muSrs's guide blueprint uses cardinality "one-to-many", which the
    // WASM projection can't map to minItems/maxItems — it warns but still returns a
    // usable schema. The boot used to treat any diagnostic as fatal and return early,
    // blanking the editor ("No guides yet"). It must now log and continue.
    const repo = guidesRepo([
      "cardinality 'one-to-many' on relation 'contains' could not be parsed; minItems/maxItems omitted",
    ]);
    render(GuidesShell, { props: { repo, ...defaultProps } });
    await screen.findByRole("button", { name: /Open another file/i });

    const items = await screen.findAllByTestId("guides-guide-item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("My Guide");
    expect(screen.queryByText("No guides yet")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // srs-web#312 — document-mutation save-state gaps from PR #311 (bug 2)
  // ---------------------------------------------------------------------------

  const SECTION_TYPE_ID = "b1a4c9a2-8f3e-4a1a-9f2e-1a2b3c4d5e6f";

  function sectionRecord(instanceId: string, displayLabel: string) {
    return {
      instanceId,
      typeId: SECTION_TYPE_ID,
      typeVersion: 1,
      typeNamespace: "com.mudemocracy",
      typeName: "section",
      displayLabel,
      fieldValues: {},
    };
  }

  /** guidesRepo() plus enough to select a guide and render its sections. */
  function guidesRepoWithSections(diagnostics: string[] = []): SrsRepository {
    const base = guidesRepo(diagnostics);
    return {
      ...base,
      list_containers: () => [
        {
          containerId: "c-guide-1",
          title: "My Guide",
          memberInstanceIds: [],
          rootInstanceIds: ["guide-1"],
        },
      ],
      // resolve_container_view/order_by_precedes are typed `any` on SrsRepository
      // (raw WASM boundary — see src/lib/srs-client.ts) so no cast is needed here.
      resolve_container_view: () => ({
        containerId: "c-guide-1",
        root: {
          instanceId: "guide-1",
          tier: 0,
          displayLabel: "My Guide",
          record: {
            instanceId: "guide-1",
            typeId: GUIDE_TYPE_ID,
            typeVersion: 1,
            typeNamespace: "com.mudemocracy",
            typeName: "guide",
            fieldValues: {},
          },
        },
        members: [
          {
            instanceId: "sec-1",
            tier: 1,
            displayLabel: "Section One",
            record: sectionRecord("sec-1", "Section One"),
          },
          {
            instanceId: "sec-2",
            tier: 1,
            displayLabel: "Section Two",
            record: sectionRecord("sec-2", "Section Two"),
          },
        ],
        columns: [],
        excludeLifecycleStates: [],
        diagnostics: [],
      }),
      // order_by_precedes takes JSON `{ instanceIds }` and returns `{ orderedIds }`
      // (src/lib/srs-client.ts orderByPrecedes wrapper) — identity order here.
      order_by_precedes: (raw: string) => ({ orderedIds: JSON.parse(raw).instanceIds }),
    };
  }

  async function selectFirstGuide(): Promise<void> {
    const item = await screen.findByTestId("guides-guide-item");
    fireEvent.click(item);
  }

  it("disables the '+ New guide' button while saving", async () => {
    const repo = guidesRepoWithSections();
    const { rerender } = render(GuidesShell, {
      props: { repo, ...defaultProps, saving: false },
    });
    await screen.findByRole("button", { name: /Open another file/i });

    const newGuideBtn = (await screen.findByTestId("guides-new-guide")) as HTMLButtonElement;
    expect(newGuideBtn.disabled).toBe(false);

    await rerender({ saving: true });
    expect(newGuideBtn.disabled).toBe(true);

    await rerender({ saving: false });
    expect(newGuideBtn.disabled).toBe(false);
  });

  it("disables section move-up/move-down/remove controls while saving, and re-enables them once false", async () => {
    const repo = guidesRepoWithSections();
    const { rerender } = render(GuidesShell, {
      props: { repo, ...defaultProps, saving: false },
    });
    await screen.findByRole("button", { name: /Open another file/i });
    await selectFirstGuide();

    const sectionItems = await screen.findAllByTestId("guides-section-item");
    expect(sectionItems).toHaveLength(2);

    const downBtns = (await screen.findAllByTestId("guides-section-down")) as HTMLButtonElement[];
    const removeBtns = (await screen.findAllByTestId(
      "guides-section-remove"
    )) as HTMLButtonElement[];
    // The first row's "up" button is disabled by index bounds regardless of saving —
    // use the second row's "up" button, which is only bounds-guarded, not saving-guarded, at rest.
    const upBtns = (await screen.findAllByTestId("guides-section-up")) as HTMLButtonElement[];

    expect(upBtns[1].disabled).toBe(false);
    expect(downBtns[0].disabled).toBe(false);
    expect(removeBtns[0].disabled).toBe(false);

    await rerender({ saving: true });
    expect(upBtns[1].disabled).toBe(true);
    expect(downBtns[0].disabled).toBe(true);
    expect(removeBtns[0].disabled).toBe(true);
    // Index-bounds guard still holds independently of saving.
    expect(upBtns[0].disabled).toBe(true);

    await rerender({ saving: false });
    expect(upBtns[1].disabled).toBe(false);
    expect(downBtns[0].disabled).toBe(false);
    expect(removeBtns[0].disabled).toBe(false);
  });
});

describe("GuidesShell — read-only reason (srs-web#317)", () => {
  it("shows the reason instead of Save when onSave is undefined and a reason is given", async () => {
    const repo = makeBaseRepo();
    render(GuidesShell, {
      props: {
        repo,
        ...defaultProps,
        onSave: undefined,
        readOnlyReason: "This folder was opened read-only. Use Export to save your changes.",
      },
    });
    await screen.findByRole("button", { name: /Open another file/i });

    expect(screen.getByTestId("readonly-reason").textContent).toMatch(/read-only/);
    expect(screen.queryByTestId("save-document")).toBeNull();
  });

  it("shows Save, not the reason, when onSave is set", async () => {
    const repo = makeBaseRepo();
    render(GuidesShell, {
      props: {
        repo,
        ...defaultProps,
        onSave: vi.fn(),
        readOnlyReason: "should not render",
      },
    });
    await screen.findByRole("button", { name: /Open another file/i });

    expect(screen.getByTestId("save-document")).toBeTruthy();
    expect(screen.queryByTestId("readonly-reason")).toBeNull();
  });
});
