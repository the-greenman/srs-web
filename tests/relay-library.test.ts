import { beforeEach, describe, expect, it } from "vitest";
import { createRelayStore, validateRelayUrl } from "../src/lib/relay-library";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
let s: ReturnType<typeof mem>;
const store = (o: Parameters<typeof createRelayStore>[1] = {}) => createRelayStore(() => s, o);
beforeEach(() => {
  s = mem();
});

describe("validateRelayUrl", () => {
  it.each(["https://relay.test", "http://localhost:8787", "http://127.0.0.1:8787"])("accepts %s", (u) => {
    expect(validateRelayUrl(u).ok).toBe(true);
  });
  it.each(["http://relay.test", "ftp://x", "javascript:alert(1)", "https://u:p@x", "", "garbage", "https://x.test/#h", "https://relay.test/v1", "https://relay.test/?a=1"])(
    "rejects %s",
    (u) => expect(validateRelayUrl(u).ok).toBe(false)
  );
  it("refuses a path or query with a clear error instead of truncating", () => {
    const r = validateRelayUrl("https://relay.test/v1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("no path or query");
  });
  it("normalises to the origin", () => {
    expect(validateRelayUrl("https://relay.test/")).toEqual({ ok: true, url: "https://relay.test" });
    expect(validateRelayUrl(" https://relay.test ")).toEqual({ ok: true, url: "https://relay.test" });
  });
});

describe("relay store", () => {
  it("applies the same normalisation to a stored library as to a committed one", () => {
    s.setItem(
      "srs-web.relays",
      JSON.stringify({
        relays: [
          { id: "relay:1", url: "https://a.test/", label: 7, isDefault: true },
          { id: "relay:2", url: "https://b.test", label: "B", isDefault: true },
          { id: "relay:3", url: "http://insecure.test", label: "bad" },
          { id: "relay:1", url: "https://dup.test" },
        ],
      })
    );
    expect(store({ env: "https://env.test" }).list()).toEqual([
      { id: "relay:1", url: "https://a.test", label: "a.test", isDefault: true },
      { id: "relay:2", url: "https://b.test", label: "B", isDefault: false },
    ]);
  });
  it("makes the first relay the default when a stored list has none", () => {
    s.setItem("srs-web.relays", JSON.stringify({ relays: [{ id: "r", url: "https://a.test", label: "A" }] }));
    expect(store().list()[0].isDefault).toBe(true);
  });
  it("rejects duplicates and labels default to the host", () => {
    const r = store();
    expect("relays" in r.add("", "https://relay.test") && r.list()[0].label).toBe("relay.test");
    expect(r.add("x", "https://relay.test/")).toEqual({ error: "That relay is already in the library." });
  });
  it("seeds from env then legacy key, once only; legacy key untouched", () => {
    s.setItem("srs-web.mcp-relay-url", "https://legacy.test");
    const l = store({ env: "https://env.test" }).list();
    expect(l.map((r) => [r.url, r.isDefault])).toEqual([["https://env.test", true], ["https://legacy.test", false]]);
    expect(s.getItem("srs-web.mcp-relay-url")).toBe("https://legacy.test");
    const r = store({ env: "https://env.test" });
    r.remove(l[0].id);
    r.remove(l[1].id);
    expect(store({ env: "https://env.test" }).list()).toEqual([]); // deletion sticks
    expect(store({ env: "https://other.test" }).list()).toEqual([]); // changed env does not re-seed
  });
  it("skips an invalid seed", () => {
    expect(store({ env: "http://insecure.test" }).list()).toEqual([]);
  });
  it("keeps exactly one default", () => {
    const r = store();
    r.add("a", "https://a.test");
    r.add("b", "https://b.test");
    const [a, b] = r.list();
    expect([a.isDefault, b.isDefault]).toEqual([true, false]);
    expect(r.setDefault(b.id).map((x) => x.isDefault)).toEqual([false, true]);
    const left = r.remove(b.id);
    expect("relays" in left && left.relays.map((x) => x.isDefault)).toEqual([true]);
  });
  it("blocks remove and url edit while agents use the relay; label still editable", () => {
    const r = store({ usedBy: () => 2 });
    r.add("a", "https://a.test");
    const [a] = r.list();
    expect(r.remove(a.id)).toEqual({ error: "Forget its 2 agents first." });
    expect("error" in r.update(a.id, { url: "https://b.test" })).toBe(true);
    expect(r.list()[0].url).toBe("https://a.test");
    r.update(a.id, { label: "Renamed" });
    expect(r.get(a.id)?.label).toBe("Renamed");
  });
  it("a throwing storage never throws and keeps ids stable", () => {
    const boom = () => {
      throw new Error("denied");
    };
    const r = createRelayStore(boom, { env: "https://env.test" });
    const [a] = r.list();
    expect(r.list()[0].id).toBe(a.id);
    expect("relays" in r.add("x", "https://x.test")).toBe(true);
  });
});

it("reload() on the relays key re-reads storage; other keys are ignored (#394)", async () => {
  const { createRelayStore, KEY } = await import("../src/lib/relay-library");
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  const a = createRelayStore(() => s);
  a.add("A", "https://a.test");
  createRelayStore(() => s).add("B", "https://b.test");
  expect(a.reload("x")).toBe(false);
  expect(a.list()).toHaveLength(1);
  expect(a.reload(KEY)).toBe(true);
  expect(a.list()).toHaveLength(2);
});
