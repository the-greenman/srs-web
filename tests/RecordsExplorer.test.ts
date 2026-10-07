// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecordsExplorer from "../src/lib/generic/RecordsExplorer.svelte";
import RelationMap from "../src/lib/generic/RelationMap.svelte";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  neighbours: vi.fn(),
  listRelations: vi.fn(() => []),
  resolveContainerView: vi.fn(() => ({ members: [] })),
}));
vi.mock("../src/lib/srs-client.js", () => mocks);

const hit = (id: string, typeName = "concept") => ({
  instanceId: id,
  label: `Label \`${id}\``,
  typeNamespace: "ns",
  typeName,
  matchedFields: [],
});
const hits = (n: number, from = 0, typeName?: string) =>
  Array.from({ length: n }, (_, i) => hit(`r${from + i}`, typeName));
const facets = {
  byType: [
    { value: "ns/concept", typeId: "t-concept", count: 120 },
    { value: "ns/rfc", typeId: "t-rfc", count: 30 },
  ],
  otherTypes: 0,
  notes: 4,
};

/** A fake core: 154 records, 4 of them notes. Honours typeId, tier, contentMatch, limit and offset. */
function fakeFind(
  query: { typeId?: string; tier?: number; contentMatch?: string },
  opts: { limit?: number; offset?: number } = {}
) {
  const all = query.contentMatch
    ? hits(7, 0)
    : query.typeId === "t-concept"
      ? hits(120, 0)
      : query.typeId === "t-rfc"
        ? hits(30, 200)
        : query.tier === 0
          ? hits(4, 300, "")
          : hits(154);
  const offset = opts.offset ?? 0;
  return {
    hits: all.slice(offset, offset + (opts.limit ?? all.length)),
    total: all.length,
    facets,
    diagnostics: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.find.mockImplementation((_repo: unknown, q: object, o: object) => fakeFind(q, o));
});

const props = { repo: {} as never, documentKey: "k", onOpen: vi.fn() };

describe("RecordsExplorer", () => {
  it("groups a large repository by type from the facet: collapsed, with counts and a Notes group", async () => {
    render(RecordsExplorer, { props });

    const groups = await screen.findAllByTestId("record-group");
    expect(groups.map((g) => g.querySelector("strong")?.textContent)).toEqual([
      "concept",
      "rfc",
      "Notes",
    ]);
    expect(groups[0].textContent).toContain("120");
    expect(screen.getByText("154 records")).toBeTruthy();
    expect(screen.queryAllByTestId("record-row")).toHaveLength(0);
    // the facet is asked for every type, once the page is a count source
    expect(mocks.find.mock.calls[0][2]).toMatchObject({ byTypeLimit: 0, facets: true });
  });

  it("opens a group to 50 rows with backticks stripped, and Show more pages by 50", async () => {
    render(RecordsExplorer, { props });
    const [concept] = await screen.findAllByTestId("record-group");

    await fireEvent.click(concept.querySelector("button") as HTMLElement);
    expect(screen.getAllByTestId("record-row")).toHaveLength(50);
    expect(screen.getAllByText("Label r0").length).toBeGreaterThan(0);

    await fireEvent.click(screen.getByTestId("group-more"));
    expect(screen.getAllByTestId("record-row")).toHaveLength(100);
    expect(mocks.find).toHaveBeenLastCalledWith(
      expect.anything(),
      { containerId: undefined, typeId: "t-concept" },
      { limit: 50, offset: 50 }
    );
  });

  it("reaches notes through the core's tier filter", async () => {
    render(RecordsExplorer, { props });
    const groups = await screen.findAllByTestId("record-group");

    await fireEvent.click(groups[2].querySelector("button") as HTMLElement);

    expect(mocks.find).toHaveBeenLastCalledWith(
      expect.anything(),
      { containerId: undefined, tier: 0 },
      { limit: 50 }
    );
    expect(screen.getAllByTestId("record-row")).toHaveLength(4);
  });

  it("offers only non-empty types in the filter, with counts", async () => {
    render(RecordsExplorer, { props });
    await screen.findAllByTestId("record-group");
    const select = screen.getByLabelText("Filter records by type") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      "All types",
      "ns/concept (120)",
      "ns/rfc (30)",
      "Notes (4)",
    ]);
    // choosing an option is covered in e2e/large-repo.spec.ts (happy-dom has no :checked for the select binding)
  });

  it("debounces search, ranks it, and reads N results", async () => {
    vi.useFakeTimers();
    try {
      render(RecordsExplorer, { props });
      await vi.advanceTimersByTimeAsync(250);
      mocks.find.mockClear();

      const input = screen.getByLabelText("Search records");
      await fireEvent.input(input, { target: { value: "ab" } });
      await fireEvent.input(input, { target: { value: "abc" } });
      await vi.advanceTimersByTimeAsync(100);
      expect(mocks.find).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(150);

      const searches = mocks.find.mock.calls.filter(([, q]) => q.contentMatch);
      expect(searches).toHaveLength(1);
      expect(searches[0][1].contentMatch).toBe("abc");
      expect(searches[0][2]).toMatchObject({ rank: true, limit: 50 });
      expect(screen.getByText("7 results")).toBeTruthy();
      expect(screen.queryAllByTestId("record-group")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a plain list when everything fits one page", async () => {
    mocks.find.mockImplementation(() => ({ hits: hits(7), total: 7, facets, diagnostics: [] }));
    render(RecordsExplorer, { props });

    expect(await screen.findAllByTestId("record-row")).toHaveLength(7);
    expect(screen.getByText("7 records")).toBeTruthy();
  });
});

