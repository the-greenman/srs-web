"""Splice the essay package (muDemocracy.org muSrs/packages/essay, 1.3.0 = PR #258) into the e2e
.srsj fixtures, keeping their records (essay.srsj keeps its v1 document-state record, so the
v1 -> v2 upgrade is covered) and their extra package files (purpose type, core relation types).
Usage: python3 splice-essay-package.py <path to muSrs/packages/essay> <fixture.srsj>..."""
import json, pathlib, sys

pkg = pathlib.Path(sys.argv[1])
new = {f"package/{p.relative_to(pkg)}": json.loads(p.read_text()) for p in pkg.rglob("*.json")}
for f in sys.argv[2:]:
    doc = json.loads(pathlib.Path(f).read_text())
    data = doc["data"]
    old = data["package/package.json"]
    for k in [k for k in data if k.startswith("package/") and k != "package/package.json"]:
        if k in new:
            del data[k]  # replaced below
    data.update({k: v for k, v in new.items() if k != "package/package.json"})
    merged = dict(new["package/package.json"])
    for key in ("fields", "types", "relationTypes"):  # keep the fixture's extras (purpose, core relation types)
        merged[key] = merged[key] + [x for x in old[key] if x not in merged[key]]
    for key in ("lifecycles", "protocols", "themes", "vocabularies"):
        merged[key] = old.get(key, [])
    data["package/package.json"] = merged
    pathlib.Path(f).write_text(json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
