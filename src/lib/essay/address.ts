/**
 * Paragraph addresses in the URL hash: `#e=<essayId>&p=<paragraphId>&z=<paragraphId>`
 * (p = scroll + focus, z = zoom). Ids are instance UUIDs. The hash is free of the OAuth
 * redirect (query string), so this is the only URL scheme the app uses; nothing else is touched.
 */
export type Address = { essayId?: string; paragraphId?: string; zoomId?: string };

export function parseAddress(hash: string): Address {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const get = (k: string) => q.get(k) || undefined;
  const out: Address = { essayId: get("e"), paragraphId: get("p"), zoomId: get("z") };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Address;
}

export function formatAddress(a: Address): string {
  const q = new URLSearchParams();
  if (a.essayId) q.set("e", a.essayId);
  if (a.paragraphId) q.set("p", a.paragraphId);
  if (a.zoomId) q.set("z", a.zoomId);
  const s = q.toString();
  return s ? `#${s}` : "";
}