describe("RelationMap", () => {
  const edge = (i: number) => ({
    direction: i % 3 === 0 ? "in" : "out",
    relationId: `e${i}`,
    relationType: "contains",
    neighbour: { instanceId: `n${i}`, label: `Neighbour ${i}` },
  });
  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => edge(from + i));

  it("asks for 12 neighbours, never reads a record, and pages the rest from 'N more'", async () => {
    mocks.neighbours.mockImplementation(
      (_r: unknown, _id: string, o: { limit: number; offset: number }) => ({
        instanceId: "hub",
        total: 30,
        neighbours: page(o.offset, Math.min(o.limit, 30 - o.offset)),
      })
    );
    render(RelationMap, {
      props: {
        repo: {} as never,
        selected: { id: "hub", label: "Hub" },
        containerId: null,
        onOpen: vi.fn(),
      },
    });

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Inbound|Outbound/ })).toHaveLength(12)
    );
    expect(mocks.neighbours).toHaveBeenCalledWith(expect.anything(), "hub", {
      limit: 12,
      offset: 0,
    });
    expect(screen.getByTestId("graph-legend").textContent).toContain("contains");

    await fireEvent.click(screen.getByTestId("map-more"));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Inbound|Outbound/ })).toHaveLength(24)
    );
    expect(screen.getByTestId("map-more").textContent).toContain("6 more");
  });

  it("caps container mode at the first 24 members and says so, without loading the relation set", async () => {
    mocks.resolveContainerView.mockReturnValue({
      members: Array.from({ length: 41 }, (_, i) => ({
        instanceId: `m${i}`,
        displayLabel: `M${i}`,
      })),
    } as never);
    mocks.neighbours.mockReturnValue({ instanceId: "x", total: 0, neighbours: [] });
    render(RelationMap, {
      props: { repo: {} as never, selected: null, containerId: "c1", onOpen: vi.fn() },
    });

    expect(
      await screen.findByText(/Showing 24 of 41 records, select a record to explore/)
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Inspect/ })).toHaveLength(24);
    expect(mocks.listRelations).not.toHaveBeenCalled();
  });

  it("labels note members as nodes, and shows a failed container read as an error (srs-web#483)", async () => {
    mocks.resolveContainerView.mockReturnValueOnce({
      members: [
        { instanceId: "n1", tier: 0, displayLabel: "A note" },
        { instanceId: "r1", tier: 2, displayLabel: "A record", record: {} },
      ],
    } as never);
    mocks.neighbours.mockReturnValue({ instanceId: "x", total: 0, neighbours: [] });
    const { unmount } = render(RelationMap, {
      props: { repo: {} as never, selected: null, containerId: "c1", onOpen: vi.fn() },
    });
    expect(await screen.findByRole("button", { name: /^Inspect A note/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Inspect A record/ })).toBeTruthy();
    unmount();

    mocks.resolveContainerView.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    render(RelationMap, {
      props: { repo: {} as never, selected: null, containerId: "c2", onOpen: vi.fn() },
    });
    expect(await screen.findByText("boom")).toBeTruthy();
    expect(screen.queryByText("No records match this scope.")).toBeNull();
  });

  it("prompts for a record when there is no scope", async () => {
    render(RelationMap, {
      props: { repo: {} as never, selected: null, containerId: null, onOpen: vi.fn() },
    });
    expect(screen.getByText("Select a record to see its relations.")).toBeTruthy();
  });
});
