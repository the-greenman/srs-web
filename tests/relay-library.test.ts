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
  it.each(["http://relay.test", "ftp://x", "javascript:alert(1)", "https://u:p@x", "", "garbage", "https://x.test/#h"])(
    "rejects %s",
    (u) => expect(validateRelayUrl(u).ok).toBe(false)
  );
  it("normalises to the origin", () => {
    expect(validateRelayUrl("https://relay.test/")).toEqual({ ok: true, url: "https://relay.test" });
    expect(validateRelayUrl(" https://relay.test/v1 ")).toEqual({ ok: true, url: "https://relay.test" });
  });
});

describe("relay store", () => {
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
