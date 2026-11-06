import { describe, expect, it } from "vitest";
import { normalizeRepositoryNavigation } from "../src/lib/srs-client";

// RFC-029 Change D: a root container without identityInstanceId is valid, and the
// engine omits `identity`. The client must not turn that absence into a blank node.
describe("normalizeRepositoryNavigation identity", () => {
  it("passes an absent identity through as undefined", () => {
    const nav = normalizeRepositoryNavigation({ rootContainerId: "c1", sections: [] });
    expect(nav.identity).toBeUndefined();
    expect("identity" in nav && nav.identity !== undefined).toBe(false);
  });

  it("keeps a present identity, even with a blank label", () => {
    const nav = normalizeRepositoryNavigation({
      rootContainerId: "c1",
      identity: { instanceId: "i1", displayLabel: "" },
      sections: [],
    });
    expect(nav.identity?.instanceId).toBe("i1");
    expect(nav.identity?.displayLabel).toBe("");
  });
});
