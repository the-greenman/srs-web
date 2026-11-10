# Builds e2e/fixtures/essay-images.srs (srs-web#764): an essay on the essay 1.11.0 package with a text
# paragraph and image paragraphs (PNG and SVG, full width and original size, left / centre / right),
# one with no attachment, and one whose SVG is HOSTILE (a script, an onload handler and an external
# reference). The core refuses that SVG at attach (srs-rust#1618, `svg-unsafe`), so it is attached here
# as a safe SVG and its bytes are then overwritten in the file tree, the hand-written repository the
# issue asks for. The tree goes into a `.srs` archive through the engine's own WASM export.
# The comments and essay bundles are the pinned ones (packages.lock.json), installed as the editor does.
# Usage: bash e2e/fixtures/build-essay-images-fixture.sh <out.srs>
# (run from the repo root after `npm run fetch-bindings`; srs CLI on PATH)
set -e
OUT=$(realpath -m "${1:?out.srs}"); rm -f "$OUT"
ROOT=$(pwd); T=$(mktemp -d); W=$T/essay
srs repo create --repo $W --namespace com.mudemocracy.essay --title "Essay images fixture" >/dev/null
for id in 9092f84e-fb94-4f81-a523-0f7ef5b02194 5b14a4d4-ec08-4e5b-be75-c183aec90c40; do
  srs package install --repo $W --bundle "$ROOT/src/lib/packages/$id.srspkg" | python3 -c 'import sys,json; d=json.load(sys.stdin); d.get("ok") or sys.exit(str(d))'
done
rec() { echo "$2" | srs record create --repo $W --type "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["record"]["instanceId"] if d.get("ok") else sys.exit(str(d)))'; }
cont() { echo "$1" | srs container create --repo $W | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["container"]["containerId"] if d.get("ok") else sys.exit(str(d)))'; }
att() { srs attachment add --repo $W --content-type "$2" "$1" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["payload"]["documentId"] if d.get("ok") else sys.exit(str(d)))'; }
link() { srs attachment link --repo $W "$1" "$2" | python3 -c 'import sys,json; d=json.load(sys.stdin); d.get("ok") or sys.exit(str(d))'; }
N=com.mudemocracy.essay

# A 480x240 PNG (blue with an orange band) and a 240x120 SVG (green with a white circle): no text, so
# the visual snapshots do not depend on fonts.
python3 - "$T" <<'EOF'
import struct, sys, zlib
w, h = 480, 240
row = lambda y: b"\0" + b"".join(b"\xf0\x8c\x28" if 80 <= y < 160 else b"\x1e\x50\xa0" for _ in range(w))
raw = b"".join(row(y) for y in range(h))
chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
open(f"{sys.argv[1]}/band.png", "wb").write(png)
svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" fill="#2e7d4f"/><circle cx="120" cy="60" r="40" fill="#ffffff"/></svg>'
open(f"{sys.argv[1]}/circle.svg", "w").write(svg)
open(f"{sys.argv[1]}/hostile.svg", "w").write(svg)
EOF

ES=$(rec $N/essay '{"fieldValues":{"title":"Pictures of democracy","summary":"A fixture essay with images."}}')
P1=$(rec $N/paragraph '{"fieldValues":{"paragraph_title":"Opening","body":"A paragraph of text before the pictures."}}')
img() { rec $N/image_paragraph "$1"; }
I1=$(img '{"fieldValues":{"paragraph_title":"Band","alt_text":"An orange band across a blue field","caption":"The band at full width"}}')
I2=$(img '{"fieldValues":{"alt_text":"The band at its own size, on the left","image_size":"original","image_align":"left"}}')
I3=$(img '{"fieldValues":{"alt_text":"A white circle on green","caption":"An SVG, centred","image_size":"original"}}')
I4=$(img '{"fieldValues":{"alt_text":"The circle at its own size, on the right","image_size":"original","image_align":"right"}}')
I5=$(img '{"fieldValues":{"alt_text":"The circle at full width","image_size":"full-width"}}')
I6=$(img '{"fieldValues":{"alt_text":"A hostile drawing","caption":"This SVG carries a script"}}')
I7=$(img '{"fieldValues":{"alt_text":"A picture that was never attached"}}')
PNG=$(att $T/band.png image/png); SVG=$(att $T/circle.svg image/svg+xml); BAD=$(att $T/hostile.svg image/svg+xml)
link $I1 $PNG; link $I2 $PNG; link $I3 $SVG; link $I4 $SVG; link $I5 $SVG; link $I6 $BAD
m() { for id in "$@"; do printf '{"instanceId":"%s"},' "$id"; done; }
M=$(m $ES $P1 $I1 $I2 $I3 $I4 $I5 $I6 $I7)
cont "{\"title\":\"Pictures of democracy\",\"anchorInstanceId\":\"$ES\",\"identityInstanceId\":\"$ES\",\"memberInstanceIds\":[${M%,}]}" >/dev/null
srs repo validate --repo $W | python3 -c "import sys,json; print(json.load(sys.stdin)[\"payload\"][\"summary\"])"

# The hand-written part: the hostile bytes replace the safe SVG the core accepted.
HOSTILE=$W/source-documents/hostile.svg
grep -q "$BAD" "$HOSTILE.meta.json" || { echo "hostile SVG is not $BAD" >&2; exit 1; }
cat > "$HOSTILE" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="120" onload="alert('svg-onload');console.log('HOSTILE-ONLOAD')"><script>alert('svg-script');console.log('HOSTILE-SCRIPT')</script><image xlink:href="https://example.com/track.png" width="10" height="10"/><rect width="240" height="120" fill="#a01e1e"/></svg>
EOF

node --input-type=module - "$W" "$OUT" "$ROOT" <<'EOF'
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
const [dir, out, root] = process.argv.slice(2);
const b = await import(path.join(root, "src/lib/srs_bindings/srs_bindings.js"));
b.initSync({ module: readFileSync(path.join(root, "src/lib/srs_bindings/srs_bindings_bg.wasm")) });
const files = {};
const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else files[path.relative(dir, p).split(path.sep).join("/")] = new Uint8Array(readFileSync(p)); } };
walk(dir);
writeFileSync(out, b.SrsRepository.load_tree(files).export_archive());
EOF
echo "wrote $OUT"
