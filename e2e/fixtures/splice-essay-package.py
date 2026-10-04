"""Splice the essay package (muDemocracy.org muSrs/packages/essay, 1.3.0 = PR #258) into the e2e
.srsj fixtures, keeping their records (essay.srsj keeps its v1 document-state record, so the
v1 -> v2 upgrade is covered) and their extra package files (purpose type, core relation types).
Usage: python3 splice-essay-package.py [--replace] <path to a muSrs/packages/<name> dir> <fixture.srsj>...
Default merges (keeps the fixture's extras). --replace swaps the whole package for the published one
(every old package/ file and package.json key dropped), e.g. gallery.srsj <- muSrs/packages/governance (srs-web#399)."""
import json, pathlib, sys

replace = sys.argv[1] == "--replace"
args = sys.argv[2:] if replace else sys.argv[1:]
# --replace only: `--keep <dir>/<file>.json` keeps that file of the fixture's old package (fixture-specific
# composition, core relation types) and lists it in package.json.
keep = [args[i + 1] for i, a in enumerate(args) if a == "--keep"]
args = [a for i, a in enumerate(args) if a != "--keep" and (i == 0 or args[i - 1] != "--keep")]
LIST_KEY = {"compositions": "compositions", "relation-types": "relationTypes", "views": "views"}
pkg = pathlib.Path(args[0])
new = {f"package/{p.relative_to(pkg)}": json.loads(p.read_text()) for p in pkg.rglob("*.json")}
for f in args[1:]:
    doc = json.loads(pathlib.Path(f).read_text())
    data = doc["data"]
    old = data["package/package.json"]
    if replace:
        kept = {f"package/{r}": data[f"package/{r}"] for r in keep}
        for k in [k for k in data if k.startswith("package/")]:
            del data[k]
        data.update(new)
        data.update(kept)
        merged = dict(new["package/package.json"])
        for r in keep:
            key = LIST_KEY[r.split("/")[0]]
            merged[key] = merged.get(key, []) + [r]
        data["package/package.json"] = merged
        pathlib.Path(f).write_text(json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
        continue
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
