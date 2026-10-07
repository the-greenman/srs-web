/**
 * Synchronous UUIDv5 (RFC 4122, SHA-1). Deterministic ids let two tabs repairing the same essay
 * create the same container instead of two (srs-web#496). crypto.subtle is async, so SHA-1 is inline.
 */
function sha1(msg: Uint8Array): Uint8Array {
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const len = msg.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, len * 8, false);
  dv.setUint32(padded.length - 8, Math.floor((len * 8) / 2 ** 32), false);
  const w = new Array<number>(80);
  const rol = (x: number, n: number) => (x << n) | (x >>> (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const t = (rol(a, 5) + f + e + k + w[i]) | 0;
      [e, d, c, b, a] = [d, c, rol(b, 30), a, t];
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
  }
  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  h.forEach((x, i) => odv.setUint32(i * 4, x >>> 0, false));
  return out;
}

export function uuid5(namespace: string, name: string): string {
  const ns =
    namespace
      .replace(/-/g, "")
      .match(/../g)
      ?.map((x) => Number.parseInt(x, 16)) ?? [];
  const nm = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + nm.length);
  input.set(ns);
  input.set(nm, 16);
  const d = sha1(input).slice(0, 16);
  d[6] = (d[6] & 0x0f) | 0x50;
  d[8] = (d[8] & 0x3f) | 0x80;
  const hex = [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
